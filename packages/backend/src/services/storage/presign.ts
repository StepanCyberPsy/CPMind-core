import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';

export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
export const PRESIGNED_TTL_SECONDS = 3600;
export const PART_SIZE_BYTES = 10 * 1024 * 1024;
export const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;

export async function createPresignedPut(
    client: S3Client,
    bucket: string,
    key: string,
    sizeBytes: number,
    mimeType: string,
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: sizeBytes,
    });
    return getSignedUrl(client, command, { expiresIn: PRESIGNED_TTL_SECONDS });
}