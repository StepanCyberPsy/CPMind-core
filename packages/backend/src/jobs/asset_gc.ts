import cron from 'node-cron';
import {
    and,
    asc,
    eq,
    gt,
    lt,
    notExists,
    type SQL,
} from 'drizzle-orm';
import pino from 'pino';
import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { db } from '../db/index.js';
import {
    assets,
    creativeVersionAssets,
    creativeVersions,
} from '../db/schema.js';
import { createStorageClient } from '../services/storage/client.js';
import {
    getDeliveryBucket,
    getSignerKeyId,
    getSignerSecret,
    getSourceBucket,
} from '../lib/env.js';

const logger = pino({ name: 'asset-gc-job' });

const GC_GRACE_DAYS = 45;
const GC_PAGE_SIZE = 100;

// Бюджет одного запуска проверяется между страницами кандидатов: проход ограничен
// по объёму и времени и не накладывается на следующий суточный запуск
const GC_MAX_ASSETS_PER_RUN = 5_000;
const GC_MAX_RUN_DURATION_MS = 30 * 60_000;

// Запрос к хранилищу выполняется внутри транзакции с блокировкой строки ассета —
// зависший запрос не должен удерживать блокировку и соединение с БД
const STORAGE_REQUEST_TIMEOUT_MS = 30_000;

// Каталог распакованного HTML5-бандла контент-адресован: последний сегмент — SHA-256
const BUNDLE_DIRECTORY_REGEX = /(?:^|\/)[0-9a-f]{64}\/$/;

type StorageClient = ReturnType<typeof createStorageClient>;

type CollectOutcome =
    | 'deleted'
    | 'locked'
    | 'referenced'
    | 'missing';

interface GcSummary {
    examined: number;
    deleted: number;
    locked: number;
    referenced: number;
    missing: number;
    failed: number;
    budgetExhausted: boolean;
    durationMs: number;
}

// Защита от наложения запусков в одном процессе. Параллельные экземпляры backend
// не конфликтуют: занятые строки пропускаются через SKIP LOCKED
let isRunning = false;

function isNoSuchKey(err: unknown): boolean {
    const error = err as { Code?: string; name?: string };
    return error.Code === 'NoSuchKey' || error.name === 'NoSuchKey';
}

function requestOptions(): { abortSignal: AbortSignal } {
    return { abortSignal: AbortSignal.timeout(STORAGE_REQUEST_TIMEOUT_MS) };
}

// Ассет не упоминается ни в составе версий креатива, ни как исходный файл версии
function buildUnreferencedFilter(): SQL | undefined {
    return and(
        notExists(
            db
                .select({ id: creativeVersionAssets.id })
                .from(creativeVersionAssets)
                .where(eq(creativeVersionAssets.assetId, assets.id)),
        ),
        notExists(
            db
                .select({ id: creativeVersions.id })
                .from(creativeVersions)
                .where(eq(creativeVersions.sourceAssetId, assets.id)),
        ),
    );
}

// Страница кандидатов по курсору id: ассет с ошибкой не блокирует остальные в пределах запуска
async function fetchCandidates(
    cutoff: Date,
    afterId: string | null,
): Promise<Array<{ id: string }>> {
    return db
        .select({ id: assets.id })
        .from(assets)
        .where(and(
            lt(assets.createdAt, cutoff),
            afterId !== null ? gt(assets.id, afterId) : undefined,
            buildUnreferencedFilter(),
        ))
        .orderBy(asc(assets.id))
        .limit(GC_PAGE_SIZE);
}

// Каталог бандла по ключу точки входа. Ключ вне контент-адресованного каталога
// отклоняется — удаление по такому префиксу затронуло бы посторонние объекты
function resolveBundlePrefix(storageKey: string): string {
    const separatorIndex = storageKey.lastIndexOf('/');
    const prefix = separatorIndex > 0
        ? storageKey.slice(0, separatorIndex + 1)
        : '';

    if (!BUNDLE_DIRECTORY_REGEX.test(prefix)) {
        throw new Error(`HTML5 bundle key is outside a content-addressed directory: ${storageKey}`);
    }

    return prefix;
}

// HTML5-ассет — точка входа распакованного бандла: удаление одного index.html
// оставило бы в бакете весь остальной каталог без единой ссылки на него
async function deleteBundlePrefix(
    client: StorageClient,
    bucket: string,
    storageKey: string,
): Promise<void> {
    const prefix = resolveBundlePrefix(storageKey);
    let continuationToken: string | undefined = undefined;

    do {
        const listed: ListObjectsV2CommandOutput = await client.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ...(continuationToken !== undefined && { ContinuationToken: continuationToken }),
            }),
            requestOptions(),
        );

        const objects = (listed.Contents ?? [])
            .map((item) => item.Key)
            .filter((key): key is string => key !== undefined)
            .map((Key) => ({ Key }));

        if (objects.length > 0) {
            const deleted = await client.send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: { Objects: objects },
                }),
                requestOptions(),
            );

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

    await client.send(
        new DeleteObjectCommand({
            Bucket: bucket,
            Key: storageKey,
        }),
        requestOptions(),
    );
}

// Ассеты контент-адресованы: между выборкой кандидатов и удалением параллельный
// media-worker может найти этот же ассет по SHA-256 и привязать его к новой версии
// креатива. FOR UPDATE на строке assets конфликтует с FOR KEY SHARE, которую берёт
// вставка ссылки по внешнему ключу. SKIP LOCKED пропускает занятый ассет до следующего
// запуска вместо ожидания, повторная проверка ссылок видит все закоммиченные ранее связи.
// Объект удаляется из хранилища до коммита: при отказе хранилища транзакция
// откатывается и ассет остаётся кандидатом, вместо потери записи о живом объекте
async function collectAsset(
    client: StorageClient,
    assetId: string,
    sourceBucket: string,
    deliveryBucket: string,
): Promise<CollectOutcome> {
    return db.transaction(async (tx) => {
        const [locked] = await tx
            .select({
                id: assets.id,
                storageKey: assets.storageKey,
                assetClass: assets.assetClass,
            })
            .from(assets)
            .where(eq(assets.id, assetId))
            .for('update', { skipLocked: true })
            .limit(1);

        if (!locked) return 'locked';

        const [versionAssetReference] = await tx
            .select({ id: creativeVersionAssets.id })
            .from(creativeVersionAssets)
            .where(eq(creativeVersionAssets.assetId, assetId))
            .limit(1);

        const [sourceReference] = await tx
            .select({ id: creativeVersions.id })
            .from(creativeVersions)
            .where(eq(creativeVersions.sourceAssetId, assetId))
            .limit(1);

        if (versionAssetReference || sourceReference) return 'referenced';

        const bucket = locked.assetClass === 'source' ? sourceBucket : deliveryBucket;
        let objectMissing = false;

        try {
            await deleteAssetObject(
                client,
                bucket,
                locked.storageKey,
                locked.assetClass,
            );
        } catch (err) {
            if (!isNoSuchKey(err)) throw err;
            objectMissing = true;
        }

        await tx
            .delete(assets)
            .where(eq(assets.id, assetId));

        return objectMissing ? 'missing' : 'deleted';
    });
}

async function runAssetGc(): Promise<GcSummary> {
    const startedAt = Date.now();

    const client = createStorageClient({
        keyId: getSignerKeyId(),
        secret: getSignerSecret(),
    });

    const sourceBucket = getSourceBucket();
    const deliveryBucket = getDeliveryBucket();
    const cutoff = new Date(startedAt - GC_GRACE_DAYS * 86_400_000);

    const summary: GcSummary = {
        examined: 0,
        deleted: 0,
        locked: 0,
        referenced: 0,
        missing: 0,
        failed: 0,
        budgetExhausted: false,
        durationMs: 0,
    };

    let afterId: string | null = null;
    let exhausted = false;

    while (!exhausted) {
        if (
            summary.examined >= GC_MAX_ASSETS_PER_RUN ||
            Date.now() - startedAt >= GC_MAX_RUN_DURATION_MS
        ) {
            summary.budgetExhausted = true;
            break;
        }

        const page = await fetchCandidates(cutoff, afterId);
        exhausted = page.length < GC_PAGE_SIZE;

        for (const candidate of page) {
            afterId = candidate.id;
            summary.examined++;

            try {
                const outcome = await collectAsset(
                    client,
                    candidate.id,
                    sourceBucket,
                    deliveryBucket,
                );
                summary[outcome]++;
            } catch (err) {
                summary.failed++;
                logger.error(
                    {
                        err,
                        assetId: candidate.id,
                    },
                    'Asset GC failed for asset — retried on next run',
                );
            }
        }
    }

    summary.durationMs = Date.now() - startedAt;
    return summary;
}

// Cron-колбэк синхронный: невозвращённый промис с отказом становится unhandled
// rejection, что завершает процесс Node. Обработчик обязателен — фоновая
// уборка не должна ронять API, обслуживающий beacon-трафик
export function startAssetGcJob(): void {
    cron.schedule('30 3 * * *', () => {
        if (isRunning) {
            logger.warn('Asset GC skipped — previous run still in progress');
            return;
        }

        isRunning = true;

        void runAssetGc()
            .then((summary) => {
                if (summary.failed > 0) {
                    logger.error(summary, 'Asset GC completed with failures');
                    return;
                }

                logger.info(summary, 'Asset GC completed');
            })
            .catch((err: unknown) => {
                logger.error({ err }, 'Asset GC run failed');
            })
            .finally(() => {
                isRunning = false;
            });
    }, { timezone: 'UTC' });

    logger.info('Asset GC job scheduled (daily 03:30 UTC)');
}