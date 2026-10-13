import { S3Client } from '@aws-sdk/client-s3';
import { getWorkerKeyId, getWorkerSecret } from '../config.js';

let instance: S3Client | null = null;

export function getStorageClient(): S3Client {
    if (!instance) {
        instance = new S3Client({
            endpoint: 'https://s3.ru-3.storage.selcloud.ru',
            region: 'ru-3',
            credentials: {
                accessKeyId: getWorkerKeyId(),
                secretAccessKey: getWorkerSecret(),
            },
            forcePathStyle: false,
        });
    }
    return instance;
}