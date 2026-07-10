import cron from 'node-cron';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s7QuantileConfigs } from '../db/schema.js';
import { fitS7Quantiles, type S7RawObservation } from '../services/s7_quantile_fit.js';
import pino from 'pino';

const logger = pino({ name: 's7-quantile-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 60;
const MIN_SAMPLE_SIZE = 300;

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;

async function fetchDeviceObservations(
  deviceType: string,
  windowStart: Date,
): Promise<S7RawObservation[]> {
  const rows = await db
    .select({ signalsRaw: impressions.signalsRaw })
    .from(impressions)
    .where(and(
      eq(impressions.deviceType, deviceType),
      gte(impressions.createdAt, windowStart),
      eq(impressions.isSuspicious, false),
    ));

  const observations: S7RawObservation[] = [];

  for (const row of rows) {
    const raw = row.signalsRaw as Record<string, unknown> | null;
    const s7 = raw?.['s7'] as Record<string, unknown> | undefined;

    if (!s7) continue;

    const pageHeight = typeof s7['page_height_total_px'] === 'number'
      ? s7['page_height_total_px']
      : 0;

    if (pageHeight <= 0) continue;

    const creativeY = typeof s7['creative_position_y_px'] === 'number'
      ? s7['creative_position_y_px']
      : 0;

    const isAboveTheFold = s7['is_above_the_fold'] === true;

    const competingAdsVisible = typeof s7['competing_ads_visible'] === 'number'
      ? Math.max(0, Math.floor(s7['competing_ads_visible']))
      : 0;

    observations.push({
      relativeY: creativeY / pageHeight,
      isAboveTheFold,
      competingAdsVisible,
    });
  }

  return observations;
}

async function recalibrateS7Quantiles(): Promise<void> {
  const windowStart = new Date(
    Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  logger.info({ windowDays: RECALIBRATION_WINDOW_DAYS }, 'S7 Quantile recalibration started');

  for (const deviceType of DEVICE_TYPES) {
    const observations = await fetchDeviceObservations(deviceType, windowStart);

    if (observations.length < MIN_SAMPLE_SIZE) {
      logger.warn(
        { deviceType, sampleSize: observations.length, minRequired: MIN_SAMPLE_SIZE },
        'S7 Quantile recalibration skipped — insufficient sample size',
      );
      continue;
    }

    try {
      const fit = fitS7Quantiles(deviceType, observations);

      await db.insert(s7QuantileConfigs).values({
        deviceType: fit.deviceType,
        relativeYLow: fit.relativeYLow,
        relativeYMid: fit.relativeYMid,
        clutterMid: fit.clutterMid,
        clutterHigh: fit.clutterHigh,
        sampleSize: fit.sampleSize,
        isActive: false,
      });

      logger.info(
        {
          deviceType,
          sampleSize: fit.sampleSize,
          relativeYLow: fit.relativeYLow.toFixed(3),
          relativeYMid: fit.relativeYMid.toFixed(3),
          clutterMid: fit.clutterMid.toFixed(1),
          clutterHigh: fit.clutterHigh.toFixed(1),
        },
        'S7 Quantile segment fitted — draft saved, awaiting manual activation',
      );
    } catch (err) {
      logger.error({ err, deviceType }, 'S7 Quantile fit failed');
    }
  }

  logger.info('S7 Quantile recalibration completed');
}

export function startS7QuantileRecalibrationJob(): void {
  cron.schedule('0 8 1 * *', async () => {
    logger.info('S7 Quantile recalibration triggered by cron');
    try {
      await recalibrateS7Quantiles();
    } catch (err) {
      logger.error({ err }, 'S7 Quantile recalibration job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('S7 Quantile recalibration job scheduled (monthly 1st 08:00 UTC)');
}