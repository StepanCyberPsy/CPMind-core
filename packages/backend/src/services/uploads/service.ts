import { randomUUID } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    uploadSessions,
    creatives,
    creativeVersions,
    creativeProcessingJobs,
    campaigns,
} from '../../db/schema.js';
import { stagingObjectKey } from '../storage/keys.js';
import {
    createSinglePresignedUrl,
    initMultipartUpload,
    MULTIPART_THRESHOLD_BYTES,
    PRESIGNED_TTL_SECONDS,
} from './presign.js';
import {
    completeMultipartUpload,
    abortMultipartUpload,
} from './multipart.js';
import type {
    CreateUploadPayload,
    UploadSessionResponse,
    CompleteUploadPayload,
} from '@cpmind/shared';

const PROCESSING_PROFILE_VERSION = 'v1.0';

function generateCreativeKey(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
}

function creativeNameFromFilename(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

export interface UploadSessionStatus {
    uploadId: string;
    status: string;
    processingError: string | null;
    creativeVersionUuid: string | null;
    expiresAt: string | null;
}

export async function createUploadSession(
    payload: CreateUploadPayload,
    userId: number,
): Promise<UploadSessionResponse | null> {
    const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(
            and(
                eq(campaigns.uuid, payload.campaignUuid),
                eq(campaigns.userId, userId),
                eq(campaigns.status, 'active'),
            ),
        )
        .limit(1);

    if (!campaign) return null;

    // Pre-generate session uuid чтобы использовать в staging key до insert
    const sessionUuid = randomUUID();
    const stagingKey = stagingObjectKey(sessionUuid, payload.filename);
    const expiresAt = new Date(Date.now() + PRESIGNED_TTL_SECONDS * 1000);

    // Создаём creative с retry на collision в creative_key
    let creative: { id: string } | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
        const creativeKey = generateCreativeKey();
        const [created] = await db
            .insert(creatives)
            .values({
                userId,
                campaignId: campaign.id,
                creativeKey,
                creativeType: payload.creativeType,
                name: creativeNameFromFilename(payload.filename),
                status: 'draft',
            })
            .onConflictDoNothing()
            .returning({ id: creatives.id });
        if (created) { creative = created; break; }
    }

    if (!creative) {
        throw new Error('Failed to generate unique creative key after retries');
    }

    const [creativeVersion] = await db
        .insert(creativeVersions)
        .values({
            creativeId: creative.id,
            version: 1,
            status: 'draft',
        })
        .returning({ uuid: creativeVersions.uuid });

    if (!creativeVersion) {
        throw new Error('Failed to create creative version');
    }

    const isMultipart = payload.sizeBytes >= MULTIPART_THRESHOLD_BYTES;

    if (isMultipart) {
        const { multipartUploadId, parts } = await initMultipartUpload(
            stagingKey,
            payload.sizeBytes,
            payload.mimeType,
        );

        try {
            await db.insert(uploadSessions).values({
                uuid: sessionUuid,
                userId,
                campaignId: campaign.id,
                creativeId: creative.id,
                creativeType: payload.creativeType,
                stagingKey,
                originalFilename: payload.filename,
                declaredMime: payload.mimeType,
                sizeBytes: payload.sizeBytes,
                status: 'created',
                multipartUploadId,
                expiresAt,
            });
        } catch (err) {
            // DB failure после S3 initiation — abort multipart best-effort
            await abortMultipartUpload(stagingKey, multipartUploadId).catch(() => undefined);
            throw err;
        }

        return {
            uploadId: sessionUuid,
            strategy: 'multipart',
            parts,
            expiresAt: expiresAt.toISOString(),
        };
    }

    const uploadUrl = await createSinglePresignedUrl(
        stagingKey,
        payload.sizeBytes,
        payload.mimeType,
    );

    await db.insert(uploadSessions).values({
        uuid: sessionUuid,
        userId,
        campaignId: campaign.id,
        creativeId: creative.id,
        creativeType: payload.creativeType,
        stagingKey,
        originalFilename: payload.filename,
        declaredMime: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        status: 'created',
        expiresAt,
    });

    return {
        uploadId: sessionUuid,
        strategy: 'single',
        uploadUrl,
        expiresAt: expiresAt.toISOString(),
    };
}

export async function completeUploadSession(
    sessionUuid: string,
    userId: number,
    payload: CompleteUploadPayload | null,
): Promise<boolean> {
    const [session] = await db
        .select({
            id: uploadSessions.id,
            stagingKey: uploadSessions.stagingKey,
            multipartUploadId: uploadSessions.multipartUploadId,
            status: uploadSessions.status,
            creativeId: uploadSessions.creativeId,
        })
        .from(uploadSessions)
        .where(
            and(
                eq(uploadSessions.uuid, sessionUuid),
                eq(uploadSessions.userId, userId),
            ),
        )
        .limit(1);

    if (!session) return false;

    if (!['created', 'uploading'].includes(session.status)) {
        return false;
    }

    if (session.multipartUploadId) {
        if (!payload || payload.parts.length === 0) {
            throw new Error('Parts required for multipart upload completion');
        }
        await completeMultipartUpload(
            session.stagingKey,
            session.multipartUploadId,
            payload.parts,
        );
    }

    if (!session.creativeId) {
        throw new Error('Upload session has no associated creative');
    }

    const [creativeVersion] = await db
        .select({ id: creativeVersions.id })
        .from(creativeVersions)
        .where(
            and(
                eq(creativeVersions.creativeId, session.creativeId),
                eq(creativeVersions.status, 'draft'),
            ),
        )
        .limit(1);

    if (!creativeVersion) {
        throw new Error('No draft creative version found for session');
    }

    await db.transaction(async (tx) => {
        await tx
            .update(uploadSessions)
            .set({ status: 'processing' })
            .where(eq(uploadSessions.id, session.id));

        await tx
            .update(creativeVersions)
            .set({ status: 'processing' })
            .where(eq(creativeVersions.id, creativeVersion.id));

        await tx
            .update(creatives)
            .set({ status: 'processing', updatedAt: new Date() })
            .where(eq(creatives.id, session.creativeId!));

        await tx.insert(creativeProcessingJobs).values({
            uploadSessionId: session.id,
            creativeVersionId: creativeVersion.id,
            processingProfileVersion: PROCESSING_PROFILE_VERSION,
            status: 'pending',
        });
    });

    return true;
}

export async function getUploadSessionStatus(
    sessionUuid: string,
    userId: number,
): Promise<UploadSessionStatus | null> {
    const [session] = await db
        .select({
            status: uploadSessions.status,
            processingError: uploadSessions.processingError,
            expiresAt: uploadSessions.expiresAt,
            creativeId: uploadSessions.creativeId,
        })
        .from(uploadSessions)
        .where(
            and(
                eq(uploadSessions.uuid, sessionUuid),
                eq(uploadSessions.userId, userId),
            ),
        )
        .limit(1);

    if (!session) return null;

    let creativeVersionUuid: string | null = null;

    if (session.creativeId) {
        const [latestVersion] = await db
            .select({
                uuid: creativeVersions.uuid,
                status: creativeVersions.status,
            })
            .from(creativeVersions)
            .where(eq(creativeVersions.creativeId, session.creativeId))
            .orderBy(desc(creativeVersions.version))
            .limit(1);

        // Возвращаем uuid при ready и failed — frontend останавливает polling в обоих случаях
        if (
            latestVersion?.status === 'ready' ||
            latestVersion?.status === 'failed'
        ) {
            creativeVersionUuid = latestVersion.uuid;
        }
    }

    return {
        uploadId: sessionUuid,
        status: session.status,
        processingError: session.processingError,
        creativeVersionUuid,
        expiresAt: session.expiresAt?.toISOString() ?? null,
    };
}