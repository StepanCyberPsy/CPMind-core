import {
  eq,
  and,
  desc,
  lte,
  isNotNull,
} from 'drizzle-orm';
import { DEFAULT_S6_LOGISTIC_PARAMS, type S6LogisticParams } from '@cpmind/shared';
import { db } from '../../db/index.js';
import { s6LogisticConfigs, type S6LogisticConfigSelect } from '../../db/schema.js';

const DELETION_DELAY_MS = 60 * 60_000;

class S6LogisticConfigError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'S6LogisticConfigError';
  }
}

export interface S6LogisticConfigResolution {
  params: S6LogisticParams;
  modelVersion: string;
}

const cache = new Map<string, S6LogisticConfigResolution>();

/**
 * Сбрасывает весь кэш активных логистических параметров S6.
 * Вызывается после активации, деактивации или удаления конфигурации.
 */
export function invalidateS6LogisticCache(): void {
  cache.clear();
}

// Активная модель сегмента. С версией констант — модель, обученная на данных этой версии,
// без версии — последняя обученная из активных моделей сегмента
async function queryActiveBySegmentKey(
  segmentKey: string,
  tagConstantsVersion: string | null,
): Promise<S6LogisticConfigSelect | null> {
  const rows = await db
    .select()
    .from(s6LogisticConfigs)
    .where(and(
      eq(s6LogisticConfigs.segmentKey, segmentKey),
      eq(s6LogisticConfigs.isActive, true),
      tagConstantsVersion !== null
        ? eq(s6LogisticConfigs.tagConstantsVersion, tagConstantsVersion)
        : undefined,
    ))
    .orderBy(desc(s6LogisticConfigs.fittedAt))
    .limit(1);
  return rows[0] ?? null;
}

// Первая найденная модель по цепочке сегментов: на каждом уровне модель версии констант
// показа приоритетнее модели сегмента без учёта версии
async function resolveBySegmentChain(
  segmentKeys: readonly string[],
  tagConstantsVersion: string,
): Promise<S6LogisticConfigSelect | null> {
  for (const segmentKey of segmentKeys) {
    const versioned = await queryActiveBySegmentKey(segmentKey, tagConstantsVersion);
    if (versioned !== null) return versioned;

    const latest = await queryActiveBySegmentKey(segmentKey, null);
    if (latest !== null) return latest;
  }
  return null;
}

function rowToParams(row: S6LogisticConfigSelect): S6LogisticParams {
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
    beta8: c['beta8'] ?? 0,
    featureMeans: {
      completion: fm['completion'] ?? 0,
      quartile: fm['quartile'] ?? 0,
      audible: fm['audible'] ?? 0,
      replay: fm['replay'] ?? 0,
    },
    featureStds: {
      completion: fs['completion'] ?? 1,
      quartile: fs['quartile'] ?? 1,
      audible: fs['audible'] ?? 1,
      replay: fs['replay'] ?? 1,
    },
  };
}

/**
 * Возвращает активные логистические параметры S6 для сегментов показа и версии констант с fallback-цепочкой:
 *   device|группа размещения → device|skippable (прежняя схема) → skippable (без device) → global
 *   → DEFAULT_S6_LOGISTIC_PARAMS
 * segmentKeys формирует resolveS6SegmentKeys из @cpmind/shared, null — баннер.
 * На каждом уровне модель, обученная на версии констант показа, приоритетнее остальных.
 *
 * Результат кэшируется по набору сегментов и версии констант.
 */
export async function getActiveS6LogisticParams(
  segmentKeys: readonly string[] | null,
  tagConstantsVersion: string,
): Promise<S6LogisticConfigResolution> {
  if (segmentKeys === null || segmentKeys.length === 0) {
    return { params: DEFAULT_S6_LOGISTIC_PARAMS, modelVersion: 'default' };
  }

  const cacheKey = `${tagConstantsVersion}::${segmentKeys.join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Fallback: только skippable-часть сегмента прежней схемы без device_type
  const legacySegmentKey = segmentKeys[segmentKeys.length - 1]!;
  const skippablePart = legacySegmentKey.includes('|')
    ? (legacySegmentKey.split('|')[1] ?? legacySegmentKey)
    : legacySegmentKey;

  const row = await resolveBySegmentChain(
    Array.from(new Set([
      ...segmentKeys,
      skippablePart,
      'global',
    ])),
    tagConstantsVersion,
  );

  const resolution: S6LogisticConfigResolution = row !== null
    ? { params: rowToParams(row), modelVersion: row.id }
    : { params: DEFAULT_S6_LOGISTIC_PARAMS, modelVersion: 'default' };

  cache.set(cacheKey, resolution);
  return resolution;
}

/**
 * Возвращает все версии логистических конфигураций S6, сортировка по дате фита desc.
 */
export async function listS6LogisticConfigs(): Promise<S6LogisticConfigSelect[]> {
  return db
    .select()
    .from(s6LogisticConfigs)
    .orderBy(desc(s6LogisticConfigs.fittedAt));
}

/**
 * Активирует версию логистической конфигурации S6 по id.
 * Транзакция гарантирует инвариант: ровно одна is_active=true на пару segment_key + tag_constants_version.
 * Нельзя активировать конфигурацию, запланированную к удалению.
 */
export async function activateS6LogisticConfig(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select()
      .from(s6LogisticConfigs)
      .where(eq(s6LogisticConfigs.id, id))
      .limit(1);

    if (!target.length) {
      throw new S6LogisticConfigError(
        'Конфигурация не найдена',
        404,
        'S6_LOGISTIC_CONFIG_NOT_FOUND',
      );
    }

    const row = target[0]!;

    if (row.deletionScheduledAt !== null) {
      throw new S6LogisticConfigError(
        'Нельзя активировать конфигурацию, запланированную к удалению',
        409,
        'S6_LOGISTIC_CONFIG_DELETION_SCHEDULED',
      );
    }

    await tx
      .update(s6LogisticConfigs)
      .set({ isActive: false })
      .where(and(
        eq(s6LogisticConfigs.segmentKey, row.segmentKey),
        eq(s6LogisticConfigs.tagConstantsVersion, row.tagConstantsVersion),
      ));

    await tx
      .update(s6LogisticConfigs)
      .set({ isActive: true })
      .where(eq(s6LogisticConfigs.id, id));
  });

  invalidateS6LogisticCache();
}

/**
 * Деактивирует активную логистическую конфигурацию S6 по id.
 */
export async function deactivateS6LogisticConfig(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s6LogisticConfigs)
    .where(eq(s6LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S6LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S6_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (!rows[0]!.isActive) {
    throw new S6LogisticConfigError(
      'Конфигурация уже деактивирована',
      409,
      'S6_LOGISTIC_CONFIG_ALREADY_INACTIVE',
    );
  }

  await db
    .update(s6LogisticConfigs)
    .set({ isActive: false })
    .where(eq(s6LogisticConfigs.id, id));

  invalidateS6LogisticCache();
}

/**
 * Планирует удаление неактивной конфигурации через 60 минут.
 */
export async function scheduleS6LogisticConfigDeletion(id: string): Promise<Date> {
  const rows = await db
    .select()
    .from(s6LogisticConfigs)
    .where(eq(s6LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S6LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S6_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.isActive) {
    throw new S6LogisticConfigError(
      'Нельзя запланировать удаление активной конфигурации',
      409,
      'S6_LOGISTIC_CONFIG_ACTIVE',
    );
  }

  const deletionScheduledAt = new Date(Date.now() + DELETION_DELAY_MS);

  await db
    .update(s6LogisticConfigs)
    .set({ deletionScheduledAt })
    .where(eq(s6LogisticConfigs.id, id));

  return deletionScheduledAt;
}

/**
 * Отменяет запланированное удаление конфигурации.
 */
export async function cancelS6LogisticConfigDeletion(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s6LogisticConfigs)
    .where(eq(s6LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S6LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S6_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.deletionScheduledAt === null) {
    throw new S6LogisticConfigError(
      'Удаление не запланировано',
      409,
      'S6_LOGISTIC_CONFIG_NO_DELETION_SCHEDULED',
    );
  }

  await db
    .update(s6LogisticConfigs)
    .set({ deletionScheduledAt: null })
    .where(eq(s6LogisticConfigs.id, id));
}

/**
 * Удаляет конфигурации с истёкшим таймером deletion_scheduled_at.
 * Вызывается джобом scheduled_deletion.ts. Возвращает количество удалённых строк.
 */
export async function deleteScheduledS6LogisticConfigs(): Promise<number> {
  const now = new Date();
  const rows = await db
    .delete(s6LogisticConfigs)
    .where(and(
      isNotNull(s6LogisticConfigs.deletionScheduledAt),
      lte(s6LogisticConfigs.deletionScheduledAt, now),
    ))
    .returning({ id: s6LogisticConfigs.id });

  if (rows.length > 0) {
    invalidateS6LogisticCache();
  }

  return rows.length;
}