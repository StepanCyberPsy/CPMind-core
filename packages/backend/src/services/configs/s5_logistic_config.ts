import {
  eq,
  and,
  desc,
  lte,
  isNotNull,
} from 'drizzle-orm';
import {
  DEFAULT_S5_DESKTOP,
  DEFAULT_S5_MOBILE_TABLET,
  type S5LogisticParams,
} from '@cpmind/shared';
import { db } from '../../db/index.js';
import { s5LogisticConfigs, type S5LogisticConfigSelect } from '../../db/schema.js';

const DELETION_DELAY_MS = 60 * 60_000;

class S5LogisticConfigError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'S5LogisticConfigError';
  }
}

export interface S5LogisticConfigResolution {
  params: S5LogisticParams;
  modelVersion: string;
}

const cache = new Map<string, S5LogisticConfigResolution>();

/**
 * Сбрасывает весь кэш активных логистических параметров S5.
 * Вызывается после активации, деактивации или удаления конфигурации.
 */
export function invalidateS5LogisticCache(): void {
  cache.clear();
}

// Активная модель сегмента. С версией констант — модель, обученная на данных этой версии,
// без версии — последняя обученная из активных моделей сегмента
async function queryActiveBySegmentKey(
  segmentKey: string,
  tagConstantsVersion: string | null,
): Promise<S5LogisticConfigSelect | null> {
  const rows = await db
    .select()
    .from(s5LogisticConfigs)
    .where(and(
      eq(s5LogisticConfigs.segmentKey, segmentKey),
      eq(s5LogisticConfigs.isActive, true),
      tagConstantsVersion !== null
        ? eq(s5LogisticConfigs.tagConstantsVersion, tagConstantsVersion)
        : undefined,
    ))
    .orderBy(desc(s5LogisticConfigs.fittedAt))
    .limit(1);
  return rows[0] ?? null;
}

// Первая найденная модель по цепочке сегментов: на каждом уровне модель версии констант
// показа приоритетнее модели сегмента без учёта версии
async function resolveBySegmentChain(
  segmentKeys: readonly string[],
  tagConstantsVersion: string,
): Promise<S5LogisticConfigSelect | null> {
  for (const segmentKey of segmentKeys) {
    const versioned = await queryActiveBySegmentKey(segmentKey, tagConstantsVersion);
    if (versioned !== null) return versioned;

    const latest = await queryActiveBySegmentKey(segmentKey, null);
    if (latest !== null) return latest;
  }
  return null;
}

function rowToParams(
  row: S5LogisticConfigSelect,
  segmentKey: 'desktop' | 'mobile_tablet',
): S5LogisticParams {
  const c = row.coefficients as Record<string, number>;
  return {
    segmentKey,
    beta0: c['beta0'] ?? 0,
    beta1: c['beta1'] ?? 0,
    beta2: c['beta2'] ?? 0,
    beta3: c['beta3'] ?? 0,
    beta4: c['beta4'] ?? 0,
  };
}

/**
 * Возвращает активные логистические параметры S5 для сегмента и версии констант с fallback-цепочкой:
 *   desktop | mobile_tablet → global → DEFAULT_S5_DESKTOP | DEFAULT_S5_MOBILE_TABLET
 * На каждом уровне модель, обученная на версии констант показа, приоритетнее остальных.
 *
 * Результат кэшируется по сегменту и версии констант.
 */
export async function getActiveS5LogisticParams(
  segmentKey: 'desktop' | 'mobile_tablet',
  tagConstantsVersion: string,
): Promise<S5LogisticConfigResolution> {
  const cacheKey = `${tagConstantsVersion}::${segmentKey}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const row = await resolveBySegmentChain(
    [
      segmentKey,
      'global',
    ],
    tagConstantsVersion,
  );

  const defaultParams = segmentKey === 'desktop'
    ? DEFAULT_S5_DESKTOP
    : DEFAULT_S5_MOBILE_TABLET;

  const resolution: S5LogisticConfigResolution = row !== null
    ? { params: rowToParams(row, segmentKey), modelVersion: row.id }
    : { params: defaultParams, modelVersion: 'default' };

  cache.set(cacheKey, resolution);
  return resolution;
}

/**
 * Возвращает все версии логистических конфигураций S5, сортировка по дате фита desc.
 */
export async function listS5LogisticConfigs(): Promise<S5LogisticConfigSelect[]> {
  return db
    .select()
    .from(s5LogisticConfigs)
    .orderBy(desc(s5LogisticConfigs.fittedAt));
}

/**
 * Активирует версию логистической конфигурации S5 по id.
 * Транзакция гарантирует инвариант: ровно одна is_active=true на пару segment_key + tag_constants_version.
 * Нельзя активировать конфигурацию, запланированную к удалению.
 */
export async function activateS5LogisticConfig(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select()
      .from(s5LogisticConfigs)
      .where(eq(s5LogisticConfigs.id, id))
      .limit(1);

    if (!target.length) {
      throw new S5LogisticConfigError(
        'Конфигурация не найдена',
        404,
        'S5_LOGISTIC_CONFIG_NOT_FOUND',
      );
    }

    const row = target[0]!;

    if (row.deletionScheduledAt !== null) {
      throw new S5LogisticConfigError(
        'Нельзя активировать конфигурацию, запланированную к удалению',
        409,
        'S5_LOGISTIC_CONFIG_DELETION_SCHEDULED',
      );
    }

    await tx
      .update(s5LogisticConfigs)
      .set({ isActive: false })
      .where(and(
        eq(s5LogisticConfigs.segmentKey, row.segmentKey),
        eq(s5LogisticConfigs.tagConstantsVersion, row.tagConstantsVersion),
      ));

    await tx
      .update(s5LogisticConfigs)
      .set({ isActive: true })
      .where(eq(s5LogisticConfigs.id, id));
  });

  invalidateS5LogisticCache();
}

/**
 * Деактивирует активную логистическую конфигурацию S5 по id.
 */
export async function deactivateS5LogisticConfig(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s5LogisticConfigs)
    .where(eq(s5LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S5LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S5_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (!rows[0]!.isActive) {
    throw new S5LogisticConfigError(
      'Конфигурация уже деактивирована',
      409,
      'S5_LOGISTIC_CONFIG_ALREADY_INACTIVE',
    );
  }

  await db
    .update(s5LogisticConfigs)
    .set({ isActive: false })
    .where(eq(s5LogisticConfigs.id, id));

  invalidateS5LogisticCache();
}

/**
 * Планирует удаление неактивной конфигурации через 60 минут.
 * Возвращает момент запланированного удаления для отображения таймера в UI.
 */
export async function scheduleS5LogisticConfigDeletion(id: string): Promise<Date> {
  const rows = await db
    .select()
    .from(s5LogisticConfigs)
    .where(eq(s5LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S5LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S5_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.isActive) {
    throw new S5LogisticConfigError(
      'Нельзя запланировать удаление активной конфигурации',
      409,
      'S5_LOGISTIC_CONFIG_ACTIVE',
    );
  }

  const deletionScheduledAt = new Date(Date.now() + DELETION_DELAY_MS);

  await db
    .update(s5LogisticConfigs)
    .set({ deletionScheduledAt })
    .where(eq(s5LogisticConfigs.id, id));

  return deletionScheduledAt;
}

/**
 * Отменяет запланированное удаление конфигурации.
 */
export async function cancelS5LogisticConfigDeletion(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s5LogisticConfigs)
    .where(eq(s5LogisticConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S5LogisticConfigError(
      'Конфигурация не найдена',
      404,
      'S5_LOGISTIC_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.deletionScheduledAt === null) {
    throw new S5LogisticConfigError(
      'Удаление не запланировано',
      409,
      'S5_LOGISTIC_CONFIG_NO_DELETION_SCHEDULED',
    );
  }

  await db
    .update(s5LogisticConfigs)
    .set({ deletionScheduledAt: null })
    .where(eq(s5LogisticConfigs.id, id));
}

/**
 * Удаляет конфигурации с истёкшим таймером deletion_scheduled_at.
 * Вызывается джобом scheduled_deletion.ts. Возвращает количество удалённых строк.
 */
export async function deleteScheduledS5LogisticConfigs(): Promise<number> {
  const now = new Date();
  const rows = await db
    .delete(s5LogisticConfigs)
    .where(and(
      isNotNull(s5LogisticConfigs.deletionScheduledAt),
      lte(s5LogisticConfigs.deletionScheduledAt, now),
    ))
    .returning({ id: s5LogisticConfigs.id });

  if (rows.length > 0) {
    invalidateS5LogisticCache();
  }

  return rows.length;
}