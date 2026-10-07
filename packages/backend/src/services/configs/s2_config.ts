import {
    eq,
    and,
    desc,
    lte,
    isNotNull,
} from 'drizzle-orm';
import { DEFAULT_S2_PARAMS, type S2Params } from '@cpmind/shared';
import { db } from '../../db/index.js';
import { s2Configs, type S2ConfigSelect } from '../../db/schema.js';

const DELETION_DELAY_MS = 60 * 60_000;

class S2ConfigError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly code: string,
    ) {
        super(message);
        this.name = 'S2ConfigError';
    }
}

export interface S2ConfigResolution {
    params: S2Params;
    modelVersion: string;
}

const cache = new Map<string, S2ConfigResolution>();

/**
 * Сбрасывает весь кэш активных квантильных параметров S2.
 * Вызывается после активации, деактивации или удаления конфигурации.
 */
export function invalidateS2Cache(): void {
    cache.clear();
}

async function queryActiveBySegmentKey(
    segmentKey: string,
): Promise<S2ConfigSelect | null> {
    const rows = await db
        .select()
        .from(s2Configs)
        .where(and(
            eq(s2Configs.segmentKey, segmentKey),
            eq(s2Configs.isActive, true),
        ))
        .limit(1);
    return rows[0] ?? null;
}

function toNumberArray(value: unknown): number[] | null {
    if (!Array.isArray(value)) return null;

    const result: number[] = [];

    for (const item of value) {
        if (typeof item !== 'number' || !Number.isFinite(item)) return null;
        result.push(item);
    }

    return result;
}

// Опорные точки конфигурации. null — структура непригодна для интерполяции: массив
// не распознан, короче двух точек либо длины не совпадают. Такая строка пропускается,
// выбор продолжается по цепочке, а не подменяется молча частично разобранными данными
function rowToParams(row: S2ConfigSelect): S2Params | null {
    const quantileLevels = toNumberArray(row.quantileLevels);
    const quantileValues = toNumberArray(row.quantileValues);

    if (quantileLevels === null || quantileValues === null) return null;
    if (quantileLevels.length < 2) return null;
    if (quantileLevels.length !== quantileValues.length) return null;

    return {
        quantileLevels,
        quantileValues,
    };
}

/**
 * Возвращает активные квантильные параметры S2 для сегмента с fallback-цепочкой:
 *   device_type|creative_group → creative_group → global → DEFAULT_S2_PARAMS
 *
 * Версия констант сбора в выборе не участвует: взвешивание отсчётов по фактическому
 * интервалу делает среднюю долю экрана независимой от S2_SAMPLE_INTERVAL_MS.
 *
 * Результат кэшируется по запрошенному segmentKey.
 */
export async function getActiveS2Params(
    segmentKey: string,
): Promise<S2ConfigResolution> {
    const cached = cache.get(segmentKey);
    if (cached !== undefined) return cached;

    const creativeGroup = segmentKey.includes('|')
        ? (segmentKey.split('|')[1] ?? segmentKey)
        : segmentKey;

    const chain = Array.from(new Set([
        segmentKey,
        creativeGroup,
        'global',
    ]));

    let resolution: S2ConfigResolution = {
        params: DEFAULT_S2_PARAMS,
        modelVersion: 'default',
    };

    for (const key of chain) {
        const row = await queryActiveBySegmentKey(key);
        if (row === null) continue;

        const params = rowToParams(row);
        if (params === null) continue;

        resolution = {
            params,
            modelVersion: row.id,
        };
        break;
    }

    cache.set(segmentKey, resolution);
    return resolution;
}

/**
 * Возвращает все версии квантильных конфигураций S2, сортировка по дате фита desc.
 */
export async function listS2Configs(): Promise<S2ConfigSelect[]> {
    return db
        .select()
        .from(s2Configs)
        .orderBy(desc(s2Configs.fittedAt));
}

/**
 * Активирует версию квантильной конфигурации S2 по id.
 * Транзакция гарантирует инвариант: ровно одна is_active=true на segment_key.
 * Нельзя активировать конфигурацию, запланированную к удалению.
 */
export async function activateS2Config(id: string): Promise<void> {
    await db.transaction(async (tx) => {
        const target = await tx
            .select()
            .from(s2Configs)
            .where(eq(s2Configs.id, id))
            .limit(1);

        if (!target.length) {
            throw new S2ConfigError(
                'Конфигурация не найдена',
                404,
                'S2_CONFIG_NOT_FOUND',
            );
        }

        const row = target[0]!;

        if (row.deletionScheduledAt !== null) {
            throw new S2ConfigError(
                'Нельзя активировать конфигурацию, запланированную к удалению',
                409,
                'S2_CONFIG_DELETION_SCHEDULED',
            );
        }

        if (rowToParams(row) === null) {
            throw new S2ConfigError(
                'Опорные квантили конфигурации непригодны для нормализации',
                422,
                'S2_CONFIG_QUANTILES_INVALID',
            );
        }

        await tx
            .update(s2Configs)
            .set({ isActive: false })
            .where(eq(s2Configs.segmentKey, row.segmentKey));

        await tx
            .update(s2Configs)
            .set({ isActive: true })
            .where(eq(s2Configs.id, id));
    });

    invalidateS2Cache();
}

/**
 * Деактивирует активную квантильную конфигурацию S2 по id.
 */
export async function deactivateS2Config(id: string): Promise<void> {
    const rows = await db
        .select()
        .from(s2Configs)
        .where(eq(s2Configs.id, id))
        .limit(1);

    if (!rows.length) {
        throw new S2ConfigError(
            'Конфигурация не найдена',
            404,
            'S2_CONFIG_NOT_FOUND',
        );
    }

    if (!rows[0]!.isActive) {
        throw new S2ConfigError(
            'Конфигурация уже деактивирована',
            409,
            'S2_CONFIG_ALREADY_INACTIVE',
        );
    }

    await db
        .update(s2Configs)
        .set({ isActive: false })
        .where(eq(s2Configs.id, id));

    invalidateS2Cache();
}

/**
 * Планирует удаление неактивной конфигурации через 60 минут.
 * Возвращает момент запланированного удаления для отображения таймера в UI.
 */
export async function scheduleS2ConfigDeletion(id: string): Promise<Date> {
    const rows = await db
        .select()
        .from(s2Configs)
        .where(eq(s2Configs.id, id))
        .limit(1);

    if (!rows.length) {
        throw new S2ConfigError(
            'Конфигурация не найдена',
            404,
            'S2_CONFIG_NOT_FOUND',
        );
    }

    if (rows[0]!.isActive) {
        throw new S2ConfigError(
            'Нельзя запланировать удаление активной конфигурации',
            409,
            'S2_CONFIG_ACTIVE',
        );
    }

    const deletionScheduledAt = new Date(Date.now() + DELETION_DELAY_MS);

    await db
        .update(s2Configs)
        .set({ deletionScheduledAt })
        .where(eq(s2Configs.id, id));

    return deletionScheduledAt;
}

/**
 * Отменяет запланированное удаление конфигурации.
 */
export async function cancelS2ConfigDeletion(id: string): Promise<void> {
    const rows = await db
        .select()
        .from(s2Configs)
        .where(eq(s2Configs.id, id))
        .limit(1);

    if (!rows.length) {
        throw new S2ConfigError(
            'Конфигурация не найдена',
            404,
            'S2_CONFIG_NOT_FOUND',
        );
    }

    if (rows[0]!.deletionScheduledAt === null) {
        throw new S2ConfigError(
            'Удаление не запланировано',
            409,
            'S2_CONFIG_NO_DELETION_SCHEDULED',
        );
    }

    await db
        .update(s2Configs)
        .set({ deletionScheduledAt: null })
        .where(eq(s2Configs.id, id));
}

/**
 * Удаляет конфигурации с истёкшим таймером deletion_scheduled_at.
 * Вызывается джобом scheduled_deletion.ts. Возвращает количество удалённых строк.
 */
export async function deleteScheduledS2Configs(): Promise<number> {
    const now = new Date();
    const rows = await db
        .delete(s2Configs)
        .where(and(
            isNotNull(s2Configs.deletionScheduledAt),
            lte(s2Configs.deletionScheduledAt, now),
        ))
        .returning({ id: s2Configs.id });

    if (rows.length > 0) {
        invalidateS2Cache();
    }

    return rows.length;
}