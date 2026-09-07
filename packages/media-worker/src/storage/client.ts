import { S3Client } from '@aws-sdk/client-s3';
import { getWorkerKeyId, getWorkerSecret } from '../config.js';

let instance: S3Client | null = null;

export function getStorageClient(): S3Client {
    if (!instance) {
        instance = new S3Client({
            endpoint: 'https://storage.yandexcloud.net',
            region: 'ru-central1',
            credentials: {
                accessKeyId: getWorkerKeyId(),
                secretAccessKey: getWorkerSecret(),
            },
            forcePathStyle: false,
        });
    }
    return instance;
}