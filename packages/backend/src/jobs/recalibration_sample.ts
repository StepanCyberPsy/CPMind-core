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
    restrictedAccess: number;
}

function contextMismatchCondition(): SQL {
    return sql`COALESCE(${impressions.contextViolations}, ARRAY[]::text[]) @> ARRAY['CLIENT_CONTEXT_MISMATCH']::text[]`;
}

// Показ, измеренный через OMID без доступа к верхнему окну, в обучение не идёт.
// Сигналы там получены из событий OMID с ненормированной частотой, а не наблюдением
// элемента на странице: смешивание источников сместило бы подгонку моделей.
// omid_access_mode пуст у всех режимов, кроме vast_omid — они проходят условие
function restrictedAccessCondition(): SQL {
    return sql`${impressions.omidAccessMode} IS NOT NULL AND ${impressions.omidAccessMode} <> 'full_page'`;
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
        sql`NOT (${restrictedAccessCondition()})`,
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
            restrictedAccess: sql<number>`(count(*) FILTER (WHERE ${restrictedAccessCondition()}))::int`,
        })
        .from(impressions)
        .where(baseWhere);

    return {
        candidates: row?.candidates ?? 0,
        unreliable: row?.unreliable ?? 0,
        contextMismatch: row?.contextMismatch ?? 0,
        legacy: options.sdkOnly ? (row?.legacy ?? 0) : 0,
        restrictedAccess: row?.restrictedAccess ?? 0,
    };
}