import cron from 'node-cron';
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  sql,
  desc,
  type SQL,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s6LogisticConfigs } from '../db/schema.js';
import {
  S6_PLACEMENT_GROUPS,
  S6_PLACEMENT_GROUP_FILTERS,
  buildS6SegmentKey,
  buildS6ModeSegmentKey,
  buildS6ModeGlobalSegmentKey,
  resolveS6Mode,
  fitLogisticMLE,
  type S6Mode,
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
import {
  MIN_POSITIVE_RATE,
  MAX_POSITIVE_RATE,
  L2_LAMBDA,
  calculatePositiveRate,
  calculateAccuracy,
  calculateRocAuc,
  predictProbability,
} from './logistic_quality.js';
import {
  buildS6LabelGrid,
  computeS6Label,
  isS6Labelable,
  type S6LabelInput,
  type S6LabelParams,
} from '../services/configs/s6_label.js';

const logger = pino({ name: 's6-logistic-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;
const TEST_SPLIT_RATIO = 0.2;
const COEFFICIENT_COUNT = 9;

// Допустимая доля положительных наблюдений метки. Вне этих границ метка либо
// почти никого не относит к вовлечённым, либо относит почти всех, и модель
// описывает не поведение, а саму метку
const MIN_LABEL_POSITIVE_RATE = 0.20;
const MAX_LABEL_POSITIVE_RATE = 0.60;

// Допустимое расхождение коэффициентов, обученных на обучающей и на отложенной части.
// Отбор по точности замкнут на метку, поэтому комбинация порогов выбирается
// по устойчивости: нормированное расстояние между векторами в диапазоне [0, 1]
const MAX_COEFFICIENT_INSTABILITY = 0.35;

// Признак, не меняющийся внутри сегмента, из обучения исключается: он неотличим
// от свободного члена, а его коэффициент не определён (§3.3)
const ZERO_VARIANCE_EPSILON = 1e-9;

// Досмотр и звук в SDK измеряются иначе, чем в legacy-теге (фактически просмотренный
// отрезок, действия зрителя) — обучение только на данных SDK
const SAMPLE_OPTIONS: TrainingSampleOptions = { sdkOnly: true };

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;

interface S6Row extends S6LabelInput {
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
  closedByUser: boolean | null;
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

function readNumber(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(source: Record<string, unknown> | null, key: string): boolean | null {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : null;
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

// Критерии отбора показов группы размещения. Подтип участвует только там, где задаёт
// группу: закреплённое и встроенное окно out-stream различаются поведением,
// точка вставки in-stream на вовлечённость не влияет
function buildGroupWhere(placementGroup: S6PlacementGroup): SQL | undefined {
  const filter = S6_PLACEMENT_GROUP_FILTERS[placementGroup];

  return and(
    eq(impressions.format, filter.format),
    filter.subtype !== null
      ? eq(impressions.subtype, filter.subtype)
      : undefined,
    filter.skippable !== null
      ? eq(impressions.s6Skippable, filter.skippable)
      : undefined,
  );
}

async function fetchSegmentData(
  scopeWhere: SQL | undefined,
  windowStart: Date,
  tagConstantsVersion: string,
): Promise<{ rows: S6Row[]; exclusions: SampleExclusions }> {
  const baseWhere = and(
    scopeWhere,
    eq(impressions.creativeType, 'video_creative'),
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
        subtype: impressions.subtype,
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
    const s3 = raw?.['s3'] as Record<string, unknown> | null ?? null;
    const s4 = raw?.['s4'] as Record<string, unknown> | null ?? null;
    const s5 = raw?.['s5'] as Record<string, unknown> | null ?? null;
    const s6 = raw?.['s6'] as Record<string, unknown> | null ?? null;

    return {
      impressionId: row.impressionId,
      subtype: row.subtype,
      completionRatePct: row.completionRatePct ?? null,
      quartile25: readBoolean(s6, 'quartile_25'),
      quartile50: readBoolean(s6, 'quartile_50'),
      quartile75: readBoolean(s6, 'quartile_75'),
      completion: readBoolean(s6, 'completion'),
      playInitiated: readBoolean(s6, 'play_initiated'),
      audibleTimeSec: row.audibleTimeSec ?? null,
      durationSec: row.durationSec ?? null,
      mutedThroughout: readBoolean(s6, 'muted_throughout'),
      unmutedByUser: readBoolean(s6, 'unmuted_by_user'),
      replayCount: readNumber(s6, 'replay_count'),
      skipped: readBoolean(s6, 'skipped'),
      closedByUser: readBoolean(s6, 'closed_by_user'),

      tabAbsentMaxMs: readNumber(s4, 'tab_absent_max_ms'),
      windowUnfocusedMaxMs: readNumber(s4, 'window_unfocused_max_ms'),
      surfaceAbsentMaxMs: readNumber(s4, 'surface_absent_max_ms'),
      scrollQuietMaxMs: readNumber(s3, 'scroll_quiet_max_ms'),
      skipZoneHoverRatio: readNumber(s5, 'skip_zone_hover_ratio'),
      skipZoneMovedOutside: readBoolean(s5, 'skip_zone_moved_outside'),
    };
  });

  return { rows, exclusions };
}

// Признаки показа без свободного члена. Позиция 7 различает режимы: у in-stream
// отказ выражается пропуском, у out-stream — закрытием поверхности
function buildFeatureRow(
  row: S6Row,
  mode: S6Mode,
  completionZ: number,
  quartileZ: number,
  audibleZ: number,
  replayZ: number,
): number[] {
  const refusal = mode === 'instream'
    ? (row.skipped ? 1 : 0)
    : (row.closedByUser ? 1 : 0);

  return [
    1,
    completionZ,
    quartileZ,
    audibleZ,
    row.mutedThroughout ? 1 : 0,
    row.unmutedByUser ? 1 : 0,
    replayZ,
    refusal,
    completionZ * audibleZ,
  ];
}

/**
 * Позиции признаков, различающихся внутри выборки. Свободный член сохраняется всегда,
 * остальные вырожденные столбцы обнуляются: постоянный признак неотличим от него
 * и делает систему вырожденной (§3.3)
 */
function resolveUsableFeatures(X: readonly number[][]): boolean[] {
  const usable: boolean[] = new Array(COEFFICIENT_COUNT).fill(true);

  for (let column = 1; column < COEFFICIENT_COUNT; column++) {
    const first = X[0]?.[column] ?? 0;
    let varies = false;

    for (const row of X) {
      if (Math.abs((row[column] ?? 0) - first) > ZERO_VARIANCE_EPSILON) {
        varies = true;
        break;
      }
    }

    usable[column] = varies;
  }

  return usable;
}

function maskFeatures(
  X: readonly number[][],
  usable: readonly boolean[],
): number[][] {
  return X.map((row) => row.map(
    (value, column) => (usable[column] === true ? value : 0),
  ));
}

/**
 * Нормированное расстояние между векторами коэффициентов обучающей и отложенной части.
 * Значение в [0, 1]: ноль — совпадение, единица — противоположные направления.
 * null — модель отложенной части не сошлась, устойчивость не определена
 */
function computeInstability(
  betaTrain: readonly number[],
  betaTest: readonly number[],
): number {
  let distanceSq = 0;
  let trainNormSq = 0;
  let testNormSq = 0;

  for (let i = 0; i < COEFFICIENT_COUNT; i++) {
    const train = betaTrain[i] ?? 0;
    const test = betaTest[i] ?? 0;
    distanceSq += (train - test) ** 2;
    trainNormSq += train ** 2;
    testNormSq += test ** 2;
  }

  const denominator = Math.sqrt(trainNormSq) + Math.sqrt(testNormSq);
  if (denominator === 0) return 0;

  return Math.min(1, Math.sqrt(distanceSq) / denominator);
}

interface LabelCandidate {
  params: S6LabelParams;
  positiveRate: number;
  instability: number;
  beta: number[];
  usable: boolean[];
  trainSize: number;
  testSize: number;
  testAccuracy: number;
  testAuc: number;
  testPositiveRate: number;
  converged: boolean;
}

// Обучение на одной комбинации порогов. Разбиение детерминировано по идентификатору
// показа и одинаково для всех комбинаций: сравниваются метки, а не разные выборки
function evaluateLabelParams(
  rows: readonly S6Row[],
  mode: S6Mode,
  params: S6LabelParams,
  features: readonly number[][],
): LabelCandidate | null {
  const samples: LabeledSample[] = rows.map((row, i) => ({
    key: row.impressionId,
    x: features[i] ?? [],
    y: computeS6Label(row, mode, params),
  }));

  const { train, test } = splitDeterministically(
    samples,
    (sample) => sample.key,
    TEST_SPLIT_RATIO,
  );

  const yTrain = train.map((sample) => sample.y);
  const yTest = test.map((sample) => sample.y);
  const positiveRate = calculatePositiveRate(samples.map((sample) => sample.y));
  const trainPositiveRate = calculatePositiveRate(yTrain);

  if (
    positiveRate < MIN_LABEL_POSITIVE_RATE ||
    positiveRate > MAX_LABEL_POSITIVE_RATE
  ) {
    return null;
  }

  if (
    trainPositiveRate < MIN_POSITIVE_RATE ||
    trainPositiveRate > MAX_POSITIVE_RATE
  ) {
    return null;
  }

  const usable = resolveUsableFeatures(train.map((sample) => sample.x));
  const XTrain = maskFeatures(train.map((sample) => sample.x), usable);
  const XTest = maskFeatures(test.map((sample) => sample.x), usable);

  const fit = fitLogisticMLE(XTrain, yTrain, 1e-6, 100, L2_LAMBDA);

  if (
    !fit.converged ||
    fit.beta.length !== COEFFICIENT_COUNT ||
    fit.beta.some((value) => !Number.isFinite(value))
  ) {
    return null;
  }

  // Исключённый признак получает нулевой коэффициент явно: обнулённый столбец
  // даёт его и так, но запись в конфигурации не должна зависеть от хода оптимизации
  const beta = fit.beta.map(
    (value, column) => (usable[column] === true ? value : 0),
  );

  const testProbabilities = XTest.map((row) => predictProbability(row, beta));
  const testAuc = calculateRocAuc(testProbabilities, yTest);

  if (testAuc === null) return null;

  const testFit = fitLogisticMLE(XTest, yTest, 1e-6, 100, L2_LAMBDA);
  const instability = testFit.converged && testFit.beta.every(Number.isFinite)
    ? computeInstability(beta, testFit.beta)
    : 1;

  return {
    params,
    positiveRate,
    instability,
    beta,
    usable,
    trainSize: XTrain.length,
    testSize: XTest.length,
    testAccuracy: calculateAccuracy(testProbabilities, yTest),
    testAuc,
    testPositiveRate: calculatePositiveRate(yTest),
    converged: fit.converged,
  };
}

// Обучение одного уровня сегментации. Ключ и условие выборки задают уровень: группа
// размещения, режим с устройством либо режим целиком. Уровни режима читает резолвер,
// когда у группы нет активной модели, и обучаются тем же проходом: иначе ступени
// цепочки остаются пустыми и выбор падает сразу на нулевой дефолт
async function fitAndSaveSegment(
  segmentKey: string,
  mode: S6Mode,
  scopeWhere: SQL | undefined,
  windowStart: Date,
  tagConstantsVersion: string,
): Promise<void> {
  const { rows: allRows, exclusions } = await fetchSegmentData(
    scopeWhere,
    windowStart,
    tagConstantsVersion,
  );

  const rows = allRows.filter((row) => isS6Labelable(row, mode));

  if (rows.length < MIN_SAMPLE_SIZE) {
    logger.warn(
      {
        segmentKey,
        mode,
        sampleSize: rows.length,
        fetchedSize: allRows.length,
        minRequired: MIN_SAMPLE_SIZE,
        sampleExclusions: exclusions,
      },
      'S6 Logistic recalibration skipped — insufficient labelable sample size',
    );
    return;
  }

  const completionRates = rows.map((r) => r.completionRatePct ?? quartileOrdinalFromRow(r));
  const quartiles = rows.map((r) => quartileOrdinalFromRow(r));
  const audibleRatios = rows.map((r) => (
    r.durationSec !== null && r.durationSec > 0
      ? Math.min(1, Math.max(0, (r.audibleTimeSec ?? 0) / r.durationSec))
      : 0
  ));
  const replayLogs = rows.map((r) => Math.log(1 + (r.replayCount ?? 0)));

  const completionZ = zscoreFeatures(completionRates);
  const quartileZ = zscoreFeatures(quartiles);
  const audibleZ = zscoreFeatures(audibleRatios);
  const replayZ = zscoreFeatures(replayLogs);

  // Признаки не зависят от порогов метки: матрица строится один раз на все комбинации
  const features = rows.map((row, i) => buildFeatureRow(
    row,
    mode,
    completionZ.z[i] ?? 0,
    quartileZ.z[i] ?? 0,
    audibleZ.z[i] ?? 0,
    replayZ.z[i] ?? 0,
  ));

  let best: LabelCandidate | null = null;
  const evaluatedLabelings = new Set<string>();

  try {
    for (const params of buildS6LabelGrid(mode)) {
      // Комбинации, дающие одну и ту же разметку, различаются только порогом,
      // к которому сегмент нечувствителен — повторное обучение их не различит
      const labelKey = rows
        .map((row) => computeS6Label(row, mode, params))
        .join('');

      if (evaluatedLabelings.has(labelKey)) continue;
      evaluatedLabelings.add(labelKey);

      const candidate = evaluateLabelParams(rows, mode, params, features);
      if (candidate === null) continue;

      if (best === null || candidate.instability < best.instability) {
        best = candidate;
      }
    }
  } catch (err) {
    logger.error({ err, segmentKey, mode }, 'S6 Logistic fit failed');
    return;
  }

  if (best === null) {
    logger.error(
      {
        segmentKey,
        mode,
        sampleSize: rows.length,
        evaluatedLabelings: evaluatedLabelings.size,
        minPositiveRate: MIN_LABEL_POSITIVE_RATE,
        maxPositiveRate: MAX_LABEL_POSITIVE_RATE,
      },
      'S6 Logistic recalibration skipped — no label parameters produced a usable model',
    );
    return;
  }

  if (best.instability > MAX_COEFFICIENT_INSTABILITY) {
    logger.error(
      {
        segmentKey,
        mode,
        sampleSize: rows.length,
        instability: best.instability,
        maxAllowed: MAX_COEFFICIENT_INSTABILITY,
        labelParams: best.params,
        positiveRate: best.positiveRate,
      },
      'S6 Logistic recalibration skipped — coefficients unstable across the split',
    );
    return;
  }

  await db.insert(s6LogisticConfigs).values({
    segmentKey,
    tagConstantsVersion,
    coefficients: {
      beta0: best.beta[0] ?? 0,
      beta1: best.beta[1] ?? 0,
      beta2: best.beta[2] ?? 0,
      beta3: best.beta[3] ?? 0,
      beta4: best.beta[4] ?? 0,
      beta5: best.beta[5] ?? 0,
      beta6: best.beta[6] ?? 0,
      beta7: best.beta[7] ?? 0,
      beta8: best.beta[8] ?? 0,
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
    sampleSize: best.trainSize,
    accuracy: best.testAccuracy,
    auc: best.testAuc,
    labelParams: best.params as unknown as Record<string, unknown>,
    labelPositiveRate: best.positiveRate,
    isActive: false,
  });

  logger.info(
    {
      segmentKey,
      mode,
      tagConstantsVersion,
      sampleSize: best.trainSize,
      testSampleSize: best.testSize,
      labelParams: best.params,
      labelPositiveRate: best.positiveRate,
      testPositiveRate: best.testPositiveRate,
      instability: best.instability,
      excludedFeatures: best.usable
        .map((keep, column) => (keep ? null : column))
        .filter((column) => column !== null),
      evaluatedLabelings: evaluatedLabelings.size,
      l2Lambda: L2_LAMBDA,
      testAccuracy: best.testAccuracy,
      testAuc: best.testAuc,
      alwaysOneBaselineAccuracy: best.testPositiveRate,
      accuracyDeltaVsAlwaysOne: best.testAccuracy - best.testPositiveRate,
      aucDeltaVsRandom: best.testAuc - 0.5,
      converged: best.converged,
      sampleExclusions: exclusions,
    },
    'S6 Logistic segment fitted — draft saved, awaiting manual activation',
  );
}

// Обучение всех уровней одного режима. Выборка другого режима не участвует ни на одном
// уровне: поведение зрителя при вставке в контент и в потоке страницы несопоставимо
async function recalibrateMode(mode: S6Mode): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const tagConstantsVersion = await resolveDominantTagConstantsVersion(windowStart);
  if (tagConstantsVersion === null) {
    logger.warn({ mode }, 'S6 Logistic recalibration skipped — no video impressions found in window');
    return;
  }

  logger.info({ mode, tagConstantsVersion }, 'S6 Logistic recalibration: resolved tag_constants_version');

  const modeGroups = S6_PLACEMENT_GROUPS.filter(
    (group) => resolveS6Mode(group) === mode,
  );

  const modeFormats = Array.from(new Set(
    modeGroups.map((group) => S6_PLACEMENT_GROUP_FILTERS[group].format),
  ));

  const modeWhere = inArray(impressions.format, modeFormats);

  for (const deviceType of DEVICE_TYPES) {
    const deviceWhere = eq(impressions.deviceType, deviceType);

    for (const group of modeGroups) {
      await fitAndSaveSegment(
        buildS6SegmentKey(deviceType, group),
        mode,
        and(deviceWhere, buildGroupWhere(group)),
        windowStart,
        tagConstantsVersion,
      );
    }

    await fitAndSaveSegment(
      buildS6ModeSegmentKey(deviceType, mode),
      mode,
      and(deviceWhere, modeWhere),
      windowStart,
      tagConstantsVersion,
    );
  }

  await fitAndSaveSegment(
    buildS6ModeGlobalSegmentKey(mode),
    mode,
    modeWhere,
    windowStart,
    tagConstantsVersion,
  );
}

export async function recalibrateS6Instream(): Promise<void> {
  await recalibrateMode('instream');
}

export async function recalibrateS6Outstream(): Promise<void> {
  await recalibrateMode('outstream');
}

export function startS6LogisticRecalibrationJob(): void {
  cron.schedule('0 7 * * 0', async () => {
    logger.info('S6 Logistic instream recalibration started');
    try {
      await recalibrateS6Instream();
      logger.info('S6 Logistic instream recalibration completed');
    } catch (err) {
      logger.error({ err }, 'S6 Logistic instream recalibration job failed');
    }
  }, { timezone: 'UTC' });

  // Режимы обучаются последовательно: одновременный проход двух задач по одной таблице
  // показов удерживал бы пул соединений дольше, чем разнесённый по часу
  cron.schedule('0 8 * * 0', async () => {
    logger.info('S6 Logistic outstream recalibration started');
    try {
      await recalibrateS6Outstream();
      logger.info('S6 Logistic outstream recalibration completed');
    } catch (err) {
      logger.error({ err }, 'S6 Logistic outstream recalibration job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('S6 Logistic recalibration jobs scheduled (weekly Sunday 07:00 and 08:00 UTC)');
}