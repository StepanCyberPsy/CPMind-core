import { stat } from 'node:fs/promises';
import { getDb, withTransaction } from './db/index.js';
import {
    createAsset,
    findAssetBySha256,
    getProcessingCreativeVersion,
    getUploadSession,
    linkAssetToCreativeVersion,
    setCreativeVersionFailed,
    setCreativeVersionReady,
    setProcessingJobFailed,
    setProcessingJobReady,
    setUploadSessionFailed,
    setUploadSessionProcessing,
    setUploadSessionReady,
    type AssetRow,
    type ProcessingJobRow,
} from './db/queries.js';
import {
    downloadFromStaging,
    deleteFromStaging,
} from './storage/staging.js';
import { uploadProcessedFile } from './storage/assets.js';
import { computeFileSha256 } from './hashing/sha256.js';
import {
    detectMime,
    isAllowedMime,
} from './detection/mime.js';
import { processStaticImage } from './processing/static.js';
import { processGif } from './processing/gif.js';
import { processSvg } from './processing/svg.js';
import { processHtml5 } from './processing/html5.js';
import { processVideo } from './processing/video.js';
import { deliveryAssetKey } from './storage/keys.js';
import { createLogger } from './logger.js';
import {
    ProcessingError,
    type ProcessedFile,
    type ProcessingResult,
} from './types.js';

const logger = createLogger('jobs');

type Processor = (
    localPath: string,
    tempDir: string,
    signal: AbortSignal,
) => Promise<ProcessingResult>;

interface PreparedProcessedFile {
    file: ProcessedFile;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
}

const MIME_TO_PROCESSOR: Readonly<
    Record<string, Processor>
> = {
    'image/jpeg': processStaticImage,
    'image/png': processStaticImage,
    'image/webp': processStaticImage,
    'image/gif': processGif,
    'image/svg+xml': processSvg,
    'application/zip': processHtml5,
    'video/mp4': processVideo,
    'video/quicktime': processVideo,
    'video/x-msvideo': processVideo,
    'video/webm': processVideo,
};

const CREATIVE_TYPE_MIMES: Readonly<
    Record<string, ReadonlySet<string>>
> = {
    banner_static: new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/svg+xml',
    ]),
    banner_gif: new Set([
        'image/gif',
    ]),
    banner_html5: new Set([
        'application/zip',
    ]),
    video_creative: new Set([
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
    ]),
};

function assertCreativeTypeMatchesMime(
    creativeType: string,
    detectedMime: string,
): void {
    const allowed = CREATIVE_TYPE_MIMES[
        creativeType
    ];

    if (
        !allowed ||
        !allowed.has(detectedMime)
    ) {
        throw new ProcessingError(
            'CREATIVE_TYPE_MISMATCH',
            `${creativeType}:${detectedMime}`,
        );
    }
}

function assertProcessingResult(
    result: ProcessingResult,
): void {
    if (result.files.length === 0) {
        throw new ProcessingError(
            'PROCESSING_OUTPUT_INVALID',
            'Processor returned no files',
        );
    }

    const anchorFiles = result.files.filter(
        (file) => file.role === 'source' || file.role === 'primary',
    );

    if (anchorFiles.length !== 1) {
        throw new ProcessingError(
            'PROCESSING_OUTPUT_INVALID',
            'Processor must return exactly one anchor asset (source or primary)',
        );
    }

    const paths = new Set<string>();

    for (const file of result.files) {
        if (
            file.localPath === '' ||
            file.mimeType === '' ||
            file.extension === '' ||
            file.role === ''
        ) {
            throw new ProcessingError(
                'PROCESSING_OUTPUT_INVALID',
                'Processed file metadata is incomplete',
            );
        }

        if (
            !Number.isSafeInteger(file.priority) ||
            file.priority < 0
        ) {
            throw new ProcessingError(
                'PROCESSING_OUTPUT_INVALID',
                'Processed file priority is invalid',
            );
        }

        if (paths.has(file.localPath)) {
            throw new ProcessingError(
                'PROCESSING_OUTPUT_INVALID',
                `Duplicate processed path: ${file.localPath}`,
            );
        }

        paths.add(file.localPath);
    }
}

function assertExistingAssetCompatible(
    asset: AssetRow,
    prepared: PreparedProcessedFile,
): void {
    if (asset.status === 'failed') {
        throw new ProcessingError(
            'ASSET_INTEGRITY_CONFLICT',
            `Existing asset is failed: ${asset.id}`,
        );
    }

    if (asset.status !== 'ready') {
        throw new Error(
            `Existing asset is not ready: ${asset.id}`,
        );
    }

    if (
        asset.sha256 !== prepared.sha256 ||
        asset.sizeBytes !== prepared.sizeBytes ||
        asset.mimeType !== prepared.file.mimeType
    ) {
        throw new ProcessingError(
            'ASSET_INTEGRITY_CONFLICT',
            `SHA-256 asset metadata mismatch: ${prepared.sha256}`,
        );
    }
}

async function prepareProcessedFiles(
    files: ProcessedFile[],
    signal: AbortSignal,
): Promise<PreparedProcessedFile[]> {
    const db = getDb();
    const prepared: PreparedProcessedFile[] = [];

    for (const file of files) {
        signal.throwIfAborted();

        const fileStat = await stat(file.localPath);

        if (!fileStat.isFile()) {
            throw new ProcessingError(
                'PROCESSING_OUTPUT_INVALID',
                `Processed path is not a file: ${file.localPath}`,
            );
        }

        if (fileStat.size <= 0) {
            throw new ProcessingError(
                'PROCESSING_OUTPUT_INVALID',
                `Processed file is empty: ${file.localPath}`,
            );
        }

        const sha256 = await computeFileSha256(
            file.localPath,
        );

        const storageKey = deliveryAssetKey(
            sha256,
            file.extension,
        );

        const item: PreparedProcessedFile = {
            file,
            sha256,
            sizeBytes: fileStat.size,
            storageKey,
        };

        const existing = await findAssetBySha256(
            db,
            sha256,
        );

        if (existing) {
            assertExistingAssetCompatible(
                existing,
                item,
            );

            prepared.push({
                ...item,
                storageKey: existing.storageKey,
            });

            continue;
        }

        signal.throwIfAborted();

        await uploadProcessedFile(
            file.localPath,
            storageKey,
            file.mimeType,
        );

        prepared.push(item);
    }

    return prepared;
}

async function publishProcessedFiles(
    job: ProcessingJobRow,
    workerId: string,
    prepared: PreparedProcessedFile[],
): Promise<void> {
    await withTransaction(async (tx) => {
        let sourceAssetId: string | null = null;

        for (const item of prepared) {
            const asset = await createAsset(
                tx,
                {
                    sha256: item.sha256,
                    mimeType: item.file.mimeType,
                    extension: item.file.extension,
                    sizeBytes: item.sizeBytes,
                    storageKey: item.storageKey,
                    assetClass: item.file.assetClass,
                    width: item.file.width ?? null,
                    height: item.file.height ?? null,
                    durationSec:
                        item.file.durationSec ?? null,
                    codec:
                        item.file.codec ?? null,
                    bitrateBps:
                        item.file.bitrateBps ?? null,
                    status: 'ready',
                    processingProfileVersion:
                        job.processingProfileVersion,
                },
            );

            assertExistingAssetCompatible(
                asset,
                item,
            );

            await linkAssetToCreativeVersion(
                tx,
                job.creativeVersionId,
                asset.id,
                item.file.role,
                item.file.priority,
            );

            if (item.file.role === 'source' || item.file.role === 'primary') {
                if (sourceAssetId !== null) {
                    throw new ProcessingError(
                        'PROCESSING_OUTPUT_INVALID',
                        'Multiple anchor assets detected',
                    );
                }

                sourceAssetId = asset.id;
            }
        }

        if (sourceAssetId === null) {
            throw new ProcessingError(
                'PROCESSING_OUTPUT_INVALID',
                'Source asset was not published',
            );
        }

        await setCreativeVersionReady(
            tx,
            job.creativeVersionId,
            sourceAssetId,
        );

        await setUploadSessionReady(
            tx,
            job.uploadSessionId,
        );

        await setProcessingJobReady(
            tx,
            job.id,
            workerId,
        );
    });
}

async function deleteStagingBestEffort(
    stagingKey: string,
    context: Record<string, unknown>,
): Promise<void> {
    try {
        await deleteFromStaging(stagingKey);
    } catch (err) {
        logger.warn(
            {
                err,
                ...context,
            },
            'Staging object cleanup failed',
        );
    }
}

export function isPermanentProcessingError(
    err: unknown,
): err is ProcessingError {
    return err instanceof ProcessingError;
}

export function formatProcessingError(
    err: unknown,
): string {
    const message = err instanceof Error
        ? err.message
        : String(err);

    const value = err instanceof ProcessingError
        ? `${err.code}: ${message}`
        : message;

    return value.slice(0, 4_096);
}

export async function processJob(
    job: ProcessingJobRow,
    workerId: string,
    tempDir: string,
    signal: AbortSignal,
): Promise<void> {
    const db = getDb();

    signal.throwIfAborted();

    const session = await getUploadSession(
        db,
        job.uploadSessionId,
    );

    const creativeVersion =
        await getProcessingCreativeVersion(
            db,
            job.creativeVersionId,
        );

    if (!session.creativeId) {
        throw new ProcessingError(
            'NO_CREATIVE_ID',
            'Upload session has no creative_id',
        );
    }

    if (
        creativeVersion.creativeId !==
        session.creativeId
    ) {
        throw new ProcessingError(
            'JOB_CONTEXT_MISMATCH',
            'Creative version does not belong to upload session creative',
        );
    }

    await setUploadSessionProcessing(
        db,
        job.uploadSessionId,
    );

    signal.throwIfAborted();

    const localPath = await downloadFromStaging(
        session.stagingKey,
        tempDir,
    );

    signal.throwIfAborted();

    const detectedMime = await detectMime(
        localPath,
        session.declaredMime,
    );

    if (!isAllowedMime(detectedMime)) {
        throw new ProcessingError(
            'MIME_NOT_ALLOWED',
            detectedMime,
        );
    }

    assertCreativeTypeMatchesMime(
        session.creativeType,
        detectedMime,
    );

    const sourceSha256 = await computeFileSha256(
        localPath,
    );

    const processor = MIME_TO_PROCESSOR[
        detectedMime
    ];

    if (!processor) {
        throw new ProcessingError(
            'MIME_NOT_ALLOWED',
            detectedMime,
        );
    }

    signal.throwIfAborted();

    const result = await processor(
        localPath,
        tempDir,
        signal,
    );

    assertProcessingResult(result);

    signal.throwIfAborted();

    const prepared = await prepareProcessedFiles(
        result.files,
        signal,
    );

    signal.throwIfAborted();

    await publishProcessedFiles(
        job,
        workerId,
        prepared,
    );

    await deleteStagingBestEffort(
        session.stagingKey,
        {
            jobId: job.id,
            uploadSessionId: job.uploadSessionId,
        },
    );

    logger.info(
        {
            jobId: job.id,
            uploadSessionId: job.uploadSessionId,
            creativeVersionId:
                job.creativeVersionId,
            sourceSha256,
            processingProfileVersion:
                job.processingProfileVersion,
            assetCount: prepared.length,
        },
        'Media processing pipeline completed',
    );
}

export async function finalizeTerminalProcessingFailure(
    job: ProcessingJobRow,
    workerId: string,
    error: string,
): Promise<void> {
    const db = getDb();

    const session = await getUploadSession(
        db,
        job.uploadSessionId,
    );

    await withTransaction(async (tx) => {
        await setCreativeVersionFailed(
            tx,
            job.creativeVersionId,
            error,
        );

        await setUploadSessionFailed(
            tx,
            job.uploadSessionId,
            error,
        );

        await setProcessingJobFailed(
            tx,
            job.id,
            workerId,
            error,
        );
    });

    await deleteStagingBestEffort(
        session.stagingKey,
        {
            jobId: job.id,
            uploadSessionId: job.uploadSessionId,
        },
    );
}