import { createHash } from 'node:crypto';
import cron from 'node-cron';
import {
    and,
    eq,
    gte,
    isNotNull,
    sql,
    desc
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s5LogisticConfigs } from '../db/schema.js';
import { fitLogisticMLE } from '@cpmind/shared';
import pino from 'pino';

const logger = pino({ name: 's5-logistic-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;
const TEST_SPLIT_RATIO = 0.2;
const MIN_NON_ZERO_THRESHOLD_SAMPLES = 30;
const HOVER_THRESHOLD_FALLBACK_MS = 300;
const MOBILE_SWIPE_FALLBACK_COUNT = 2;
const MIN_POSITIVE_RATE = 0.05;
const MAX_POSITIVE_RATE = 0.95;
const L2_LAMBDA = 1.0;

const SEGMENTS = ['desktop', 'mobile_tablet'] as const;
type S5Segment = typeof SEGMENTS[number];

/**
 * Определяет доминирующую версию констант тега в обучающем окне.
 * Смешивание данных разных версий даёт смещённые коэффициенты (§6.1) —
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
    ))
    .groupBy(impressions.tagConstantsVersion)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return rows[0]?.version ?? null;
}

interface S5Features {
  impressionId: string;
  clicked: number;
  hoverDurationNorm: number;
  hoverCountNorm: number;
  proximityNorm: number;
  zoom: number;
  tapCountNorm: number;
  swipeCountNorm: number;
  hoverDurationMaxMs: number;
  hoverCount: number;
  swipeCount: number;
}

function extractFeatures(
  impressionId: string,
  signalsRaw: unknown,
): S5Features | null {
  const raw = signalsRaw as Record<string, unknown> | null;
  if (!raw) return null;

  const s5 = raw['s5'] as Record<string, unknown> | undefined;
  if (!s5) return null;

  const clicked = s5['clicked'] === true ? 1 : 0;
  const hoverDurationMaxMs = typeof s5['hover_duration_max_ms'] === 'number'
    ? s5['hover_duration_max_ms']
    : 0;
  const hoverCount = typeof s5['hover_count'] === 'number' ? s5['hover_count'] : 0;
  const cursorProximityMinPx = typeof s5['cursor_proximity_min_px'] === 'number'
    ? s5['cursor_proximity_min_px']
    : null;
  const tapCount = typeof s5['tap_count'] === 'number' ? s5['tap_count'] : 0;
  const swipeCount = typeof s5['swipe_count'] === 'number' ? s5['swipe_count'] : 0;
  const zoom = s5['zoom'] === true ? 1 : 0;

  const hoverDurationNorm = Math.min(1, Math.log(hoverDurationMaxMs + 1) / Math.log(10001));
  const hoverCountNorm = Math.min(hoverCount, 10) / 10;
  const proximityNorm = cursorProximityMinPx !== null
    ? 1 - Math.min(cursorProximityMinPx, 200) / 200
    : 0;
  const tapCountNorm = Math.min(tapCount, 5) / 5;
  const swipeCountNorm = Math.min(swipeCount, 3) / 3;

  return {
    impressionId,
    clicked,
    hoverDurationNorm,
    hoverCountNorm,
    proximityNorm,
    zoom,
    tapCountNorm,
    swipeCountNorm,
    hoverDurationMaxMs,
    hoverCount,
    swipeCount,
  };
}

async function fetchSegmentData(
  segment: S5Segment,
  windowStart: Date,
  tagConstantsVersion: string,
): Promise<S5Features[]> {
  const deviceFilter = segment === 'desktop'
    ? eq(impressions.deviceType, 'desktop')
    : sql`${impressions.deviceType} IN ('mobile', 'tablet')`;

  const rows = await db
    .select({
      impressionId: impressions.impressionId,
      signalsRaw: impressions.signalsRaw,
    })
    .from(impressions)
    .where(and(
      deviceFilter,
      gte(impressions.createdAt, windowStart),
      eq(impressions.isSuspicious, false),
      eq(impressions.tagConstantsVersion, tagConstantsVersion),
      isNotNull(impressions.signalsRaw),
    ));

  return rows
    .map((row) => extractFeatures(row.impressionId, row.signalsRaw))
    .filter((f): f is S5Features => f !== null);
}

function percentileContinuous(
  values: number[],
  percentile: number,
): number {
  if (values.length === 0) {
    throw new Error('percentileContinuous: пустая выборка');
  }

  const sorted = [...values].sort((a, b) => a - b);

  if (sorted.length === 1) {
    return sorted[0]!;
  }

  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex]!;
  const upper = sorted[upperIndex]!;

  if (lowerIndex === upperIndex) {
    return lower;
  }

  return lower + (upper - lower) * (position - lowerIndex);
}

function splitFeaturesDeterministically(
  features: S5Features[],
): {
  train: S5Features[];
  test: S5Features[];
} {
  const ordered = features
    .map((feature) => ({
      feature,
      key: createHash('sha256')
        .update(feature.impressionId)
        .digest('hex'),
    }))
    .sort((a, b) => {
      const keyComparison = a.key.localeCompare(b.key);
      if (keyComparison !== 0) return keyComparison;
      return a.feature.impressionId.localeCompare(b.feature.impressionId);
    })
    .map(({ feature }) => feature);

  const testSize = Math.max(
    1,
    Math.floor(ordered.length * TEST_SPLIT_RATIO),
  );

  return {
    test: ordered.slice(0, testSize),
    train: ordered.slice(testSize),
  };
}

function resolveLabelThreshold(
  segment: S5Segment,
  features: S5Features[],
): {
  threshold: number;
  nonZeroSampleSize: number;
  source: 'p75' | 'fallback';
} {
  const values = segment === 'desktop'
    ? features
      .map((feature) => feature.hoverDurationMaxMs)
      .filter((value) => value > 0)
    : features
      .map((feature) => feature.swipeCount)
      .filter((value) => value > 0);

  if (values.length < MIN_NON_ZERO_THRESHOLD_SAMPLES) {
    return {
      threshold: segment === 'desktop'
        ? HOVER_THRESHOLD_FALLBACK_MS
        : MOBILE_SWIPE_FALLBACK_COUNT,
      nonZeroSampleSize: values.length,
      source: 'fallback',
    };
  }

  const p75 = percentileContinuous(values, 0.75);

  return {
    threshold: segment === 'desktop'
      ? p75
      : Math.max(MOBILE_SWIPE_FALLBACK_COUNT, p75),
    nonZeroSampleSize: values.length,
    source: 'p75',
  };
}

function buildLabels(
  segment: S5Segment,
  features: S5Features[],
  threshold: number,
): number[] {
  return features.map((feature) => {
    if (feature.clicked === 1) {
      return 1;
    }

    if (segment === 'desktop') {
      return feature.hoverCount > 0 &&
        feature.hoverDurationMaxMs >= threshold
        ? 1
        : 0;
    }

    return feature.zoom === 1 ||
      (
        feature.swipeCount > 0 &&
        feature.swipeCount >= threshold
      )
      ? 1
      : 0;
  });
}

function buildFeatureMatrix(
  segment: S5Segment,
  features: S5Features[],
): number[][] {
  return features.map((feature) =>
    segment === 'desktop'
      ? [
        1,
        feature.clicked,
        feature.hoverDurationNorm,
        feature.hoverCountNorm,
        feature.proximityNorm,
      ]
      : [
        1,
        feature.clicked,
        feature.zoom,
        feature.tapCountNorm,
        feature.swipeCountNorm,
      ],
  );
}

function calculatePositiveRate(labels: number[]): number {
  if (labels.length === 0) return 0;

  const positives = labels.reduce(
    (sum, label) => sum + (label === 1 ? 1 : 0),
    0,
  );

  return positives / labels.length;
}

function predictProbability(
  features: number[],
  beta: number[],
): number {
  const z = features.reduce(
    (sum, value, index) => sum + value * (beta[index] ?? 0),
    0,
  );

  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }

  const expZ = Math.exp(z);
  return expZ / (1 + expZ);
}

function calculateAccuracy(
  probabilities: number[],
  labels: number[],
): number {
  if (
    probabilities.length === 0 ||
    probabilities.length !== labels.length
  ) {
    throw new Error('calculateAccuracy: некорректные размеры выборки');
  }

  let correct = 0;

  for (let i = 0; i < probabilities.length; i++) {
    const probability = probabilities[i];
    const label = labels[i];

    if (probability === undefined || label === undefined) {
      throw new Error('calculateAccuracy: внутренняя ошибка индексации');
    }

    const prediction = probability >= 0.5 ? 1 : 0;

    if (prediction === label) {
      correct++;
    }
  }

  return correct / probabilities.length;
}

function calculateRocAuc(
  probabilities: number[],
  labels: number[],
): number | null {
  if (
    probabilities.length === 0 ||
    probabilities.length !== labels.length
  ) {
    return null;
  }

  const rows = probabilities
    .map((probability, index) => ({
      probability,
      label: labels[index] ?? 0,
    }))
    .sort((a, b) => a.probability - b.probability);

  const positiveCount = rows.reduce(
    (sum, row) => sum + (row.label === 1 ? 1 : 0),
    0,
  );
  const negativeCount = rows.length - positiveCount;

  if (positiveCount === 0 || negativeCount === 0) {
    return null;
  }

  let positiveRankSum = 0;
  let start = 0;

  while (start < rows.length) {
    let end = start + 1;
    const score = rows[start]!.probability;

    while (
      end < rows.length &&
      rows[end]!.probability === score
    ) {
      end++;
    }

    const averageRank = (start + 1 + end) / 2;

    for (let i = start; i < end; i++) {
      if (rows[i]!.label === 1) {
        positiveRankSum += averageRank;
      }
    }

    start = end;
  }

  const auc = (
    positiveRankSum -
    positiveCount * (positiveCount + 1) / 2
  ) / (
    positiveCount * negativeCount
  );

  return Math.max(0, Math.min(1, auc));
}

export async function recalibrateS5Logistic(): Promise<void> {
  const windowStart = new Date(
    Date.now() -
    RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const tagConstantsVersion = await resolveDominantTagConstantsVersion(windowStart);

  if (tagConstantsVersion === null) {
    logger.warn('S5 Logistic recalibration skipped — no tag_constants_version found in window');
    return;
  }

  logger.info(
    { tagConstantsVersion },
    'S5 Logistic recalibration: resolved tag_constants_version',
  );

  for (const segment of SEGMENTS) {
    const features = await fetchSegmentData(
      segment,
      windowStart,
      tagConstantsVersion,
    );

    if (features.length < MIN_SAMPLE_SIZE) {
      logger.warn(
        {
          segment,
          sampleSize: features.length,
          minRequired: MIN_SAMPLE_SIZE,
        },
        'S5 Logistic recalibration skipped — insufficient sample size',
      );
      continue;
    }

    const {
      train: trainFeatures,
      test: testFeatures,
    } = splitFeaturesDeterministically(features);

    const {
      threshold,
      nonZeroSampleSize,
      source: thresholdSource,
    } = resolveLabelThreshold(
      segment,
      trainFeatures,
    );

    const yTrain = buildLabels(
      segment,
      trainFeatures,
      threshold,
    );
    const yTest = buildLabels(
      segment,
      testFeatures,
      threshold,
    );

    const trainPositiveRate = calculatePositiveRate(yTrain);
    const testPositiveRate = calculatePositiveRate(yTest);

    if (
      trainPositiveRate < MIN_POSITIVE_RATE ||
      trainPositiveRate > MAX_POSITIVE_RATE
    ) {
      logger.error(
        {
          segment,
          tagConstantsVersion,
          sampleSize: trainFeatures.length,
          positiveRate: trainPositiveRate,
          minAllowed: MIN_POSITIVE_RATE,
          maxAllowed: MAX_POSITIVE_RATE,
          threshold,
          thresholdSource,
          nonZeroThresholdSamples: nonZeroSampleSize,
        },
        'S5 Logistic recalibration skipped — invalid target class balance',
      );
      continue;
    }

    const XTrain = buildFeatureMatrix(
      segment,
      trainFeatures,
    );
    const XTest = buildFeatureMatrix(
      segment,
      testFeatures,
    );

    try {
      const fit = fitLogisticMLE(
        XTrain,
        yTrain,
        1e-6,
        100,
        L2_LAMBDA,
      );

      if (
        !fit.converged ||
        fit.beta.length !== 5 ||
        fit.beta.some((value) => !Number.isFinite(value))
      ) {
        logger.error(
          {
            segment,
            tagConstantsVersion,
            sampleSize: fit.sampleSize,
            converged: fit.converged,
            beta: fit.beta,
          },
          'S5 Logistic recalibration skipped — fitting did not converge',
        );
        continue;
      }

      const testProbabilities = XTest.map((row) =>
        predictProbability(row, fit.beta),
      );
      const testAccuracy = calculateAccuracy(
        testProbabilities,
        yTest,
      );
      const testAuc = calculateRocAuc(
        testProbabilities,
        yTest,
      );

      if (testAuc === null) {
        logger.error(
          {
            segment,
            tagConstantsVersion,
            testSampleSize: XTest.length,
            testPositiveRate,
          },
          'S5 Logistic recalibration skipped — test set contains a single class',
        );
        continue;
      }

      const alwaysOneBaselineAccuracy = testPositiveRate;

      await db.insert(s5LogisticConfigs).values({
        segmentKey: segment,
        tagConstantsVersion,
        coefficients: {
          beta0: fit.beta[0]!,
          beta1: fit.beta[1]!,
          beta2: fit.beta[2]!,
          beta3: fit.beta[3]!,
          beta4: fit.beta[4]!,
        },
        sampleSize: fit.sampleSize,
        accuracy: testAccuracy,
        isActive: false,
      });

      logger.info(
        {
          segment,
          tagConstantsVersion,
          sampleSize: fit.sampleSize,
          testSampleSize: XTest.length,
          threshold,
          thresholdSource,
          nonZeroThresholdSamples: nonZeroSampleSize,
          trainPositiveRate,
          testPositiveRate,
          l2Lambda: L2_LAMBDA,
          trainAccuracy: fit.accuracy,
          testAccuracy,
          testAuc,
          alwaysOneBaselineAccuracy,
          accuracyDeltaVsAlwaysOne: testAccuracy - alwaysOneBaselineAccuracy,
          aucDeltaVsRandom: testAuc - 0.5,
          converged: fit.converged,
          coefficients: {
            beta0: fit.beta[0]!,
            beta1: fit.beta[1]!,
            beta2: fit.beta[2]!,
            beta3: fit.beta[3]!,
            beta4: fit.beta[4]!,
          },
        },
        'S5 Logistic segment fitted — draft saved, awaiting manual activation',
      );
    } catch (err) {
      logger.error(
        { err, segment },
        'S5 Logistic fit failed',
      );
    }
  }
}

export function startS5LogisticRecalibrationJob(): void {
  cron.schedule('0 6 * * 0', async () => {
    logger.info('S5 Logistic recalibration started');
    try {
      await recalibrateS5Logistic();
      logger.info('S5 Logistic recalibration completed');
    } catch (err) {
      logger.error({ err }, 'S5 Logistic recalibration job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('S5 Logistic recalibration job scheduled (weekly Sunday 06:00 UTC)');
}