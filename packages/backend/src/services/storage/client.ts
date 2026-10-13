import { S3Client } from '@aws-sdk/client-s3';

export interface StorageCredentials {
    keyId: string;
    secret: string;
}

export function createStorageClient(credentials: StorageCredentials): S3Client {
    return new S3Client({
        endpoint: 'https://s3.ru-3.storage.selcloud.ru',
        region: 'ru-3',
        credentials: {
            accessKeyId: credentials.keyId,
            secretAccessKey: credentials.secret,
        },
        forcePathStyle: false,
    });
}