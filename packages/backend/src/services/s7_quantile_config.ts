import { eq, and, desc, lte, isNotNull } from 'drizzle-orm';
import { DEFAULT_S7_THRESHOLDS, type S7Thresholds } from '@cpmind/shared';
import { db } from '../db/index.js';
import { s7QuantileConfigs, type S7QuantileConfigSelect } from '../db/schema.js';

const DELETION_DELAY_MS = 60 * 60_000;

class S7QuantileConfigError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'S7QuantileConfigError';
  }
}

export interface S7ThresholdsResolution {
  thresholds: S7Thresholds;
  modelVersion: string;
}

const cache = new Map<string, S7ThresholdsResolution>();

/**
 * Сбрасывает весь кэш активных квантильных порогов S7.
 * Вызывается после активации, деактивации или удаления конфигурации.
 */
export function invalidateS7QuantileCache(): void {
  cache.clear();
}

async function queryActiveByDeviceType(
  deviceType: string,
): Promise<S7QuantileConfigSelect | null> {
  const rows = await db
    .select()
    .from(s7QuantileConfigs)
    .where(and(
      eq(s7QuantileConfigs.deviceType, deviceType),
      eq(s7QuantileConfigs.isActive, true),
    ))
    .limit(1);
  return rows[0] ?? null;
}

function rowToThresholds(row: S7QuantileConfigSelect): S7Thresholds {
  return {
    relativeYLow: row.relativeYLow,
    relativeYMid: row.relativeYMid,
    clutterMid: row.clutterMid,
    clutterHigh: row.clutterHigh,
  };
}

/**
 * Возвращает активные квантильные пороги S7 для device_type с fallback-цепочкой:
 *   device_type → global → DEFAULT_S7_THRESHOLDS[deviceType]
 *
 * Результат кэшируется по запрошенному deviceType.
 */
export async function getActiveS7Thresholds(
  deviceType: 'desktop' | 'mobile' | 'tablet',
): Promise<S7ThresholdsResolution> {
  const cached = cache.get(deviceType);
  if (cached !== undefined) return cached;

  const exactRow = await queryActiveByDeviceType(deviceType);
  if (exactRow !== null) {
    const resolution: S7ThresholdsResolution = {
      thresholds: rowToThresholds(exactRow),
      modelVersion: exactRow.id,
    };
    cache.set(deviceType, resolution);
    return resolution;
  }

  const globalRow = await queryActiveByDeviceType('global');
  if (globalRow !== null) {
    const resolution: S7ThresholdsResolution = {
      thresholds: rowToThresholds(globalRow),
      modelVersion: globalRow.id,
    };
    cache.set(deviceType, resolution);
    return resolution;
  }

  const resolution: S7ThresholdsResolution = {
    thresholds: DEFAULT_S7_THRESHOLDS[deviceType],
    modelVersion: 'default',
  };
  cache.set(deviceType, resolution);
  return resolution;
}

/**
 * Возвращает все версии квантильных конфигураций S7, сортировка по дате вычисления desc.
 */
export async function listS7QuantileConfigs(): Promise<S7QuantileConfigSelect[]> {
  return db
    .select()
    .from(s7QuantileConfigs)
    .orderBy(desc(s7QuantileConfigs.computedAt));
}

/**
 * Активирует версию квантильной конфигурации S7 по id.
 * Транзакция гарантирует инвариант: ровно одна is_active=true на device_type.
 * Нельзя активировать конфигурацию, запланированную к удалению.
 */
export async function activateS7QuantileConfig(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select()
      .from(s7QuantileConfigs)
      .where(eq(s7QuantileConfigs.id, id))
      .limit(1);

    if (!target.length) {
      throw new S7QuantileConfigError(
        'Конфигурация не найдена',
        404,
        'S7_QUANTILE_CONFIG_NOT_FOUND',
      );
    }

    const row = target[0]!;

    if (row.deletionScheduledAt !== null) {
      throw new S7QuantileConfigError(
        'Нельзя активировать конфигурацию, запланированную к удалению',
        409,
        'S7_QUANTILE_CONFIG_DELETION_SCHEDULED',
      );
    }

    await tx
      .update(s7QuantileConfigs)
      .set({ isActive: false })
      .where(eq(s7QuantileConfigs.deviceType, row.deviceType));

    await tx
      .update(s7QuantileConfigs)
      .set({ isActive: true })
      .where(eq(s7QuantileConfigs.id, id));
  });

  invalidateS7QuantileCache();
}

/**
 * Деактивирует активную квантильную конфигурацию S7 по id.
 */
export async function deactivateS7QuantileConfig(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s7QuantileConfigs)
    .where(eq(s7QuantileConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S7QuantileConfigError(
      'Конфигурация не найдена',
      404,
      'S7_QUANTILE_CONFIG_NOT_FOUND',
    );
  }

  if (!rows[0]!.isActive) {
    throw new S7QuantileConfigError(
      'Конфигурация уже деактивирована',
      409,
      'S7_QUANTILE_CONFIG_ALREADY_INACTIVE',
    );
  }

  await db
    .update(s7QuantileConfigs)
    .set({ isActive: false })
    .where(eq(s7QuantileConfigs.id, id));

  invalidateS7QuantileCache();
}

/**
 * Планирует удаление неактивной конфигурации через 60 минут.
 */
export async function scheduleS7QuantileConfigDeletion(id: string): Promise<Date> {
  const rows = await db
    .select()
    .from(s7QuantileConfigs)
    .where(eq(s7QuantileConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S7QuantileConfigError(
      'Конфигурация не найдена',
      404,
      'S7_QUANTILE_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.isActive) {
    throw new S7QuantileConfigError(
      'Нельзя запланировать удаление активной конфигурации',
      409,
      'S7_QUANTILE_CONFIG_ACTIVE',
    );
  }

  const deletionScheduledAt = new Date(Date.now() + DELETION_DELAY_MS);

  await db
    .update(s7QuantileConfigs)
    .set({ deletionScheduledAt })
    .where(eq(s7QuantileConfigs.id, id));

  return deletionScheduledAt;
}

/**
 * Отменяет запланированное удаление конфигурации.
 */
export async function cancelS7QuantileConfigDeletion(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s7QuantileConfigs)
    .where(eq(s7QuantileConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S7QuantileConfigError(
      'Конфигурация не найдена',
      404,
      'S7_QUANTILE_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.deletionScheduledAt === null) {
    throw new S7QuantileConfigError(
      'Удаление не запланировано',
      409,
      'S7_QUANTILE_CONFIG_NO_DELETION_SCHEDULED',
    );
  }

  await db
    .update(s7QuantileConfigs)
    .set({ deletionScheduledAt: null })
    .where(eq(s7QuantileConfigs.id, id));
}

/**
 * Удаляет конфигурации с истёкшим таймером deletion_scheduled_at.
 * Вызывается джобом scheduled_deletion.ts. Возвращает количество удалённых строк.
 */
export async function deleteScheduledS7QuantileConfigs(): Promise<number> {
  const now = new Date();
  const rows = await db
    .delete(s7QuantileConfigs)
    .where(and(
      isNotNull(s7QuantileConfigs.deletionScheduledAt),
      lte(s7QuantileConfigs.deletionScheduledAt, now),
    ))
    .returning({ id: s7QuantileConfigs.id });

  if (rows.length > 0) {
    invalidateS7QuantileCache();
  }

  return rows.length;
}