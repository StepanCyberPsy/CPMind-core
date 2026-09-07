import { eq, and, desc, lte, isNotNull } from 'drizzle-orm';
import { DEFAULT_S4_CONFIGS, type S4Config } from '@cpmind/shared';
import { db } from '../../db/index.js';
import { s4Configs, type S4ConfigSelect } from '../../db/schema.js';

const DELETION_DELAY_MS = 60 * 60_000;

class S4ConfigError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'S4ConfigError';
  }
}

export interface S4ConfigResolution {
  config: S4Config;
  modelVersion: string;
}

const cache = new Map<string, S4ConfigResolution>();

/**
 * Сбрасывает весь кэш активных конфигураций S4.
 * Вызывается после активации, деактивации или удаления конфигурации.
 */
export function invalidateS4Cache(): void {
  cache.clear();
}

async function queryActiveBySegmentKey(
  segmentKey: string,
): Promise<S4ConfigSelect | null> {
  const rows = await db
    .select()
    .from(s4Configs)
    .where(and(
      eq(s4Configs.segmentKey, segmentKey),
      eq(s4Configs.isActive, true),
    ))
    .limit(1);
  return rows[0] ?? null;
}

function rowToConfig(row: S4ConfigSelect): S4Config {
  return {
    lambda: row.lambda,
    tRefMs: row.tRefMs,
  };
}

/**
 * Возвращает активную конфигурацию S4 для сегмента с fallback-цепочкой:
 *   точный сегмент → 'default' (в БД) → DEFAULT_S4_CONFIGS[segmentKey] → DEFAULT_S4_CONFIGS.default
 *
 * Результат кэшируется по запрошенному segmentKey.
 */
export async function getActiveS4Config(
  segmentKey: string,
): Promise<S4ConfigResolution> {
  const cached = cache.get(segmentKey);
  if (cached !== undefined) return cached;

  const exactRow = await queryActiveBySegmentKey(segmentKey);
  if (exactRow !== null) {
    const resolution: S4ConfigResolution = {
      config: rowToConfig(exactRow),
      modelVersion: exactRow.id,
    };
    cache.set(segmentKey, resolution);
    return resolution;
  }

  const defaultRow = await queryActiveBySegmentKey('default');
  if (defaultRow !== null) {
    const resolution: S4ConfigResolution = {
      config: rowToConfig(defaultRow),
      modelVersion: defaultRow.id,
    };
    cache.set(segmentKey, resolution);
    return resolution;
  }

  const resolution: S4ConfigResolution = {
    config: DEFAULT_S4_CONFIGS[segmentKey] ??
      DEFAULT_S4_CONFIGS['default'] ??
      { lambda: 0.08, tRefMs: 5000 },
    modelVersion: 'default',
  };
  cache.set(segmentKey, resolution);
  return resolution;
}

/**
 * Возвращает все версии конфигураций S4, сортировка по дате создания desc.
 */
export async function listS4Configs(): Promise<S4ConfigSelect[]> {
  return db
    .select()
    .from(s4Configs)
    .orderBy(desc(s4Configs.createdAt));
}

/**
 * Активирует версию конфигурации S4 по id.
 * Транзакция гарантирует инвариант: ровно одна is_active=true на segment_key.
 * Нельзя активировать конфигурацию, запланированную к удалению.
 */
export async function activateS4Config(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select()
      .from(s4Configs)
      .where(eq(s4Configs.id, id))
      .limit(1);

    if (!target.length) {
      throw new S4ConfigError(
        'Конфигурация не найдена',
        404,
        'S4_CONFIG_NOT_FOUND',
      );
    }

    const row = target[0]!;

    if (row.deletionScheduledAt !== null) {
      throw new S4ConfigError(
        'Нельзя активировать конфигурацию, запланированную к удалению',
        409,
        'S4_CONFIG_DELETION_SCHEDULED',
      );
    }

    await tx
      .update(s4Configs)
      .set({ isActive: false })
      .where(eq(s4Configs.segmentKey, row.segmentKey));

    await tx
      .update(s4Configs)
      .set({ isActive: true })
      .where(eq(s4Configs.id, id));
  });

  invalidateS4Cache();
}

/**
 * Деактивирует активную конфигурацию S4 по id.
 */
export async function deactivateS4Config(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s4Configs)
    .where(eq(s4Configs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S4ConfigError(
      'Конфигурация не найдена',
      404,
      'S4_CONFIG_NOT_FOUND',
    );
  }

  if (!rows[0]!.isActive) {
    throw new S4ConfigError(
      'Конфигурация уже деактивирована',
      409,
      'S4_CONFIG_ALREADY_INACTIVE',
    );
  }

  await db
    .update(s4Configs)
    .set({ isActive: false })
    .where(eq(s4Configs.id, id));

  invalidateS4Cache();
}

/**
 * Планирует удаление неактивной конфигурации через 60 минут.
 * Возвращает момент запланированного удаления для отображения таймера в UI.
 */
export async function scheduleS4ConfigDeletion(id: string): Promise<Date> {
  const rows = await db
    .select()
    .from(s4Configs)
    .where(eq(s4Configs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S4ConfigError(
      'Конфигурация не найдена',
      404,
      'S4_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.isActive) {
    throw new S4ConfigError(
      'Нельзя запланировать удаление активной конфигурации',
      409,
      'S4_CONFIG_ACTIVE',
    );
  }

  const deletionScheduledAt = new Date(Date.now() + DELETION_DELAY_MS);

  await db
    .update(s4Configs)
    .set({ deletionScheduledAt })
    .where(eq(s4Configs.id, id));

  return deletionScheduledAt;
}

/**
 * Отменяет запланированное удаление конфигурации.
 */
export async function cancelS4ConfigDeletion(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s4Configs)
    .where(eq(s4Configs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S4ConfigError(
      'Конфигурация не найдена',
      404,
      'S4_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.deletionScheduledAt === null) {
    throw new S4ConfigError(
      'Удаление не запланировано',
      409,
      'S4_CONFIG_NO_DELETION_SCHEDULED',
    );
  }

  await db
    .update(s4Configs)
    .set({ deletionScheduledAt: null })
    .where(eq(s4Configs.id, id));
}

/**
 * Удаляет конфигурации с истёкшим таймером deletion_scheduled_at.
 * Вызывается джобом scheduled_deletion.ts. Возвращает количество удалённых строк.
 */
export async function deleteScheduledS4Configs(): Promise<number> {
  const now = new Date();
  const rows = await db
    .delete(s4Configs)
    .where(and(
      isNotNull(s4Configs.deletionScheduledAt),
      lte(s4Configs.deletionScheduledAt, now),
    ))
    .returning({ id: s4Configs.id });

  if (rows.length > 0) {
    invalidateS4Cache();
  }

  return rows.length;
}