import {
    and,
    eq,
    ne,
    sql,
    type SQL,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';

// sdkOnly — сигнал измеряется в SDK иначе, чем в legacy-теге: данные разных режимов несопоставимы
export interface TrainingSampleOptions {
    sdkOnly: boolean;
}

// Число показов-кандидатов и исключённых по каждой причине. Причины пересекаются:
// показ может быть исключён одновременно по нескольким
export interface SampleExclusions {
    candidates: number;
    unreliable: number;
    contextMismatch: number;
    legacy: number;
}

function contextMismatchCondition(): SQL {
    return sql`COALESCE(${impressions.contextViolations}, ARRAY[]::text[]) @> ARRAY['CLIENT_CONTEXT_MISMATCH']::text[]`;
}

/**
 * Показ пригоден для обучения моделей сигналов: IVT-вердикт valid (score_reliable),
 * контекст доставки подтверждён сервером, при sdkOnly — измерен SDK.
 * Отклонённые показы хранятся и видны в аналитике, но не искажают модели.
 */
export function buildTrainableImpressionFilter(
    options: TrainingSampleOptions,
): SQL | undefined {
    return and(
        eq(impressions.scoreReliable, true),
        sql`NOT (${contextMismatchCondition()})`,
        options.sdkOnly ? ne(impressions.measurementMode, 'legacy_tag') : undefined,
    );
}

/**
 * Счётчики исключённых показов для логов задачи рекалибровки.
 * baseWhere — критерии сегмента без фильтра пригодности.
 */
export async function countSampleExclusions(
    baseWhere: SQL | undefined,
    options: TrainingSampleOptions,
): Promise<SampleExclusions> {
    const [row] = await db
        .select({
            candidates: sql<number>`count(*)::int`,
            unreliable: sql<number>`(count(*) FILTER (WHERE ${impressions.scoreReliable} = false))::int`,
            contextMismatch: sql<number>`(count(*) FILTER (WHERE ${contextMismatchCondition()}))::int`,
            legacy: sql<number>`(count(*) FILTER (WHERE ${impressions.measurementMode} = 'legacy_tag'))::int`,
        })
        .from(impressions)
        .where(baseWhere);

    return {
        candidates: row?.candidates ?? 0,
        unreliable: row?.unreliable ?? 0,
        contextMismatch: row?.contextMismatch ?? 0,
        legacy: options.sdkOnly ? (row?.legacy ?? 0) : 0,
    };
}