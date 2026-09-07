import { createReadStream, statSync } from 'node:fs';
import {
    PutObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getStorageClient } from './client.js';
import { getDeliveryBucket, getSourceBucket } from '../config.js';

const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
const PART_SIZE_BYTES = 10 * 1024 * 1024;

async function uploadSmall(
    localPath: string,
    bucket: string,
    key: string,
    mimeType: string,
    sizeBytes: number,
): Promise<void> {
    const client = getStorageClient();
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: sizeBytes,
        Body: createReadStream(localPath),
    }));
}

async function uploadMultipart(
    localPath: string,
    bucket: string,
    key: string,
    mimeType: string,
    sizeBytes: number,
): Promise<void> {
    const client = getStorageClient();

    const initResponse = await client.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimeType,
    }));

    const uploadId = initResponse.UploadId;
    if (!uploadId) {
        throw new Error(`Multipart initiation failed for key: ${key}`);
    }

    const parts: Array<{ PartNumber: number; ETag: string }> = [];
    const partCount = Math.ceil(sizeBytes / PART_SIZE_BYTES);

    try {
        for (let partNumber = 1; partNumber <= partCount; partNumber++) {
            const start = (partNumber - 1) * PART_SIZE_BYTES;
            const end = Math.min(start + PART_SIZE_BYTES, sizeBytes);

            const partResponse = await client.send(new UploadPartCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
                PartNumber: partNumber,
                ContentLength: end - start,
                Body: createReadStream(localPath, { start, end: end - 1 }),
            }));

            if (!partResponse.ETag) {
                throw new Error(`Missing ETag for part ${partNumber} of key: ${key}`);
            }

            parts.push({ PartNumber: partNumber, ETag: partResponse.ETag });
        }

        await client.send(new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
        }));
    } catch (err) {
        await client.send(new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
        })).catch(() => undefined);

        throw err;
    }
}

export async function uploadProcessedFile(
    localPath: string,
    storageKey: string,
    mimeType: string,
): Promise<void> {
    const sizeBytes = statSync(localPath).size;
    const bucket = getDeliveryBucket();

    if (sizeBytes >= MULTIPART_THRESHOLD_BYTES) {
        await uploadMultipart(localPath, bucket, storageKey, mimeType, sizeBytes);
    } else {
        await uploadSmall(localPath, bucket, storageKey, mimeType, sizeBytes);
    }
}

export async function uploadSourceFile(
    localPath: string,
    storageKey: string,
    mimeType: string,
): Promise<void> {
    const sizeBytes = statSync(localPath).size;
    const bucket = getSourceBucket();

    if (sizeBytes >= MULTIPART_THRESHOLD_BYTES) {
        await uploadMultipart(localPath, bucket, storageKey, mimeType, sizeBytes);
    } else {
        await uploadSmall(localPath, bucket, storageKey, mimeType, sizeBytes);
    }
}