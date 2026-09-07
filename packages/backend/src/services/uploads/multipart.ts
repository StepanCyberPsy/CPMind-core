import type { S3Client } from '@aws-sdk/client-s3';
import { createStorageClient } from '../storage/client.js';
import { completeMultipart, abortMultipart } from '../storage/multipart.js';
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

export async function completeMultipartUpload(
    stagingKey: string,
    multipartUploadId: string,
    parts: Array<{ partNumber: number; etag: string }>,
): Promise<void> {
    await completeMultipart(
        getClient(),
        getStagingBucket(),
        stagingKey,
        multipartUploadId,
        parts,
    );
}

export async function abortMultipartUpload(
    stagingKey: string,
    multipartUploadId: string,
): Promise<void> {
    await abortMultipart(
        getClient(),
        getStagingBucket(),
        stagingKey,
        multipartUploadId,
    );
}