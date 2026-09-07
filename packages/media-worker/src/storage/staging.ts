import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { getStorageClient } from './client.js';
import { getStagingBucket } from '../config.js';

export async function downloadFromStaging(
    stagingKey: string,
    tempDir: string,
): Promise<string> {
    const client = getStorageClient();
    const bucket = getStagingBucket();

    const response = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: stagingKey,
    }));

    if (!response.Body) {
        throw new Error(`Staging object has no body: ${stagingKey}`);
    }

    const filename = stagingKey.split('/').at(-1) ?? 'file';
    const localPath = join(tempDir, filename);

    await pipeline(
        response.Body as Readable,
        createWriteStream(localPath),
    );

    return localPath;
}

export async function deleteFromStaging(
    stagingKey: string,
): Promise<void> {
    const client = getStorageClient();
    const bucket = getStagingBucket();

    await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: stagingKey,
    }));
}