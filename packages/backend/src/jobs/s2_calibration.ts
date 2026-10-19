import cron from 'node-cron';
import {
    and,
    eq,
    gte,
    inArray,
    isNotNull,
    type SQL,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s2Configs } from '../db/schema.js';
import { DEFAULT_S2_PARAMS } from '@cpmind/shared';
import pino from 'pino';
import {
    buildTrainableImpressionFilter,
    countSampleExclusions,
    type TrainingSampleOptions,
} from './recalibration_sample.js';

const logger = pino({ name: 's2-calibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;

// Минимальный разброс доли экрана в сегменте. Постоянная доля обращает все опорные
// квантили в одно значение, нормализация вырождается в константу и перестаёт
// различать показы — такой результат не сохраняется
const MIN_SPREAD_PCT = 0.05;

// Бандлы тега, собранные до перехода на взвешивание отсчётов по фактическому интервалу,
// продолжают отправлять среднее по числу отсчётов: величины двух режимов несопоставимы
const SAMPLE_OPTIONS: TrainingSampleOptions = { sdkOnly: true };

// Сетка уровней общая с дефолтом: интерполяция обученной и дефолтной конфигурации
// выполняется на одних и тех же позициях распределения
const QUANTILE_LEVELS = DEFAULT_S2_PARAMS.quantileLevels;

const CREATIVE_GROUP_MAP: Record<string, string> = {
    banner_static: 'static',
    banner_gif: 'animated',
    banner_html5: 'animated',
    video_creative: 'video',
};

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;
const CREATIVE_GROUPS = ['static', 'animated', 'video'] as const;

/**
 * Выборочный квантиль по возрастающе упорядоченным значениям с линейной интерполяцией
 * между соседними порядковыми статистиками. Монотонность по уровню следует
 * из упорядоченности входа.
 */
function quantile(
    sorted: readonly number[],
    level: number,
): number {
    const lastIndex = sorted.length - 1;
    const position = level * lastIndex;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lowerValue = sorted[lowerIndex] ?? 0;

    if (lowerIndex === upperIndex) return lowerValue;

    const upperValue = sorted[upperIndex] ?? lowerValue;
    return lowerValue + (position - lowerIndex) * (upperValue - lowerValue);
}

// Обучение одного уровня сегментации. Ключ и условие выборки задают уровень: лист —
// устройство и группа креатива, родитель — только группа. Родительский уровень читает
// резолвер, когда у листа нет активной модели, и обучается тем же проходом: иначе
// ступень цепочки остаётся пустой и выбор падает сразу на дефолт
async function fitAndSaveSegment(
    segmentKey: string,
    baseWhere: SQL | undefined,
): Promise<void> {
    const [rows, exclusions] = await Promise.all([
        db
            .select({ share: impressions.s2RawShareOfScreen })
            .from(impressions)
            .where(and(
                baseWhere,
                buildTrainableImpressionFilter(SAMPLE_OPTIONS),
            )),
        countSampleExclusions(baseWhere, SAMPLE_OPTIONS),
    ]);

    const shares = rows
        .map((r) => r.share)
        .filter((share): share is number => share !== null && Number.isFinite(share));

    if (shares.length < MIN_SAMPLE_SIZE) {
        logger.warn(
            {
                segmentKey,
                sampleSize: shares.length,
                minRequired: MIN_SAMPLE_SIZE,
                sampleExclusions: exclusions,
            },
            'S2 calibration skipped — insufficient sample size',
        );
        return;
    }

    const sorted = [...shares].sort((a, b) => a - b);
    const quantileValues = QUANTILE_LEVELS.map((level) => quantile(sorted, level));

    const lowestValue = quantileValues[0] ?? 0;
    const highestValue = quantileValues[quantileValues.length - 1] ?? 0;
    const spread = highestValue - lowestValue;

    if (spread < MIN_SPREAD_PCT) {
        logger.error(
            {
                segmentKey,
                sampleSize: sorted.length,
                spread,
                minRequired: MIN_SPREAD_PCT,
                lowestValue,
                highestValue,
            },
            'S2 calibration skipped — degenerate share of screen distribution',
        );
        return;
    }

    try {
        await db.insert(s2Configs).values({
            segmentKey,
            quantileLevels: QUANTILE_LEVELS,
            quantileValues,
            sampleSize: sorted.length,
            isActive: false,
        });

        logger.info(
            {
                segmentKey,
                sampleSize: sorted.length,
                quantileLevels: QUANTILE_LEVELS,
                quantileValues: quantileValues.map((value) => Number(value.toFixed(4))),
                spread: Number(spread.toFixed(4)),
                sampleExclusions: exclusions,
            },
            'S2 segment fitted — draft saved, awaiting manual activation',
        );
    } catch (err) {
        logger.error({ err, segmentKey }, 'S2 calibration fit failed');
    }
}

export async function recalibrateS2(): Promise<void> {
    const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    for (const creativeGroup of CREATIVE_GROUPS) {
        const matchingCreativeTypes = Object.entries(CREATIVE_GROUP_MAP)
            .filter(([, group]) => group === creativeGroup)
            .map(([creativeType]) => creativeType);

        const groupWhere = and(
            inArray(impressions.creativeType, matchingCreativeTypes),
            gte(impressions.createdAt, windowStart),
            eq(impressions.isSuspicious, false),
            isNotNull(impressions.s2RawShareOfScreen),
        );

        for (const deviceType of DEVICE_TYPES) {
            await fitAndSaveSegment(
                `${deviceType}|${creativeGroup}`,
                and(
                    groupWhere,
                    eq(impressions.deviceType, deviceType),
                ),
            );
        }

        await fitAndSaveSegment(creativeGroup, groupWhere);
    }
}

export function startS2CalibrationJob(): void {
    cron.schedule('0 10 1 * *', async () => {
        logger.info('S2 calibration started');
        try {
            await recalibrateS2();
            logger.info('S2 calibration completed');
        } catch (err) {
            logger.error({ err }, 'S2 calibration job failed');
        }
    }, { timezone: 'UTC' });

    logger.info('S2 calibration job scheduled (monthly 1st 10:00 UTC)');
}