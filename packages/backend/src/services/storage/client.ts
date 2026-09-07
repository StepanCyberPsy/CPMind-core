import { S3Client } from '@aws-sdk/client-s3';

export interface StorageCredentials {
    keyId: string;
    secret: string;
}

export function createStorageClient(credentials: StorageCredentials): S3Client {
    return new S3Client({
        endpoint: 'https://storage.yandexcloud.net',
        region: 'ru-central1',
        credentials: {
            accessKeyId: credentials.keyId,
            secretAccessKey: credentials.secret,
        },
        forcePathStyle: false,
    });
}