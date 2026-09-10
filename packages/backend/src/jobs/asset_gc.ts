import cron from 'node-cron';
import { and, lt, notExists, eq } from 'drizzle-orm';
import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { db } from '../db/index.js';
import { assets, creativeVersionAssets } from '../db/schema.js';
import { createStorageClient } from '../services/storage/client.js';
import {
    getDeliveryBucket,
    getSignerKeyId,
    getSignerSecret,
    getSourceBucket,
} from '../lib/env.js';

const GC_GRACE_DAYS = 45;
const GC_BATCH_SIZE = 100;

type StorageClient = ReturnType<typeof createStorageClient>;

// Защита от наложения запусков: расписание ежедневное, но при деградации Object
// Storage проход может выйти за сутки. Параллельные проходы конкурировали бы за
// одни и те же ключи и удвоили нагрузку на хранилище
let isRunning = false;

interface GcCounters {
    deleted: number;
    skipped: number;
    failed: number;
}

function isNoSuchKey(err: unknown): boolean {
    return (err as { Code?: string }).Code === 'NoSuchKey';
}

// HTML5-ассет — точка входа распакованного бандла: удаление одного index.html
// оставило бы в бакете весь остальной каталог без единой ссылки на него
async function deleteBundlePrefix(
    client: StorageClient,
    bucket: string,
    storageKey: string,
): Promise<void> {
    const separatorIndex = storageKey.lastIndexOf('/');

    if (separatorIndex <= 0) return;

    const prefix = storageKey.slice(0, separatorIndex + 1);
    let continuationToken: string | undefined = undefined;

    do {
        const listed: ListObjectsV2CommandOutput = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ...(continuationToken !== undefined && { ContinuationToken: continuationToken }),
        }));

        const objects = (listed.Contents ?? [])
            .map((item) => item.Key)
            .filter((key): key is string => key !== undefined)
            .map((Key) => ({ Key }));

        if (objects.length > 0) {
            const deleted = await client.send(new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: { Objects: objects },
            }));

            // DeleteObjects не бросает исключение при частичном отказе — отклонённые
            // ключи возвращаются в Errors. Без этой проверки транзакция закоммитила бы
            // удаление записи при оставшихся в бакете объектах
            const errors = deleted.Errors ?? [];

            if (errors.length > 0) {
                const first = errors[0];
                throw new Error(
                    `Bundle prefix deletion partially failed: ${prefix} (${errors.length} objects, first: ${first?.Key ?? 'unknown'} — ${first?.Code ?? 'unknown'})`,
                );
            }
        }

        continuationToken = listed.IsTruncated === true
            ? listed.NextContinuationToken
            : undefined;
    } while (continuationToken !== undefined);
}

async function deleteAssetObject(
    client: StorageClient,
    bucket: string,
    storageKey: string,
    assetClass: string,
): Promise<void> {
    if (assetClass === 'html_file') {
        await deleteBundlePrefix(client, bucket, storageKey);
        return;
    }

    await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: storageKey,
    }));
}

// Ассеты контент-адресованы: между выборкой кандидатов и удалением параллельный
// media-worker может найти этот же ассет по SHA-256 и привязать его к новой версии
// креатива. FOR UPDATE на строке assets конфликтует с FOR KEY SHARE, которую берёт
// вставка в creative_version_assets по внешнему ключу — привязка блокируется до
// завершения транзакции, а повторная проверка видит все закоммиченные ранее ссылки.
// Объект удаляется из хранилища до коммита: при отказе хранилища транзакция
// откатывается и ассет остаётся кандидатом, вместо потери записи о живом объекте
async function collectAsset(
    client: StorageClient,
    assetId: string,
    sourceBucket: string,
    deliveryBucket: string,
): Promise<boolean> {
    return db.transaction(async (tx) => {
        const [locked] = await tx
            .select({
                id: assets.id,
                storageKey: assets.storageKey,
                assetClass: assets.assetClass,
            })
            .from(assets)
            .where(eq(assets.id, assetId))
            .for('update')
            .limit(1);

        if (!locked) return false;

        const [reference] = await tx
            .select({ id: creativeVersionAssets.id })
            .from(creativeVersionAssets)
            .where(eq(creativeVersionAssets.assetId, assetId))
            .limit(1);

        if (reference) return false;

        const bucket = locked.assetClass === 'source' ? sourceBucket : deliveryBucket;

        try {
            await deleteAssetObject(
                client,
                bucket,
                locked.storageKey,
                locked.assetClass,
            );
        } catch (err) {
            if (!isNoSuchKey(err)) throw err;
        }

        await tx
            .delete(assets)
            .where(eq(assets.id, assetId));

        return true;
    });
}

async function runAssetGc(): Promise<GcCounters> {
    const client = createStorageClient({
        keyId: getSignerKeyId(),
        secret: getSignerSecret(),
    });

    const sourceBucket = getSourceBucket();
    const deliveryBucket = getDeliveryBucket();

    const cutoff = new Date(Date.now() - GC_GRACE_DAYS * 86_400_000);

    const unreferenced = await db
        .select({ id: assets.id })
        .from(assets)
        .where(
            and(
                lt(assets.createdAt, cutoff),
                notExists(
                    db
                        .select()
                        .from(creativeVersionAssets)
                        .where(eq(creativeVersionAssets.assetId, assets.id)),
                ),
            ),
        )
        .limit(GC_BATCH_SIZE);

    const counters: GcCounters = { deleted: 0, skipped: 0, failed: 0 };

    for (const asset of unreferenced) {
        try {
            const collected = await collectAsset(
                client,
                asset.id,
                sourceBucket,
                deliveryBucket,
            );

            if (collected) {
                counters.deleted++;
            } else {
                counters.skipped++;
            }
        } catch (err) {
            counters.failed++;
            console.error(
                `[CPMind] Asset GC failed for ${asset.id}:`,
                err,
            );
        }
    }

    return counters;
}

// Cron-колбэк синхронный: невозвращённый промис с отказом становится unhandled
// rejection, что в Node 20 завершает процесс. Обработчик обязателен — фоновая
// уборка не должна ронять API, обслуживающий beacon-трафик
export function startAssetGcJob(): void {
    cron.schedule('30 3 * * *', () => {
        if (isRunning) {
            console.warn('[CPMind] Asset GC skipped — previous run still in progress');
            return;
        }

        isRunning = true;

        void runAssetGc()
            .then((counters) => {
                if (
                    counters.deleted === 0 &&
                    counters.skipped === 0 &&
                    counters.failed === 0
                ) return;

                const message = `[CPMind] Asset GC completed: ${counters.deleted} deleted, ${counters.skipped} skipped, ${counters.failed} failed`;

                if (counters.failed > 0) {
                    console.error(message);
                } else {
                    console.log(message);
                }
            })
            .catch((err: unknown) => {
                console.error('[CPMind] Asset GC run failed:', err);
            })
            .finally(() => {
                isRunning = false;
            });
    });
}