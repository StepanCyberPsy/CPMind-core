import type { QueryResultRow } from 'pg';
import type {
    AssetClass,
    AssetStatus,
    CreativeType,
    UploadStatus,
} from '@cpmind/shared';
import type { DbExecutor } from './index.js';

export type ProcessingJobStatus =
    | 'pending'
    | 'processing'
    | 'ready'
    | 'failed';

export type CreativeVersionStatus =
    | 'draft'
    | 'processing'
    | 'ready'
    | 'archived'
    | 'failed';

export interface UploadSessionRow extends QueryResultRow {
    id: string;
    uuid: string;
    userId: number;
    campaignId: string;
    creativeId: string | null;
    creativeType: CreativeType;
    stagingKey: string;
    originalFilename: string;
    declaredMime: string;
    sizeBytes: number;
    status: UploadStatus;
    multipartUploadId: string | null;
    processingError: string | null;
    createdAt: Date;
    completedAt: Date | null;
    expiresAt: Date;
}

export interface CreativeVersionRow extends QueryResultRow {
    id: string;
    uuid: string;
    creativeId: string;
    version: number;
    sourceAssetId: string | null;
    status: CreativeVersionStatus;
    processingError: string | null;
    createdAt: Date;
    readyAt: Date | null;
    archivedAt: Date | null;
}

export interface AssetRow extends QueryResultRow {
    id: string;
    sha256: string;
    mimeType: string;
    extension: string;
    sizeBytes: number;
    storageKey: string;
    assetClass: AssetClass;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    codec: string | null;
    bitrateBps: number | null;
    status: AssetStatus;
    processingProfileVersion: string | null;
    createdAt: Date;
}

export interface AssetInsert {
    sha256: string;
    mimeType: string;
    extension: string;
    sizeBytes: number;
    storageKey: string;
    assetClass: AssetClass;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    codec: string | null;
    bitrateBps: number | null;
    status: AssetStatus;
    processingProfileVersion: string;
}

export interface ProcessingJobRow extends QueryResultRow {
    id: string;
    uploadSessionId: string;
    creativeVersionId: string;
    processingProfileVersion: string;
    status: ProcessingJobStatus;
    attempts: number;
    maxAttempts: number;
    lockedAt: Date | null;
    lockedBy: string | null;
    leaseExpiresAt: Date | null;
    heartbeatAt: Date | null;
    availableAt: Date;
    lastError: string | null;
    createdAt: Date;
    completedAt: Date | null;
}

export interface RecoveredProcessingJobs {
    requeued: number;
    failed: number;
}

function assertSingleRow(
    rowCount: number | null,
    message: string,
): void {
    if (rowCount !== 1) {
        throw new Error(message);
    }
}

// Upload session

export async function getUploadSession(
    db: DbExecutor,
    uploadSessionId: string,
): Promise<UploadSessionRow> {
    const result = await db.query<UploadSessionRow>(
        `SELECT
            id,
            uuid,
            user_id::float8 AS "userId",
            campaign_id AS "campaignId",
            creative_id AS "creativeId",
            creative_type AS "creativeType",
            staging_key AS "stagingKey",
            original_filename AS "originalFilename",
            declared_mime AS "declaredMime",
            size_bytes::float8 AS "sizeBytes",
            status,
            multipart_upload_id AS "multipartUploadId",
            processing_error AS "processingError",
            created_at AS "createdAt",
            completed_at AS "completedAt",
            expires_at AS "expiresAt"
        FROM upload_sessions
        WHERE id = $1
        LIMIT 1`,
        [uploadSessionId],
    );

    const row = result.rows[0];

    if (!row) {
        throw new Error(`Upload session not found: ${uploadSessionId}`);
    }

    return row;
}

export async function setUploadSessionProcessing(
    db: DbExecutor,
    uploadSessionId: string,
): Promise<void> {
    await db.query(
        `UPDATE upload_sessions
        SET
            status = 'processing',
            processing_error = NULL
        WHERE id = $1
          AND status IN ('uploaded', 'processing')`,
        [uploadSessionId],
    );
}

export async function setUploadSessionReady(
    db: DbExecutor,
    uploadSessionId: string,
): Promise<void> {
    await db.query(
        `UPDATE upload_sessions
        SET
            status = 'ready',
            processing_error = NULL,
            completed_at = COALESCE(completed_at, NOW())
        WHERE id = $1
          AND status IN ('processing', 'ready')`,
        [uploadSessionId],
    );
}

export async function setUploadSessionFailed(
    db: DbExecutor,
    uploadSessionId: string,
    error: string,
): Promise<void> {
    await db.query(
        `UPDATE upload_sessions
        SET
            status = 'failed',
            processing_error = $2
        WHERE id = $1
          AND status IN ('uploaded', 'processing', 'failed')`,
        [uploadSessionId, error],
    );
}

// Assets

export async function findAssetBySha256(
    db: DbExecutor,
    sha256: string,
): Promise<AssetRow | null> {
    const result = await db.query<AssetRow>(
        `SELECT
            id,
            sha256,
            mime_type AS "mimeType",
            extension,
            size_bytes::float8 AS "sizeBytes",
            storage_key AS "storageKey",
            asset_class AS "assetClass",
            width,
            height,
            duration_sec AS "durationSec",
            codec,
            bitrate_bps::float8 AS "bitrateBps",
            status,
            processing_profile_version AS "processingProfileVersion",
            created_at AS "createdAt"
        FROM assets
        WHERE sha256 = $1
        LIMIT 1`,
        [sha256],
    );

    return result.rows[0] ?? null;
}

export async function createAsset(
    db: DbExecutor,
    data: AssetInsert,
): Promise<AssetRow> {
    const result = await db.query<AssetRow>(
        `INSERT INTO assets (
            sha256,
            mime_type,
            extension,
            size_bytes,
            storage_key,
            asset_class,
            width,
            height,
            duration_sec,
            codec,
            bitrate_bps,
            status,
            processing_profile_version
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (sha256) DO NOTHING
        RETURNING
            id,
            sha256,
            mime_type AS "mimeType",
            extension,
            size_bytes::float8 AS "sizeBytes",
            storage_key AS "storageKey",
            asset_class AS "assetClass",
            width,
            height,
            duration_sec AS "durationSec",
            codec,
            bitrate_bps::float8 AS "bitrateBps",
            status,
            processing_profile_version AS "processingProfileVersion",
            created_at AS "createdAt"`,
        [
            data.sha256,
            data.mimeType,
            data.extension,
            data.sizeBytes,
            data.storageKey,
            data.assetClass,
            data.width,
            data.height,
            data.durationSec,
            data.codec,
            data.bitrateBps,
            data.status,
            data.processingProfileVersion,
        ],
    );

    const created = result.rows[0];

    if (created) {
        return created;
    }

    const existing = await findAssetBySha256(db, data.sha256);

    if (!existing) {
        throw new Error(
            `Asset insert conflict without matching SHA-256: ${data.sha256}`,
        );
    }

    return existing;
}

// Creative version

export async function getProcessingCreativeVersion(
    db: DbExecutor,
    creativeVersionId: string,
): Promise<CreativeVersionRow> {
    const result = await db.query<CreativeVersionRow>(
        `SELECT
            id,
            uuid,
            creative_id AS "creativeId",
            version,
            source_asset_id AS "sourceAssetId",
            status,
            processing_error AS "processingError",
            created_at AS "createdAt",
            ready_at AS "readyAt",
            archived_at AS "archivedAt"
        FROM creative_versions
        WHERE id = $1
          AND status = 'processing'
        LIMIT 1`,
        [creativeVersionId],
    );

    const row = result.rows[0];

    if (!row) {
        throw new Error(
            `Processing creative version not found: ${creativeVersionId}`,
        );
    }

    return row;
}

export async function setCreativeVersionReady(
    db: DbExecutor,
    creativeVersionId: string,
    sourceAssetId: string,
): Promise<void> {
    const result = await db.query(
        `UPDATE creative_versions
        SET
            status = 'ready',
            source_asset_id = $2,
            processing_error = NULL,
            ready_at = COALESCE(ready_at, NOW())
        WHERE id = $1
          AND (
              status = 'processing'
              OR (
                  status = 'ready'
                  AND source_asset_id = $2
              )
          )`,
        [creativeVersionId, sourceAssetId],
    );

    assertSingleRow(
        result.rowCount,
        `Creative version cannot enter ready state: ${creativeVersionId}`,
    );
}

export async function setCreativeVersionFailed(
    db: DbExecutor,
    creativeVersionId: string,
    error: string,
): Promise<void> {
    const result = await db.query(
        `UPDATE creative_versions
        SET
            status = 'failed',
            processing_error = $2
        WHERE id = $1
          AND status IN ('processing', 'failed')`,
        [creativeVersionId, error],
    );

    assertSingleRow(
        result.rowCount,
        `Creative version cannot enter failed state: ${creativeVersionId}`,
    );
}

export async function linkAssetToCreativeVersion(
    db: DbExecutor,
    creativeVersionId: string,
    assetId: string,
    role: string,
    priority: number,
): Promise<void> {
    await db.query(
        `INSERT INTO creative_version_assets (
            creative_version_id,
            asset_id,
            role,
            priority
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (
            creative_version_id,
            asset_id,
            role
        )
        DO UPDATE SET
            priority = EXCLUDED.priority`,
        [
            creativeVersionId,
            assetId,
            role,
            priority,
        ],
    );
}

// Processing jobs

export async function recoverExpiredProcessingJobs(
    db: DbExecutor,
): Promise<RecoveredProcessingJobs> {
    const requeued = await db.query(
        `UPDATE creative_processing_jobs
        SET
            status = 'pending',
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            heartbeat_at = NULL,
            available_at = NOW(),
            last_error = 'PROCESSING_LEASE_EXPIRED'
        WHERE status = 'processing'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= NOW()
          AND attempts < max_attempts`,
    );

    const failed = await db.query(
        `UPDATE creative_processing_jobs
        SET
            status = 'failed',
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            heartbeat_at = NULL,
            completed_at = COALESCE(completed_at, NOW()),
            last_error = COALESCE(
                last_error,
                'PROCESSING_LEASE_EXPIRED'
            )
        WHERE status = 'processing'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= NOW()
          AND attempts >= max_attempts`,
    );

    return {
        requeued: requeued.rowCount ?? 0,
        failed: failed.rowCount ?? 0,
    };
}

export async function claimProcessingJob(
    db: DbExecutor,
    workerId: string,
    leaseMs: number,
): Promise<ProcessingJobRow | null> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
        throw new Error('leaseMs must be a positive safe integer');
    }

    const result = await db.query<ProcessingJobRow>(
        `WITH candidate AS (
            SELECT id
            FROM creative_processing_jobs
            WHERE status = 'pending'
              AND available_at <= NOW()
              AND attempts < max_attempts
            ORDER BY
                available_at ASC,
                created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        UPDATE creative_processing_jobs AS job
        SET
            status = 'processing',
            locked_at = NOW(),
            locked_by = $1,
            lease_expires_at = NOW()
                + make_interval(
                    secs => $2::double precision / 1000.0
                ),
            heartbeat_at = NOW(),
            attempts = job.attempts + 1
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING
            job.id,
            job.upload_session_id AS "uploadSessionId",
            job.creative_version_id AS "creativeVersionId",
            job.processing_profile_version AS "processingProfileVersion",
            job.status,
            job.attempts,
            job.max_attempts AS "maxAttempts",
            job.locked_at AS "lockedAt",
            job.locked_by AS "lockedBy",
            job.lease_expires_at AS "leaseExpiresAt",
            job.heartbeat_at AS "heartbeatAt",
            job.available_at AS "availableAt",
            job.last_error AS "lastError",
            job.created_at AS "createdAt",
            job.completed_at AS "completedAt"`,
        [
            workerId,
            leaseMs,
        ],
    );

    return result.rows[0] ?? null;
}

export async function renewProcessingJobLease(
    db: DbExecutor,
    jobId: string,
    workerId: string,
    leaseMs: number,
): Promise<boolean> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
        throw new Error('leaseMs must be a positive safe integer');
    }

    const result = await db.query(
        `UPDATE creative_processing_jobs
        SET
            heartbeat_at = NOW(),
            lease_expires_at = NOW()
                + make_interval(
                    secs => $3::double precision / 1000.0
                )
        WHERE id = $1
          AND status = 'processing'
          AND locked_by = $2
          AND lease_expires_at > NOW()`,
        [
            jobId,
            workerId,
            leaseMs,
        ],
    );

    return result.rowCount === 1;
}

export async function setProcessingJobReady(
    db: DbExecutor,
    jobId: string,
    workerId: string,
): Promise<void> {
    const result = await db.query(
        `UPDATE creative_processing_jobs
        SET
            status = 'ready',
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            heartbeat_at = NULL,
            last_error = NULL,
            completed_at = COALESCE(completed_at, NOW())
        WHERE id = $1
          AND status = 'processing'
          AND locked_by = $2`,
        [
            jobId,
            workerId,
        ],
    );

    assertSingleRow(
        result.rowCount,
        `Processing job lease is not owned by worker: ${jobId}`,
    );
}

export async function scheduleProcessingJobRetry(
    db: DbExecutor,
    jobId: string,
    workerId: string,
    error: string,
    backoffMs: number,
): Promise<void> {
    if (!Number.isSafeInteger(backoffMs) || backoffMs < 0) {
        throw new Error(
            'backoffMs must be a non-negative safe integer',
        );
    }

    const result = await db.query(
        `UPDATE creative_processing_jobs
        SET
            status = 'pending',
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            heartbeat_at = NULL,
            last_error = $3,
            available_at = NOW()
                + make_interval(
                    secs => $4::double precision / 1000.0
                )
        WHERE id = $1
          AND status = 'processing'
          AND locked_by = $2
          AND attempts < max_attempts`,
        [
            jobId,
            workerId,
            error,
            backoffMs,
        ],
    );

    assertSingleRow(
        result.rowCount,
        `Processing job cannot be scheduled for retry: ${jobId}`,
    );
}

export async function setProcessingJobFailed(
    db: DbExecutor,
    jobId: string,
    workerId: string,
    error: string,
): Promise<void> {
    const result = await db.query(
        `UPDATE creative_processing_jobs
        SET
            status = 'failed',
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            heartbeat_at = NULL,
            last_error = $3,
            completed_at = COALESCE(completed_at, NOW())
        WHERE id = $1
          AND status = 'processing'
          AND locked_by = $2`,
        [
            jobId,
            workerId,
            error,
        ],
    );

    assertSingleRow(
        result.rowCount,
        `Processing job lease is not owned by worker: ${jobId}`,
    );
}