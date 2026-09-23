import {
  eq,
  and,
  desc,
  lte,
  isNotNull,
} from 'drizzle-orm';
import { DEFAULT_LOGISTIC_PARAMS, type LogisticParams } from '@cpmind/shared';
import { db } from '../../db/index.js';
import { s3LogisticConfigs, type S3LogisticConfigSelect } from '../../db/schema.js';

const DELETION_DELAY_MS = 60 * 60_000;

class S3LogisticConfigError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'S3LogisticConfigError';
  }
}

export interface S3LogisticConfigResolution {
  params: LogisticParams;
  modelVersion: string;
}

const cache = new Map<string, S3LogisticConfigResolution>();

/**
 * Сбрасывает весь кэш активных логистических параметров S3.
 * Вызывается после активации, деактивации или удаления конфигурации.
 */
export function invalidateS3LogisticCache(): void {
  cache.clear();
}

// Активная модель сегмента. С версией констант — модель, обученная на данных этой версии,
// без версии — последняя обученная из активных моделей сегмента
async function queryActiveBySegmentKey(
  segmentKey: string,
  tagConstantsVersion: string | null,
): Promise<S3LogisticConfigSelect | null> {
  const rows = await db
    .select()
    .from(s3LogisticConfigs)
    .where(and(
      eq(s3LogisticConfigs.segmentKey, segmentKey),
      eq(s3LogisticConfigs.isActive, true),
      tagConstantsVersion !== null
        ? eq(s3LogisticConfigs.tagConstantsVersion, tagConstantsVersion)
        : undefined,
    ))
    .orderBy(desc(s3LogisticConfigs.fittedAt))
    .limit(1);
  return rows[0] ?? null;
}

// Первая найденная модель по цепочке сегментов: на каждом уровне модель версии констант
// показа приоритетнее модели сегмента без учёта версии
async function resolveBySegmentChain(
  segmentKeys: readonly string[],
  tagConstantsVersion: string,
): Promise<S3LogisticConfigSelect | null> {
  for (const segmentKey of segmentKeys) {
    const versioned = await queryActiveBySegmentKey(segmentKey, tagConstantsVersion);
    if (versioned !== null) return versioned;

    const latest = await queryActiveBySegmentKey(segmentKey, null);
    if (latest !== null) return latest;
  }
  return null;
}

function rowToParams(row: S3LogisticConfigSelect): LogisticParams {
  const c = row.coefficients as Record<string, number>;
  const fm = row.featureMeans as Record<string, number>;
  const fs = row.featureStds as Record<string, number>;
  return {
    beta0: c['beta0'] ?? 0,
    beta1: c['beta1'] ?? 0,
    beta2: c['beta2'] ?? 0,
    beta3: c['beta3'] ?? 0,
    beta4: c['beta4'] ?? 0,
    beta5: c['beta5'] ?? 0,
    beta6: c['beta6'] ?? 0,
    beta7: c['beta7'] ?? 0,
    featureMeans: {
      speed: fm['speed'] ?? 0,
      stddev: fm['stddev'] ?? 0,
      pause: fm['pause'] ?? 0,
      direction: fm['direction'] ?? 0,
      streak: fm['streak'] ?? 0,
    },
    featureStds: {
      speed: fs['speed'] ?? 1,
      stddev: fs['stddev'] ?? 1,
      pause: fs['pause'] ?? 1,
      direction: fs['direction'] ?? 1,
      streak: fs['streak'] ?? 1,
    },
  };
}

/**
 * Возвращает активные логистические параметры S3 для сегмента и версии констант с fallback-цепочкой:
 *   device_type|creative_group → creative_group → global → DEFAULT_LOGISTIC_PARAMS
 * На каждом уровне модель, обученная на версии констант показа, приоритетнее остальных.
 *
 * Результат кэшируется по сегменту и версии констант.
 */
export async function getActiveS3LogisticParams(
  segmentKey: string,
  tagConstantsVersion: string,
): Promise<S3LogisticConfigResolution> {
  const cacheKey = `${tagConstantsVersion}::${segmentKey}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const creativeGroup = segmentKey.includes('|')
    ? (segmentKey.split('|')[1] ?? segmentKey)
    : segmentKey;

  const row = await resolveBySegmentChain(
    Array.from(new Set([
      segmentKey,
      creativeGroup,
      'global',
    ])),
    tagConstantsVersion,
  );

  const resolution: S3LogisticConfigResolution = row !== null
    ? { params: rowToParams(row), modelVersion: row.id }
    : { params: DEFAULT_LOGISTIC_PARAMS, modelVersion: 'default' };

  cache.set(cacheKey, resolution);
  return resolution;
}

/**
 * Возвращает все версии логистических конфигураций S3, сортировка по дате фита desc.
 */
export async function listS3LogisticConfigs(): Promise<S3LogisticConfigSelect[]> {
  return db
    .select()
    .from(s3LogisticConfigs)
    .orderBy(desc(s3LogisticConfigs.fittedAt));
}

/**
 * Активирует версию логистической конфигурации S3 по id.
 * Транзакция гарантирует инвариант: ровно одна is_active=true на пару segment_key + tag_constants_version.
 * Нельзя активировать конфигурацию, запланированную к удалению.
 */
export async function activateS3LogisticConfig(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select()
      .from(s3LogisticConfigs)
      .where(eq(s3LogisticConfigs.id, id))
      .limit(1);

    if (!target.length) {
      throw new S3LogisticConfigError(
        'Конфигурация не найдена',
        404,
        'S3_LOGISTIC_CONFIG_NOT_FOUND',
      );
    }

    const row = target[0]!;

    if (row.deletionScheduledAt !== null) {
      throw new S3LogisticConfigError(
        'Нельзя активировать конфигурацию, запланированную к удалению',
        409,
        'S3_LOGISTIC_CONFIG_DELETION_SCHEDULED',
      );
    }

    await tx
      .update(s3LogisticConfigs)
      .set({ isActive: false })
      .where(and(
        eq(s3LogisticConfigs.segmentKey, row.segmentKey),
        eq(s3LogisticConfigs.tagConstantsVersion, row.tagConstantsVersion),
      ));

    await tx
      .update(s3LogisticConfigs)
      .set({ isActive: true })
      .where(eq(s3LogisticConfigs.id, id));
  });

  invalidateS3LogisticCache();
}

/**
 * Деактивирует активную логистическую конфигурацию S3 по id.
 */
export async function deactivateS3LogisticConfig(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s3LogisticConfigs)
    .where(eq(s3LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S3LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S3_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (!rows[0]!.isActive) {
    throw new S3LogisticConfigError(
      'Конфигурация уже деактивирована',
      409,
      'S3_LOGISTIC_CONFIG_ALREADY_INACTIVE',
    );
  }

  await db
    .update(s3LogisticConfigs)
    .set({ isActive: false })
    .where(eq(s3LogisticConfigs.id, id));

  invalidateS3LogisticCache();
}

/**
 * Планирует удаление неактивной конфигурации через 60 минут.
 * Возвращает момент запланированного удаления для отображения таймера в UI.
 */
export async function scheduleS3LogisticConfigDeletion(id: string): Promise<Date> {
  const rows = await db
    .select()
    .from(s3LogisticConfigs)
    .where(eq(s3LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S3LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S3_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.isActive) {
    throw new S3LogisticConfigError(
      'Нельзя запланировать удаление активной конфигурации',
      409,
      'S3_LOGISTIC_CONFIG_ACTIVE',
    );
  }

  const deletionScheduledAt = new Date(Date.now() + DELETION_DELAY_MS);

  await db
    .update(s3LogisticConfigs)
    .set({ deletionScheduledAt })
    .where(eq(s3LogisticConfigs.id, id));

  return deletionScheduledAt;
}

/**
 * Отменяет запланированное удаление конфигурации.
 */
export async function cancelS3LogisticConfigDeletion(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s3LogisticConfigs)
    .where(eq(s3LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S3LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S3_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.deletionScheduledAt === null) {
    throw new S3LogisticConfigError(
      'Удаление не запланировано',
      409,
      'S3_LOGISTIC_CONFIG_NO_DELETION_SCHEDULED',
    );
  }

  await db
    .update(s3LogisticConfigs)
    .set({ deletionScheduledAt: null })
    .where(eq(s3LogisticConfigs.id, id));
}

/**
 * Удаляет конфигурации с истёкшим таймером deletion_scheduled_at.
 * Вызывается джобом scheduled_deletion.ts. Возвращает количество удалённых строк.
 */
export async function deleteScheduledS3LogisticConfigs(): Promise<number> {
  const now = new Date();
  const rows = await db
    .delete(s3LogisticConfigs)
    .where(and(
      isNotNull(s3LogisticConfigs.deletionScheduledAt),
      lte(s3LogisticConfigs.deletionScheduledAt, now),
    ))
    .returning({ id: s3LogisticConfigs.id });

  if (rows.length > 0) {
    invalidateS3LogisticCache();
  }

  return rows.length;
}