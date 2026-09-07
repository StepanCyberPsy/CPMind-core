import {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';
import { PART_SIZE_BYTES, PRESIGNED_TTL_SECONDS } from './presign.js';

export interface MultipartPartUrl {
    partNumber: number;
    uploadUrl: string;
}

export async function initiateMultipart(
    client: S3Client,
    bucket: string,
    key: string,
    mimeType: string,
): Promise<string> {
    const response = await client.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimeType,
    }));
    if (!response.UploadId) {
        throw new Error('Multipart upload initiation failed: UploadId not returned');
    }
    return response.UploadId;
}

export async function createPartPresignedUrls(
    client: S3Client,
    bucket: string,
    key: string,
    uploadId: string,
    sizeBytes: number,
): Promise<MultipartPartUrl[]> {
    const partCount = Math.ceil(sizeBytes / PART_SIZE_BYTES);
    return Promise.all(
        Array.from({ length: partCount }, async (_, i) => {
            const partNumber = i + 1;
            const command = new UploadPartCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
                PartNumber: partNumber,
            });
            const uploadUrl = await getSignedUrl(
                client,
                command,
                { expiresIn: PRESIGNED_TTL_SECONDS },
            );
            return { partNumber, uploadUrl };
        }),
    );
}

export async function completeMultipart(
    client: S3Client,
    bucket: string,
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>,
): Promise<void> {
    await client.send(new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: parts.map(p => ({
                PartNumber: p.partNumber,
                ETag: p.etag,
            })),
        },
    }));
}

export async function abortMultipart(
    client: S3Client,
    bucket: string,
    key: string,
    uploadId: string,
): Promise<void> {
    await client.send(new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
    }));
}