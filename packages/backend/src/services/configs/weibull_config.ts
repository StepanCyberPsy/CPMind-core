import {
  eq,
  and,
  desc,
  lte,
  isNotNull,
} from 'drizzle-orm';
import { DEFAULT_WEIBULL_PARAMS, type WeibullParams } from '@cpmind/shared';
import { db } from '../../db/index.js';
import { s1WeibullConfigs, type S1WeibullConfigSelect } from '../../db/schema.js';

const DELETION_DELAY_MS = 60 * 60_000;

class S1WeibullConfigError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'S1WeibullConfigError';
  }
}

export interface WeibullConfigResolution {
  params: WeibullParams;
  modelVersion: string;
}

const cache = new Map<string, WeibullConfigResolution>();

/**
 * Сбрасывает весь кэш активных Weibull-параметров.
 * Вызывается после активации, деактивации или удаления конфигурации.
 */
export function invalidateWeibullCache(): void {
  cache.clear();
}

async function queryActiveBySegmentKey(
  segmentKey: string,
): Promise<S1WeibullConfigSelect | null> {
  const rows = await db
    .select()
    .from(s1WeibullConfigs)
    .where(and(
      eq(s1WeibullConfigs.segmentKey, segmentKey),
      eq(s1WeibullConfigs.isActive, true),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Возвращает активные Weibull-параметры для сегмента с fallback-цепочкой:
 *   device_type|creative_group → creative_group → global → DEFAULT_WEIBULL_PARAMS
 *
 * Результат кэшируется по запрошенному segmentKey.
 */
export async function getActiveWeibullParams(
  segmentKey: string,
): Promise<WeibullConfigResolution> {
  const cached = cache.get(segmentKey);
  if (cached !== undefined) return cached;

  const exactRow = await queryActiveBySegmentKey(segmentKey);
  if (exactRow !== null) {
    const resolution: WeibullConfigResolution = {
      params: { k: exactRow.k, lambda: exactRow.lambda },
      modelVersion: exactRow.id,
    };
    cache.set(segmentKey, resolution);
    return resolution;
  }

  const creativeGroup = segmentKey.includes('|')
    ? (segmentKey.split('|')[1] ?? segmentKey)
    : segmentKey;

  const groupRow = await queryActiveBySegmentKey(creativeGroup);
  if (groupRow !== null) {
    const resolution: WeibullConfigResolution = {
      params: { k: groupRow.k, lambda: groupRow.lambda },
      modelVersion: groupRow.id,
    };
    cache.set(segmentKey, resolution);
    return resolution;
  }

  const globalRow = await queryActiveBySegmentKey('global');
  if (globalRow !== null) {
    const resolution: WeibullConfigResolution = {
      params: { k: globalRow.k, lambda: globalRow.lambda },
      modelVersion: globalRow.id,
    };
    cache.set(segmentKey, resolution);
    return resolution;
  }

  const resolution: WeibullConfigResolution = {
    params: DEFAULT_WEIBULL_PARAMS,
    modelVersion: 'default',
  };
  cache.set(segmentKey, resolution);
  return resolution;
}

/**
 * Возвращает все версии Weibull-конфигураций, сортировка по дате фита desc.
 */
export async function listS1WeibullConfigs(): Promise<S1WeibullConfigSelect[]> {
  return db
    .select()
    .from(s1WeibullConfigs)
    .orderBy(desc(s1WeibullConfigs.fittedAt));
}

/**
 * Активирует версию Weibull-конфигурации по id.
 * Транзакция гарантирует инвариант: ровно одна is_active=true на segment_key.
 * Нельзя активировать конфигурацию, запланированную к удалению.
 */
export async function activateS1WeibullConfig(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select()
      .from(s1WeibullConfigs)
      .where(eq(s1WeibullConfigs.id, id))
      .limit(1);

    if (!target.length) {
      throw new S1WeibullConfigError(
        'Конфигурация не найдена',
        404,
        'S1_WEIBULL_CONFIG_NOT_FOUND',
      );
    }

    const row = target[0]!;

    if (row.deletionScheduledAt !== null) {
      throw new S1WeibullConfigError(
        'Нельзя активировать конфигурацию, запланированную к удалению',
        409,
        'S1_WEIBULL_CONFIG_DELETION_SCHEDULED',
      );
    }

    await tx
      .update(s1WeibullConfigs)
      .set({ isActive: false })
      .where(eq(s1WeibullConfigs.segmentKey, row.segmentKey));

    await tx
      .update(s1WeibullConfigs)
      .set({ isActive: true })
      .where(eq(s1WeibullConfigs.id, id));
  });

  invalidateWeibullCache();
}

/**
 * Деактивирует активную Weibull-конфигурацию по id.
 */
export async function deactivateS1WeibullConfig(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s1WeibullConfigs)
    .where(eq(s1WeibullConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S1WeibullConfigError(
      'Конфигурация не найдена',
      404,
      'S1_WEIBULL_CONFIG_NOT_FOUND',
    );
  }

  if (!rows[0]!.isActive) {
    throw new S1WeibullConfigError(
      'Конфигурация уже деактивирована',
      409,
      'S1_WEIBULL_CONFIG_ALREADY_INACTIVE',
    );
  }

  await db
    .update(s1WeibullConfigs)
    .set({ isActive: false })
    .where(eq(s1WeibullConfigs.id, id));

  invalidateWeibullCache();
}

/**
 * Планирует удаление неактивной конфигурации через 60 минут.
 * Возвращает момент запланированного удаления для отображения таймера в UI.
 */
export async function scheduleS1WeibullConfigDeletion(id: string): Promise<Date> {
  const rows = await db
    .select()
    .from(s1WeibullConfigs)
    .where(eq(s1WeibullConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S1WeibullConfigError(
      'Конфигурация не найдена',
      404,
      'S1_WEIBULL_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.isActive) {
    throw new S1WeibullConfigError(
      'Нельзя запланировать удаление активной конфигурации',
      409,
      'S1_WEIBULL_CONFIG_ACTIVE',
    );
  }

  const deletionScheduledAt = new Date(Date.now() + DELETION_DELAY_MS);

  await db
    .update(s1WeibullConfigs)
    .set({ deletionScheduledAt })
    .where(eq(s1WeibullConfigs.id, id));

  return deletionScheduledAt;
}

/**
 * Отменяет запланированное удаление конфигурации.
 */
export async function cancelS1WeibullConfigDeletion(id: string): Promise<void> {
  const rows = await db
    .select()
    .from(s1WeibullConfigs)
    .where(eq(s1WeibullConfigs.id, id))
    .limit(1);

  if (!rows.length) {
    throw new S1WeibullConfigError(
      'Конфигурация не найдена',
      404,
      'S1_WEIBULL_CONFIG_NOT_FOUND',
    );
  }

  if (rows[0]!.deletionScheduledAt === null) {
    throw new S1WeibullConfigError(
      'Удаление не запланировано',
      409,
      'S1_WEIBULL_CONFIG_NO_DELETION_SCHEDULED',
    );
  }

  await db
    .update(s1WeibullConfigs)
    .set({ deletionScheduledAt: null })
    .where(eq(s1WeibullConfigs.id, id));
}

/**
 * Удаляет конфигурации с истёкшим таймером deletion_scheduled_at.
 * Вызывается джобом scheduled_deletion.ts. Возвращает количество удалённых строк.
 */
export async function deleteScheduledS1WeibullConfigs(): Promise<number> {
  const now = new Date();
  const rows = await db
    .delete(s1WeibullConfigs)
    .where(and(
      isNotNull(s1WeibullConfigs.deletionScheduledAt),
      lte(s1WeibullConfigs.deletionScheduledAt, now),
    ))
    .returning({ id: s1WeibullConfigs.id });

  if (rows.length > 0) {
    invalidateWeibullCache();
  }

  return rows.length;
}