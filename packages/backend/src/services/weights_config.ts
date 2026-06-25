import { eq, desc } from 'drizzle-orm';
import { DEFAULT_WEIGHTS, type WeightsValues } from '@cpmind/shared';
import { db } from '../db/index.js';
import { weightConfigs, type WeightConfigSelect } from '../db/schema.js';

const FOREIGN_KEY_VIOLATION_CODE = '23503';

/**
 * Ошибка сервиса конфигурации весов с HTTP-статусом и кодом для errorHandler.
 */

class WeightsConfigError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly code: string,
    ) {
        super(message);
        this.name = 'WeightsConfigError';
    }
}

let cache: WeightsValues | null = null;

/**
 * Сбрасывает кэш активной конфигурации весов.
 * Вызывается после успешной активации новой версии.
 */

export function invalidateWeightsCache(): void {
    cache = null;
}

/**
 * Возвращает активную конфигурацию весов из кэша или БД.
 * Fallback на DEFAULT_WEIGHTS если таблица пуста.
 */

export async function getActiveWeightsConfig(): Promise<WeightsValues> {
    if (cache) return cache;

    const rows = await db
        .select()
        .from(weightConfigs)
        .where(eq(weightConfigs.isActive, true))
        .limit(1);

    if (!rows.length) return DEFAULT_WEIGHTS;

    const row = rows[0]!;
    const w = row.weights as Record<string, number>;

    cache = {
        version: row.version,
        s1: w['s1']!,
        s2: w['s2']!,
        s3: w['s3']!,
        s4: w['s4']!,
        s5: w['s5']!,
        s7: w['s7']!,
    };

    return cache;
}

/**
 * Возвращает все версии конфигурации весов, сортировка по дате создания desc.
 */

export async function listWeightsConfigs(): Promise<WeightConfigSelect[]> {
    return db
        .select()
        .from(weightConfigs)
        .orderBy(desc(weightConfigs.createdAt));
}

/**
 * Создает новую версию конфигурации весов.
 * Валидирует сумму весов = 1.00 с допуском 0.001 на floating point.
 */

export async function createWeightsConfig(data: {
    version: string;
    weights: { s1: number; s2: number; s3: number; s4: number; s5: number; s7: number };
    description?: string;
}): Promise<WeightConfigSelect> {
    const { s1, s2, s3, s4, s5, s7 } = data.weights;
    const sum = s1 + s2 + s3 + s4 + s5 + s7;

    if (Math.abs(sum - 1.0) > 0.001) {
        throw new WeightsConfigError(
            'Сумма весов должна равняться 1.00',
            400,
            'WEIGHTS_SUM_INVALID',
        );
    }

    const rows = await db
        .insert(weightConfigs)
        .values({
            version: data.version,
            weights: data.weights as unknown as Record<string, unknown>,
            description: data.description ?? null,
            isActive: false,
        })
        .returning();

    return rows[0]!;
}

/**
 * Активирует версию конфигурации весов по id.
 * Транзакция гарантирует инвариант: ровно одна запись is_active=true.
 * Инвалидирует кэш после успешной транзакции.
 */

export async function activateWeightsConfig(id: string): Promise<void> {
    await db.transaction(async (tx) => {
        await tx
            .update(weightConfigs)
            .set({ isActive: false });

        const updated = await tx
            .update(weightConfigs)
            .set({ isActive: true })
            .where(eq(weightConfigs.id, id))
            .returning();

        if (!updated.length) {
            throw new WeightsConfigError(
                'Конфигурация не найдена',
                404,
                'WEIGHTS_CONFIG_NOT_FOUND',
            );
        }
    });

    invalidateWeightsCache();
}

/**
 * Удаляет неактивную версию конфигурации весов.
 * Активную конфигурацию удалить нельзя — 409.
 */

function isForeignKeyViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: unknown }).code === FOREIGN_KEY_VIOLATION_CODE
    );
}

export async function deleteWeightsConfig(id: string): Promise<void> {
    const rows = await db
        .select()
        .from(weightConfigs)
        .where(eq(weightConfigs.id, id))
        .limit(1);

    if (!rows.length) {
        throw new WeightsConfigError(
            'Конфигурация не найдена',
            404,
            'WEIGHTS_CONFIG_NOT_FOUND',
        );
    }

    if (rows[0]!.isActive) {
        throw new WeightsConfigError(
            'Нельзя удалить активную конфигурацию',
            409,
            'WEIGHTS_CONFIG_ACTIVE',
        );
    }

    try {
        await db
            .delete(weightConfigs)
            .where(eq(weightConfigs.id, id));
    } catch (err) {
        if (isForeignKeyViolation(err)) {
            throw new WeightsConfigError(
                'Конфигурация использовалась в калибровке импрешенов и не может быть удалена',
                409,
                'WEIGHTS_CONFIG_REFERENCED',
            );
        }
        throw err;
    }
}