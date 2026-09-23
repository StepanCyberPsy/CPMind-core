import cron from 'node-cron';
import {
  and,
  eq,
  gte,
  isNotNull,
  sql,
  desc,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s6LogisticConfigs } from '../db/schema.js';
import {
  S6_PLACEMENT_GROUPS,
  S6_PLACEMENT_GROUP_FILTERS,
  buildS6SegmentKey,
  fitLogisticMLE,
  type S6PlacementGroup,
} from '@cpmind/shared';
import pino from 'pino';
import {
  buildTrainableImpressionFilter,
  countSampleExclusions,
  type SampleExclusions,
  type TrainingSampleOptions,
} from './recalibration_sample.js';
import {
  splitDeterministically,
  type LabeledSample,
} from './sample_split.js';

const logger = pino({ name: 's6-logistic-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;
const TEST_SPLIT_RATIO = 0.2;
const COEFFICIENT_COUNT = 9;

// Досмотр и звук в SDK измеряются иначе, чем в legacy-теге (фактически просмотренный
// отрезок, действия зрителя) — обучение только на данных SDK
const SAMPLE_OPTIONS: TrainingSampleOptions = { sdkOnly: true };

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;

interface S6Row {
  impressionId: string;
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
 * Определяет доминирующую версию констант тега в обучающем окне среди пригодных для обучения видеопоказов.
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
      buildTrainableImpressionFilter(SAMPLE_OPTIONS),
    ))
    .groupBy(impressions.tagConstantsVersion)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return rows[0]?.version ?? null;
}

async function fetchSegmentData(
  deviceType: string,
  placementGroup: S6PlacementGroup,
  windowStart: Date,
  tagConstantsVersion: string,
): Promise<{ rows: S6Row[]; exclusions: SampleExclusions }> {
  const filter = S6_PLACEMENT_GROUP_FILTERS[placementGroup];

  const baseWhere = and(
    eq(impressions.deviceType, deviceType),
    eq(impressions.creativeType, 'video_creative'),
    eq(impressions.format, filter.format),
    filter.skippable !== null
      ? eq(impressions.s6Skippable, filter.skippable)
      : undefined,
    eq(impressions.tagConstantsVersion, tagConstantsVersion),
    gte(impressions.createdAt, windowStart),
    eq(impressions.isSuspicious, false),
    isNotNull(impressions.s6CompletionRatePct),

    // Без длительности признак доли звука обращается в ноль и читается моделью
    // как «звук не слышали», хотя величина просто неизвестна
    isNotNull(impressions.s6DurationSec),
  );

  const [rawRows, exclusions] = await Promise.all([
    db
      .select({
        impressionId: impressions.impressionId,
        completionRatePct: impressions.s6CompletionRatePct,
        audibleTimeSec: impressions.s6AudibleTimeSec,
        durationSec: impressions.s6DurationSec,
        signalsRaw: impressions.signalsRaw,
      })
      .from(impressions)
      .where(and(
        baseWhere,
        buildTrainableImpressionFilter(SAMPLE_OPTIONS),
      )),
    countSampleExclusions(baseWhere, SAMPLE_OPTIONS),
  ]);

  const rows = rawRows.map((row) => {
    const raw = row.signalsRaw as Record<string, unknown> | null;
    const s6 = raw?.['s6'] as Record<string, unknown> | null ?? null;

    return {
      impressionId: row.impressionId,
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

  return { rows, exclusions };
}

export async function recalibrateS6Logistic(): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const tagConstantsVersion = await resolveDominantTagConstantsVersion(windowStart);
  if (tagConstantsVersion === null) {
    logger.warn('S6 Logistic recalibration skipped — no video impressions found in window');
    return;
  }

  logger.info({ tagConstantsVersion }, 'S6 Logistic recalibration: resolved tag_constants_version');

  for (const deviceType of DEVICE_TYPES) {
    for (const placementGroup of S6_PLACEMENT_GROUPS) {
      const segmentKey = buildS6SegmentKey(deviceType, placementGroup);

      const { rows, exclusions } = await fetchSegmentData(
        deviceType,
        placementGroup,
        windowStart,
        tagConstantsVersion,
      );

      if (rows.length < MIN_SAMPLE_SIZE) {
        logger.warn(
          {
            segmentKey,
            sampleSize: rows.length,
            minRequired: MIN_SAMPLE_SIZE,
            sampleExclusions: exclusions,
          },
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

      const samples: LabeledSample[] = rows.map((row, i) => ({
        key: row.impressionId,
        x: [
          1,
          completionZ.z[i] ?? 0,
          quartileZ.z[i] ?? 0,
          audibleZ.z[i] ?? 0,
          row.mutedThroughout ? 1 : 0,
          row.unmutedByUser ? 1 : 0,
          replayZ.z[i] ?? 0,
          row.skipped ? 1 : 0,
          (completionZ.z[i] ?? 0) * (audibleZ.z[i] ?? 0),
        ],
        y: weakLabel(row),
      }));

      const { train, test } = splitDeterministically(
        samples,
        (sample) => sample.key,
        TEST_SPLIT_RATIO,
      );
      const XTrain = train.map((sample) => sample.x);
      const yTrain = train.map((sample) => sample.y);
      const XTest = test.map((sample) => sample.x);
      const yTest = test.map((sample) => sample.y);

      try {
        const fit = fitLogisticMLE(XTrain, yTrain);

        if (
          !fit.converged ||
          fit.beta.length !== COEFFICIENT_COUNT ||
          fit.beta.some((value) => !Number.isFinite(value))
        ) {
          logger.error(
            {
              segmentKey,
              tagConstantsVersion,
              sampleSize: fit.sampleSize,
              converged: fit.converged,
              beta: fit.beta,
            },
            'S6 Logistic recalibration skipped — fitting did not converge',
          );
          continue;
        }

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
            testSampleSize: XTest.length,
            trainAccuracy: fit.accuracy.toFixed(3),
            testAccuracy: testAccuracy.toFixed(3),
            converged: fit.converged,
            sampleExclusions: exclusions,
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