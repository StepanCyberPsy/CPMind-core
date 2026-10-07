import cron from 'node-cron';
import {
  and,
  eq,
  gte,
  inArray,
  type SQL,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s1WeibullConfigs } from '../db/schema.js';
import { fitWeibullMLE } from '@cpmind/shared';
import pino from 'pino';
import {
  buildTrainableImpressionFilter,
  countSampleExclusions,
  type TrainingSampleOptions,
} from './recalibration_sample.js';

const logger = pino({ name: 's1-weibull-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;

// Окно измерения S1 в SDK начинается с первого кадра — данные legacy-тега несопоставимы
const SAMPLE_OPTIONS: TrainingSampleOptions = { sdkOnly: true };

const CREATIVE_GROUP_MAP: Record<string, string> = {
  banner_static: 'static',
  banner_gif: 'animated',
  banner_html5: 'animated',
  video_creative: 'video',
};

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;
const CREATIVE_GROUPS = ['static', 'animated', 'video'] as const;

// Обучение одного уровня сегментации. Ключ и условие выборки задают уровень: лист —
// устройство и группа креатива, родитель — только группа. Родительский уровень читает
// резолвер, когда у листа нет активной модели, и обучается тем же проходом: иначе
// ступень цепочки остаётся пустой и выбор падает сразу на нулевой global
async function fitAndSaveSegment(
  segmentKey: string,
  baseWhere: SQL | undefined,
): Promise<void> {
  const [rows, exclusions] = await Promise.all([
    db
      .select({ t: impressions.s1RawTimeInView })
      .from(impressions)
      .where(and(
        baseWhere,
        buildTrainableImpressionFilter(SAMPLE_OPTIONS),
      )),
    countSampleExclusions(baseWhere, SAMPLE_OPTIONS),
  ]);

  const times = rows
    .map((r) => r.t)
    .filter((t): t is number => t !== null && t > 0);

  if (times.length < MIN_SAMPLE_SIZE) {
    logger.warn(
      {
        segmentKey,
        sampleSize: times.length,
        minRequired: MIN_SAMPLE_SIZE,
        sampleExclusions: exclusions,
      },
      'S1 Weibull recalibration skipped — insufficient sample size',
    );
    return;
  }

  try {
    const fit = fitWeibullMLE(times);

    await db.insert(s1WeibullConfigs).values({
      segmentKey,
      k: fit.k,
      lambda: fit.lambda,
      sampleSize: fit.sampleSize,
      isActive: false,
    });

    logger.info(
      {
        segmentKey,
        k: fit.k.toFixed(3),
        lambda: fit.lambda.toFixed(3),
        sampleSize: fit.sampleSize,
        converged: fit.converged,
        sampleExclusions: exclusions,
      },
      'S1 Weibull segment fitted — draft saved, awaiting manual activation',
    );
  } catch (err) {
    logger.error({ err, segmentKey }, 'S1 Weibull fit failed');
  }
}

export async function recalibrateS1Weibull(): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const creativeGroup of CREATIVE_GROUPS) {
    const matchingCreativeTypes = Object.entries(CREATIVE_GROUP_MAP)
      .filter(([, group]) => group === creativeGroup)
      .map(([creativeType]) => creativeType);

    const groupWhere = and(
      inArray(impressions.creativeType, matchingCreativeTypes),
      gte(impressions.createdAt, windowStart),
      eq(impressions.isSuspicious, false),
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

export function startS1WeibullRecalibrationJob(): void {
  cron.schedule('0 4 * * 0', async () => {
    logger.info('S1 Weibull recalibration started');
    try {
      await recalibrateS1Weibull();
      logger.info('S1 Weibull recalibration completed');
    } catch (err) {
      logger.error({ err }, 'S1 Weibull recalibration job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('S1 Weibull recalibration job scheduled (weekly Sunday 04:00 UTC)');
}