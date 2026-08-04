import cron from 'node-cron';
import {
  and,
  eq,
  gte,
  inArray,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s1WeibullConfigs } from '../db/schema.js';
import { fitWeibullMLE } from '@cpmind/shared';
import pino from 'pino';

const logger = pino({ name: 's1-weibull-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;

const CREATIVE_GROUP_MAP: Record<string, string> = {
  banner_static: 'static',
  banner_gif: 'animated',
  banner_html5: 'animated',
  video_creative: 'video',
};

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;
const CREATIVE_GROUPS = ['static', 'animated', 'video'] as const;

export async function recalibrateS1Weibull(): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const deviceType of DEVICE_TYPES) {
    for (const creativeGroup of CREATIVE_GROUPS) {
      const segmentKey = `${deviceType}|${creativeGroup}`;

      const matchingCreativeTypes = Object.entries(CREATIVE_GROUP_MAP)
        .filter(([, group]) => group === creativeGroup)
        .map(([creativeType]) => creativeType);

      const rows = await db
        .select({ t: impressions.s1RawTimeInView })
        .from(impressions)
        .where(
          and(
            eq(impressions.deviceType, deviceType),
            inArray(impressions.creativeType, matchingCreativeTypes),
            gte(impressions.createdAt, windowStart),
            eq(impressions.isSuspicious, false),
          ),
        );

      const times = rows
        .map((r) => r.t)
        .filter((t): t is number => t !== null && t > 0);

      if (times.length < MIN_SAMPLE_SIZE) {
        logger.warn(
          { segmentKey, sampleSize: times.length, minRequired: MIN_SAMPLE_SIZE },
          'S1 Weibull recalibration skipped — insufficient sample size',
        );
        continue;
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
          },
          'S1 Weibull segment fitted — draft saved, awaiting manual activation',
        );
      } catch (err) {
        logger.error({ err, segmentKey }, 'S1 Weibull fit failed');
      }
    }
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