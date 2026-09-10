import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';

const RUNTIME_KEY_PREFIX = 'runtime/';
const SCRIPT_CONTENT_TYPE = 'application/javascript; charset=utf-8';
const SCRIPT_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const SHA256_METADATA_KEY = 'sha256';
const BUNDLE_SUFFIX = '.min.js';

interface RemoteObject {
    exists: boolean;
    sha256: string | null;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getRuntimeDistDir(): string {
    return process.env['RUNTIME_DIST_DIR'] ?? '/app/runtime-dist';
}

function isOverwriteAllowed(): boolean {
    return process.env['RUNTIME_PUBLISH_ALLOW_OVERWRITE'] === 'true';
}

function createStorageClient(): S3Client {
    return new S3Client({
        endpoint: 'https://storage.yandexcloud.net',
        region: 'ru-central1',
        credentials: {
            accessKeyId: requireEnv('YC_WORKER_KEY_ID'),
            secretAccessKey: requireEnv('YC_WORKER_SECRET'),
        },
        forcePathStyle: false,
    });
}

// Метаданные надёжнее ETag: ETag совпадает с MD5 только для single-part загрузок
// и меняет формат при multipart, тогда как x-amz-meta-sha256 задаётся явно
async function headRemoteObject(
    client: S3Client,
    bucket: string,
    key: string,
): Promise<RemoteObject> {
    try {
        const response = await client.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        }));

        return {
            exists: true,
            sha256: response.Metadata?.[SHA256_METADATA_KEY] ?? null,
        };
    } catch (err: unknown) {
        const status = (err as { $metadata?: { httpStatusCode?: number } })
            .$metadata?.httpStatusCode;

        if (status === 404) {
            return { exists: false, sha256: null };
        }

        throw err;
    }
}

async function publishBundle(
    client: S3Client,
    bucket: string,
    distDir: string,
    fileName: string,
): Promise<void> {
    const body = await readFile(join(distDir, fileName));
    const sha256 = createHash('sha256').update(body).digest('hex');
    const key = `${RUNTIME_KEY_PREFIX}${fileName}`;

    const remote = await headRemoteObject(client, bucket, key);

    if (remote.exists && remote.sha256 === sha256) {
        console.log(`[CPMind runtime-publisher] unchanged: ${key}`);
        return;
    }

    if (remote.exists && !isOverwriteAllowed()) {
        throw new Error(
            `Immutable object content changed: ${key}. Bump the runtime version or set RUNTIME_PUBLISH_ALLOW_OVERWRITE=true`,
        );
    }

    if (remote.exists) {
        console.warn(`[CPMind runtime-publisher] overwriting immutable object: ${key}`);
    }

    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: SCRIPT_CONTENT_TYPE,
        ContentLength: body.byteLength,
        CacheControl: SCRIPT_CACHE_CONTROL,
        Metadata: { [SHA256_METADATA_KEY]: sha256 },
    }));

    console.log(
        `[CPMind runtime-publisher] published: ${key} (${body.byteLength} bytes)`,
    );
}

// Ключи выводятся из имён файлов, произведённых той же сборкой, что запекла
// константы в бандлы — расхождение версии артефакта и версии ключа невозможно
async function main(): Promise<void> {
    const bucket = requireEnv('DELIVERY_BUCKET');
    const distDir = getRuntimeDistDir();

    const fileNames = (await readdir(distDir))
        .filter((name) => name.endsWith(BUNDLE_SUFFIX))
        .sort();

    if (fileNames.length === 0) {
        throw new Error(`No runtime bundles found in ${distDir}`);
    }

    const client = createStorageClient();

    for (const fileName of fileNames) {
        await publishBundle(client, bucket, distDir, fileName);
    }

    console.log(
        `[CPMind runtime-publisher] completed: ${fileNames.length} bundles`,
    );
}

main().catch((err: unknown) => {
    console.error('[CPMind runtime-publisher] failed:', err);
    process.exit(1);
});