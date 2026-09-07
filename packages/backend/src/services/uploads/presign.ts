import type { S3Client } from '@aws-sdk/client-s3';
import { createStorageClient } from '../storage/client.js';
import {
    createPresignedPut,
    MULTIPART_THRESHOLD_BYTES,
    PRESIGNED_TTL_SECONDS,
} from '../storage/presign.js';
import {
    initiateMultipart,
    createPartPresignedUrls,
} from '../storage/multipart.js';
import {
    getSignerKeyId,
    getSignerSecret,
    getStagingBucket,
} from '../../lib/env.js';

let signerClient: S3Client | null = null;

function getClient(): S3Client {
    if (!signerClient) {
        signerClient = createStorageClient({
            keyId: getSignerKeyId(),
            secret: getSignerSecret(),
        });
    }
    return signerClient;
}

export async function createSinglePresignedUrl(
    stagingKey: string,
    sizeBytes: number,
    mimeType: string,
): Promise<string> {
    return createPresignedPut(
        getClient(),
        getStagingBucket(),
        stagingKey,
        sizeBytes,
        mimeType,
    );
}

export interface MultipartInitResult {
    multipartUploadId: string;
    parts: Array<{ partNumber: number; uploadUrl: string }>;
}

export async function initMultipartUpload(
    stagingKey: string,
    sizeBytes: number,
    mimeType: string,
): Promise<MultipartInitResult> {
    const client = getClient();
    const bucket = getStagingBucket();
    const multipartUploadId = await initiateMultipart(client, bucket, stagingKey, mimeType);
    const parts = await createPartPresignedUrls(
        client,
        bucket,
        stagingKey,
        multipartUploadId,
        sizeBytes,
    );
    return { multipartUploadId, parts };
}

export {
    MULTIPART_THRESHOLD_BYTES,
    PRESIGNED_TTL_SECONDS,
};