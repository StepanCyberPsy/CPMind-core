import cron from 'node-cron';
import { and, eq, gte, isNotNull, sql, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s6LogisticConfigs } from '../db/schema.js';
import { fitLogisticMLE } from '@cpmind/shared';
import pino from 'pino';

const logger = pino({ name: 's6-logistic-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;
const TEST_SPLIT_RATIO = 0.2;

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;
const SKIPPABLE_VARIANTS = ['skippable', 'non_skippable'] as const;

interface S6Row {
  completionRatePct: number | null;
  quartile25: boolean | null;
  quartile50: boolean | null;
  quartile75: boolean | null;
  completion: boolean | null;
  playInitiated: boolean | null;
  audibleTimeSec: number | null;
  durationSec: number | null;
  mutedThroughout: boolean | null;
  unmutedByUser: boolean | null;
  replayCount: number | null;
  skipped: boolean | null;
}

function zscoreFeatures(values: number[]): { z: number[]; mean: number; std: number } {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance) || 1;
  return { z: values.map((v) => (v - mean) / std), mean, std };
}

function quartileOrdinalFromRow(row: S6Row): number {
  if (row.completion) return 100;
  if (row.quartile75) return 75;
  if (row.quartile50) return 50;
  if (row.quartile25) return 25;
  if (row.playInitiated) return 10;
  return 0;
}

/**
 * Прокси-метка: y=1 если видео завершено И пользователь не заглушил звук на всё время
 * (либо явно включил звук). Источник: §4.3 weak-label, IAB/MRC Attention Guidelines 2025.
 */
function weakLabel(row: S6Row): number {
  if (!row.completion) return 0;
  const engagedByAudio = row.unmutedByUser === true || row.mutedThroughout !== true;
  return engagedByAudio ? 1 : 0;
}

/**
 * Определяет доминирующую версию констант тега в обучающем окне.
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
      eq(impressions.creativeType, 'video_creative'),
    ))
    .groupBy(impressions.tagConstantsVersion)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return rows[0]?.version ?? null;
}

async function fetchSegmentData(
  deviceType: string,
  skippable: boolean,
  windowStart: Date,
  tagConstantsVersion: string,
): Promise<S6Row[]> {
  const rows = await db
    .select({
      completionRatePct: impressions.s6CompletionRatePct,
      audibleTimeSec: impressions.s6AudibleTimeSec,
      durationSec: impressions.s6DurationSec,
      signalsRaw: impressions.signalsRaw,
    })
    .from(impressions)
    .where(and(
      eq(impressions.deviceType, deviceType),
      eq(impressions.s6Skippable, skippable),
      eq(impressions.creativeType, 'video_creative'),
      eq(impressions.tagConstantsVersion, tagConstantsVersion),
      gte(impressions.createdAt, windowStart),
      eq(impressions.isSuspicious, false),
      isNotNull(impressions.s6CompletionRatePct),
    ));

  return rows.map((row) => {
    const raw = row.signalsRaw as Record<string, unknown> | null;
    const s6 = raw?.['s6'] as Record<string, unknown> | null ?? null;

    return {
      completionRatePct: row.completionRatePct ?? null,
      quartile25: s6?.['quartile_25'] as boolean | null ?? null,
      quartile50: s6?.['quartile_50'] as boolean | null ?? null,
      quartile75: s6?.['quartile_75'] as boolean | null ?? null,
      completion: s6?.['completion'] as boolean | null ?? null,
      playInitiated: s6?.['play_initiated'] as boolean | null ?? null,
      audibleTimeSec: row.audibleTimeSec ?? null,
      durationSec: row.durationSec ?? null,
      mutedThroughout: s6?.['muted_throughout'] as boolean | null ?? null,
      unmutedByUser: s6?.['unmuted_by_user'] as boolean | null ?? null,
      replayCount: typeof s6?.['replay_count'] === 'number' ? s6['replay_count'] : null,
      skipped: s6?.['skipped'] as boolean | null ?? null,
    };
  });
}

async function recalibrateS6Logistic(): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const tagConstantsVersion = await resolveDominantTagConstantsVersion(windowStart);
  if (tagConstantsVersion === null) {
    logger.warn('S6 Logistic recalibration skipped — no video impressions found in window');
    return;
  }

  logger.info({ tagConstantsVersion }, 'S6 Logistic recalibration: resolved tag_constants_version');

  for (const deviceType of DEVICE_TYPES) {
    for (const skippableLabel of SKIPPABLE_VARIANTS) {
      const segmentKey = `${deviceType}|${skippableLabel}`;
      const isSkippable = skippableLabel === 'skippable';

      const rows = await fetchSegmentData(deviceType, isSkippable, windowStart, tagConstantsVersion);

      if (rows.length < MIN_SAMPLE_SIZE) {
        logger.warn(
          { segmentKey, sampleSize: rows.length, minRequired: MIN_SAMPLE_SIZE },
          'S6 Logistic recalibration skipped — insufficient sample size',
        );
        continue;
      }

      const completionRates = rows.map((r) =>
        r.completionRatePct ?? quartileOrdinalFromRow(r),
      );
      const quartiles = rows.map((r) => quartileOrdinalFromRow(r));
      const audibleRatios = rows.map((r) =>
        r.audibleTimeSec !== null && r.durationSec !== null && r.durationSec > 0
          ? r.audibleTimeSec / r.durationSec
          : 0,
      );
      const replayLogs = rows.map((r) => Math.log(1 + (r.replayCount ?? 0)));

      const completionZ = zscoreFeatures(completionRates);
      const quartileZ = zscoreFeatures(quartiles);
      const audibleZ = zscoreFeatures(audibleRatios);
      const replayZ = zscoreFeatures(replayLogs);

      const X = rows.map((_, i) => [
        1,
        completionZ.z[i] ?? 0,
        quartileZ.z[i] ?? 0,
        audibleZ.z[i] ?? 0,
        rows[i]!.mutedThroughout ? 1 : 0,
        rows[i]!.unmutedByUser ? 1 : 0,
        replayZ.z[i] ?? 0,
        rows[i]!.skipped ? 1 : 0,
        (completionZ.z[i] ?? 0) * (audibleZ.z[i] ?? 0),
      ]);

      const y = rows.map((r) => weakLabel(r));

      const splitIdx = Math.floor(rows.length * (1 - TEST_SPLIT_RATIO));
      const XTrain = X.slice(0, splitIdx);
      const yTrain = y.slice(0, splitIdx);
      const XTest = X.slice(splitIdx);
      const yTest = y.slice(splitIdx);

      try {
        const fit = fitLogisticMLE(XTrain, yTrain);

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

        await db.insert(s6LogisticConfigs).values({
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
            beta8: fit.beta[8] ?? 0,
          },
          featureMeans: {
            completion: completionZ.mean,
            quartile: quartileZ.mean,
            audible: audibleZ.mean,
            replay: replayZ.mean,
          },
          featureStds: {
            completion: completionZ.std,
            quartile: quartileZ.std,
            audible: audibleZ.std,
            replay: replayZ.std,
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
          'S6 Logistic segment fitted — draft saved, awaiting manual activation',
        );
      } catch (err) {
        logger.error({ err, segmentKey }, 'S6 Logistic fit failed');
      }
    }
  }
}

export function startS6LogisticRecalibrationJob(): void {
  cron.schedule('0 7 * * 0', async () => {
    logger.info('S6 Logistic recalibration started');
    try {
      await recalibrateS6Logistic();
      logger.info('S6 Logistic recalibration completed');
    } catch (err) {
      logger.error({ err }, 'S6 Logistic recalibration job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('S6 Logistic recalibration job scheduled (weekly Sunday 07:00 UTC)');
}