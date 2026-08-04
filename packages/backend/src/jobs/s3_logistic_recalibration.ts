import cron from 'node-cron';
import {
    and,
    eq,
    gte,
    isNotNull,
    sql,
    desc,
    inArray,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s3LogisticConfigs } from '../db/schema.js';
import { fitLogisticMLE } from '@cpmind/shared';
import pino from 'pino';

const logger = pino({ name: 's3-logistic-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;
const TEST_SPLIT_RATIO = 0.2;

const CREATIVE_GROUP_MAP: Record<string, string> = {
  banner_static: 'static',
  banner_gif: 'animated',
  banner_html5: 'animated',
  video_creative: 'video',
};

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;
const CREATIVE_GROUPS = ['static', 'animated', 'video'] as const;

function zscoreFeatures(values: number[]): { z: number[]; mean: number; std: number } {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance) || 1;
  return { z: values.map((v) => (v - mean) / std), mean, std };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/**
 * Определяет доминирующую версию констант тега в обучающем окне.
 * Смешивание данных разных версий даёт смещённые коэффициенты (§6.1, §11.3) —
 * используется только наиболее частая версия.
 */
async function resolveDominantTagConstantsVersion(windowStart: Date): Promise<string | null> {
  const rows = await db
    .select({
      version: impressions.tagConstantsVersion,
      count: sql<number>`count(*)::int`,
    })
    .from(impressions)
    .where(and(
      gte(impressions.createdAt, windowStart),
      eq(impressions.isSuspicious, false),
      isNotNull(impressions.tagConstantsVersion),
      isNotNull(impressions.s3RawScrollSpeed),
    ))
    .groupBy(impressions.tagConstantsVersion)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return rows[0]?.version ?? null;
}

interface S3Features {
  speed: number;
  stddev: number;
  pause: number;
  direction: number;
  streak: number;
  reading: number;
  momentum: number;
  clicked: number;
  timeInView: number;
}

function extractFeatures(
  signalsRaw: unknown,
  s1RawTimeInView: number | null,
): S3Features | null {
  const raw = signalsRaw as Record<string, unknown> | null;
  if (!raw) return null;

  const s3 = raw['s3'] as Record<string, unknown> | null;
  if (!s3) return null;

  const s5 = raw['s5'] as Record<string, unknown> | null;

  return {
    speed: typeof s3['scroll_speed_avg_px_s'] === 'number' ? s3['scroll_speed_avg_px_s'] : 0,
    stddev: typeof s3['scroll_speed_std_dev'] === 'number' ? s3['scroll_speed_std_dev'] : 0,
    pause: typeof s3['pause_count'] === 'number' ? s3['pause_count'] : 0,
    direction: typeof s3['direction_changes'] === 'number' ? s3['direction_changes'] : 0,
    streak: typeof s3['scroll_streaks'] === 'number' ? s3['scroll_streaks'] : 0,
    reading: s3['reading_pattern_detected'] === true ? 1 : 0,
    momentum: s3['is_momentum_scroll'] === true ? 1 : 0,
    clicked: s5?.['clicked'] === true ? 1 : 0,
    timeInView: s1RawTimeInView ?? 0,
  };
}

export async function recalibrateS3Logistic(): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const tagConstantsVersion = await resolveDominantTagConstantsVersion(windowStart);
  if (tagConstantsVersion === null) {
    logger.warn('S3 Logistic recalibration skipped — no tag_constants_version found in window');
    return;
  }

  logger.info({ tagConstantsVersion }, 'S3 Logistic recalibration: resolved tag_constants_version');

  for (const deviceType of DEVICE_TYPES) {
    for (const creativeGroup of CREATIVE_GROUPS) {
      const segmentKey = `${deviceType}|${creativeGroup}`;

      const matchingCreativeTypes = Object.entries(CREATIVE_GROUP_MAP)
        .filter(([, group]) => group === creativeGroup)
        .map(([creativeType]) => creativeType);

      const rows = await db
        .select({
          s1RawTimeInView: impressions.s1RawTimeInView,
          signalsRaw: impressions.signalsRaw,
        })
        .from(impressions)
        .where(and(
          eq(impressions.deviceType, deviceType),
          inArray(impressions.creativeType, matchingCreativeTypes),
          eq(impressions.tagConstantsVersion, tagConstantsVersion),
          gte(impressions.createdAt, windowStart),
          eq(impressions.isSuspicious, false),
          isNotNull(impressions.s3RawScrollSpeed),
        ));

      if (rows.length < MIN_SAMPLE_SIZE) {
        logger.warn(
          { segmentKey, sampleSize: rows.length, minRequired: MIN_SAMPLE_SIZE },
          'S3 Logistic recalibration skipped — insufficient sample size',
        );
        continue;
      }

      const features: S3Features[] = [];
      for (const row of rows) {
        const f = extractFeatures(row.signalsRaw, row.s1RawTimeInView);
        if (f !== null) features.push(f);
      }

      if (features.length < MIN_SAMPLE_SIZE) {
        logger.warn(
          { segmentKey, sampleSize: features.length },
          'S3 Logistic recalibration skipped — insufficient valid features after extraction',
        );
        continue;
      }

      // Медиана time_in_view для прокси-метки (§3.3)
      const medianTimeInView = median(features.map((f) => f.timeInView));

      // Прокси-метка: y=1 если clicked=1 ИЛИ time_in_view > median (§3.3)
      const y = features.map((f) =>
        f.clicked === 1 || f.timeInView > medianTimeInView ? 1 : 0,
      );

      // Z-score нормализация по каждому признаку
      const speedZ = zscoreFeatures(features.map((f) => f.speed));
      const stddevZ = zscoreFeatures(features.map((f) => f.stddev));
      const pauseZ = zscoreFeatures(features.map((f) => f.pause));
      const directionZ = zscoreFeatures(features.map((f) => f.direction));
      const streakZ = zscoreFeatures(features.map((f) => f.streak));

      // X = [intercept, speed_z, stddev_z, pause_z, direction_z, streak_z, reading, momentum]
      const X = features.map((f, i) => [
        1,
        speedZ.z[i] ?? 0,
        stddevZ.z[i] ?? 0,
        pauseZ.z[i] ?? 0,
        directionZ.z[i] ?? 0,
        streakZ.z[i] ?? 0,
        f.reading,
        f.momentum,
      ]);

      const splitIdx = Math.floor(features.length * (1 - TEST_SPLIT_RATIO));
      const XTrain = X.slice(0, splitIdx);
      const yTrain = y.slice(0, splitIdx);
      const XTest = X.slice(splitIdx);
      const yTest = y.slice(splitIdx);

      try {
        const fit = fitLogisticMLE(XTrain, yTrain);

        // Accuracy на hold-out выборке
        let correct = 0;
        for (let i = 0; i < XTest.length; i++) {
          const row = XTest[i];
          const label = yTest[i] ?? 0;
          if (row === undefined) continue;
          const z = row.reduce((s, x, j) => s + x * (fit.beta[j] ?? 0), 0);
          const pred = 1 / (1 + Math.exp(-z)) >= 0.5 ? 1 : 0;
          if (pred === label) correct++;
        }
        const testAccuracy = XTest.length > 0 ? correct / XTest.length : fit.accuracy;

        await db.insert(s3LogisticConfigs).values({
          segmentKey,
          tagConstantsVersion,
          coefficients: {
            beta0: fit.beta[0] ?? 0,
            beta1: fit.beta[1] ?? 0,
            beta2: fit.beta[2] ?? 0,
            beta3: fit.beta[3] ?? 0,
            beta4: fit.beta[4] ?? 0,
            beta5: fit.beta[5] ?? 0,
            beta6: fit.beta[6] ?? 0,
            beta7: fit.beta[7] ?? 0,
          },
          featureMeans: {
            speed: speedZ.mean,
            stddev: stddevZ.mean,
            pause: pauseZ.mean,
            direction: directionZ.mean,
            streak: streakZ.mean,
          },
          featureStds: {
            speed: speedZ.std,
            stddev: stddevZ.std,
            pause: pauseZ.std,
            direction: directionZ.std,
            streak: streakZ.std,
          },
          sampleSize: fit.sampleSize,
          accuracy: testAccuracy,
          isActive: false,
        });

        logger.info(
          {
            segmentKey,
            tagConstantsVersion,
            sampleSize: fit.sampleSize,
            trainAccuracy: fit.accuracy.toFixed(3),
            testAccuracy: testAccuracy.toFixed(3),
            converged: fit.converged,
          },
          'S3 Logistic segment fitted — draft saved, awaiting manual activation',
        );
      } catch (err) {
        logger.error({ err, segmentKey }, 'S3 Logistic fit failed');
      }
    }
  }
}

export function startS3LogisticRecalibrationJob(): void {
  cron.schedule('0 5 * * 0', async () => {
    logger.info('S3 Logistic recalibration started');
    try {
      await recalibrateS3Logistic();
      logger.info('S3 Logistic recalibration completed');
    } catch (err) {
      logger.error({ err }, 'S3 Logistic recalibration job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('S3 Logistic recalibration job scheduled (weekly Sunday 05:00 UTC)');
}