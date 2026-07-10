import cron from 'node-cron';
import { and, eq, gte, isNotNull, sql, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s5LogisticConfigs } from '../db/schema.js';
import { fitLogisticMLE } from '@cpmind/shared';
import pino from 'pino';

const logger = pino({ name: 's5-logistic-recalibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;
const TEST_SPLIT_RATIO = 0.2;

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
  clicked: number;
  hoverDurationNorm: number;
  hoverCountNorm: number;
  proximityNorm: number;
  zoom: number;
  tapCountNorm: number;
  swipeCountNorm: number;
  hoverDurationMaxMs: number;
  isSuspicious: boolean;
}

function extractFeatures(signalsRaw: unknown): S5Features | null {
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
    clicked,
    hoverDurationNorm,
    hoverCountNorm,
    proximityNorm,
    zoom,
    tapCountNorm,
    swipeCountNorm,
    hoverDurationMaxMs,
    isSuspicious: false,
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
    .select({ signalsRaw: impressions.signalsRaw })
    .from(impressions)
    .where(and(
      deviceFilter,
      gte(impressions.createdAt, windowStart),
      eq(impressions.isSuspicious, false),
      eq(impressions.tagConstantsVersion, tagConstantsVersion),
      isNotNull(impressions.signalsRaw),
    ));

  return rows
    .map((row) => extractFeatures(row.signalsRaw))
    .filter((f): f is S5Features => f !== null);
}

async function recalibrateS5Logistic(): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const tagConstantsVersion = await resolveDominantTagConstantsVersion(windowStart);
  if (tagConstantsVersion === null) {
    logger.warn('S5 Logistic recalibration skipped — no tag_constants_version found in window');
    return;
  }

  logger.info({ tagConstantsVersion }, 'S5 Logistic recalibration: resolved tag_constants_version');

  for (const segment of SEGMENTS) {
    const features = await fetchSegmentData(segment, windowStart, tagConstantsVersion);

    if (features.length < MIN_SAMPLE_SIZE) {
      logger.warn(
        { segment, sampleSize: features.length, minRequired: MIN_SAMPLE_SIZE },
        'S5 Logistic recalibration skipped — insufficient sample size',
      );
      continue;
    }

    // Прокси-метка: P75 hoverDurationMaxMs по сегменту
    const hoverDurations = features
      .map((f) => f.hoverDurationMaxMs)
      .sort((a, b) => a - b);
    const p75Idx = Math.floor(hoverDurations.length * 0.75);
    const hoverP75 = hoverDurations[p75Idx] ?? 0;

    // y=1: clicked=1 ИЛИ hoverDurationMaxMs ≥ P75 (§3.4)
    const y = features.map((f) =>
      f.clicked === 1 || f.hoverDurationMaxMs >= hoverP75 ? 1 : 0,
    );

    // X — feature-вектор по сегменту
    const X = features.map((f) =>
      segment === 'desktop'
        ? [1, f.clicked, f.hoverDurationNorm, f.hoverCountNorm, f.proximityNorm]
        : [1, f.clicked, f.zoom, f.tapCountNorm, f.swipeCountNorm],
    );

    const splitIdx = Math.floor(features.length * (1 - TEST_SPLIT_RATIO));
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

      await db.insert(s5LogisticConfigs).values({
        segmentKey: segment,
        tagConstantsVersion,
        coefficients: {
          beta0: fit.beta[0] ?? 0,
          beta1: fit.beta[1] ?? 0,
          beta2: fit.beta[2] ?? 0,
          beta3: fit.beta[3] ?? 0,
          beta4: fit.beta[4] ?? 0,
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
          trainAccuracy: fit.accuracy.toFixed(3),
          testAccuracy: testAccuracy.toFixed(3),
          converged: fit.converged,
        },
        'S5 Logistic segment fitted — draft saved, awaiting manual activation',
      );
    } catch (err) {
      logger.error({ err, segment }, 'S5 Logistic fit failed');
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