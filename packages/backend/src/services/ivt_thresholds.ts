import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { ivtThresholdsConfigs, type IvtThresholdsConfigSelect } from '../db/schema.js';
import {
  IvtThresholdsSchema,
  DEFAULT_IVT_THRESHOLDS,
  type IvtThresholds,
} from '@cpmind/shared';

class IvtThresholdsServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'IvtThresholdsServiceError';
  }
}

let cache: IvtThresholds | null = null;

export function invalidateIvtThresholdsCache(): void {
  cache = null;
}

/**
 * Возвращает активные пороги IVT из кэша или БД.
 * Fallback на DEFAULT_IVT_THRESHOLDS (все поля null) если таблица пуста —
 * в этом случае classifyIvtSync пропустит все SIVT-правила до первой калибровки.
 */
export async function getActiveIvtThresholds(): Promise<IvtThresholds> {
  if (cache !== null) return cache;

  const rows = await db
    .select()
    .from(ivtThresholdsConfigs)
    .where(eq(ivtThresholdsConfigs.isActive, true))
    .limit(1);

  if (!rows.length) return DEFAULT_IVT_THRESHOLDS;

  const row = rows[0]!;
  const parsed = IvtThresholdsSchema.safeParse(row.thresholds);

  if (!parsed.success) return DEFAULT_IVT_THRESHOLDS;

  cache = parsed.data;
  return cache;
}

export async function listIvtThresholdsConfigs(): Promise<IvtThresholdsConfigSelect[]> {
  return db
    .select()
    .from(ivtThresholdsConfigs)
    .orderBy(ivtThresholdsConfigs.createdAt);
}

export async function createIvtThresholdsConfig(data: {
  version: string;
  thresholds: IvtThresholds;
  description?: string;
}): Promise<IvtThresholdsConfigSelect> {
  const parsed = IvtThresholdsSchema.safeParse(data.thresholds);
  if (!parsed.success) {
    throw new IvtThresholdsServiceError(
      'Невалидные значения порогов',
      400,
      'IVT_THRESHOLDS_INVALID',
    );
  }

  const rows = await db
    .insert(ivtThresholdsConfigs)
    .values({
      version: data.version,
      thresholds: parsed.data as unknown as Record<string, unknown>,
      description: data.description ?? null,
      isActive: false,
    })
    .returning();

  return rows[0]!;
}

export async function activateIvtThresholdsConfig(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select({ id: ivtThresholdsConfigs.id })
      .from(ivtThresholdsConfigs)
      .where(eq(ivtThresholdsConfigs.id, id))
      .limit(1);

    if (!target.length) {
      throw new IvtThresholdsServiceError(
        'Конфигурация порогов не найдена',
        404,
        'IVT_THRESHOLDS_NOT_FOUND',
      );
    }

    await tx
      .update(ivtThresholdsConfigs)
      .set({ isActive: false })
      .where(eq(ivtThresholdsConfigs.isActive, true));

    await tx
      .update(ivtThresholdsConfigs)
      .set({ isActive: true })
      .where(eq(ivtThresholdsConfigs.id, id));
  });

  invalidateIvtThresholdsCache();
}

export async function deactivateIvtThresholdsConfig(id: string): Promise<void> {
  const rows = await db
    .update(ivtThresholdsConfigs)
    .set({ isActive: false })
    .where(eq(ivtThresholdsConfigs.id, id))
    .returning({ id: ivtThresholdsConfigs.id });

  if (!rows.length) {
    throw new IvtThresholdsServiceError(
      'Конфигурация порогов не найдена',
      404,
      'IVT_THRESHOLDS_NOT_FOUND',
    );
  }

  invalidateIvtThresholdsCache();
}