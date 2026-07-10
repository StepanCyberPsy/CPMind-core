import cron from 'node-cron';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions, s4Configs } from '../db/schema.js';
import { fitS4Params, type S4Row } from '../services/s4_fit.js';
import pino from 'pino';

const logger = pino({ name: 's4-calibration-job' });

const RECALIBRATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 1000;

const SEGMENTS = ['desktop_banner', 'mobile_banner', 'desktop_video', 'mobile_video'] as const;
type S4Segment = typeof SEGMENTS[number];

function buildS4SegmentFilter(segment: S4Segment): {
  isMobile: boolean;
  creativeTypes: string[];
} {
  const [device, creative] = segment.split('_') as [string, string];
  const isMobile = device === 'mobile';
  const creativeTypes = creative === 'banner'
    ? ['banner_static', 'banner_gif', 'banner_html5']
    : ['video_creative'];
  return { isMobile, creativeTypes };
}

async function fetchSegmentData(
  segment: S4Segment,
  windowStart: Date,
): Promise<S4Row[]> {
  const { isMobile, creativeTypes } = buildS4SegmentFilter(segment);

  const rows = await db
    .select({ signalsRaw: impressions.signalsRaw })
    .from(impressions)
    .where(and(
      isMobile
        ? sql`${impressions.deviceType} IN ('mobile', 'tablet')`
        : eq(impressions.deviceType, 'desktop'),
      sql`${impressions.creativeType} = ANY(${creativeTypes})`,
      gte(impressions.createdAt, windowStart),
      eq(impressions.isSuspicious, false),
    ));

  return rows
    .map((row) => {
      const raw = row.signalsRaw as Record<string, unknown> | null;
      if (!raw) return null;
      const s4Raw = raw['s4'] as Record<string, unknown> | undefined;
      if (!s4Raw) return null;

      const tabActiveTimeMs = typeof s4Raw['tab_active_time_ms'] === 'number'
        ? s4Raw['tab_active_time_ms']
        : null;
      const tabTotalTimeMs = typeof s4Raw['tab_total_time_ms'] === 'number'
        ? s4Raw['tab_total_time_ms']
        : null;
      const tabSwitchesCount = typeof s4Raw['tab_switches_count'] === 'number'
        ? s4Raw['tab_switches_count']
        : null;

      if (
        tabActiveTimeMs === null ||
        tabTotalTimeMs === null ||
        tabSwitchesCount === null ||
        tabTotalTimeMs <= 0 ||
        tabActiveTimeMs < 0 ||
        tabSwitchesCount < 0
      ) return null;

      return { tabActiveTimeMs, tabTotalTimeMs, tabSwitchesCount };
    })
    .filter((r): r is S4Row => r !== null);
}

async function recalibrateS4(): Promise<void> {
  const windowStart = new Date(Date.now() - RECALIBRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const segment of SEGMENTS) {
    const rows = await fetchSegmentData(segment, windowStart);

    if (rows.length < MIN_SAMPLE_SIZE) {
      logger.warn(
        { segment, sampleSize: rows.length, minRequired: MIN_SAMPLE_SIZE },
        'S4 calibration skipped — insufficient sample size',
      );
      continue;
    }

    try {
      const fit = fitS4Params(rows);
      const version = `v_${new Date().toISOString().slice(0, 10)}_auto`;

      await db.insert(s4Configs).values({
        segmentKey: segment,
        version,
        lambda: fit.lambda,
        tRefMs: fit.tRefMs,
        sampleSize: rows.length,
        isActive: false,
      });

      logger.info(
        {
          segment,
          lambda: fit.lambda.toFixed(4),
          tRefMs: fit.tRefMs,
          sampleSize: rows.length,
          iterations: fit.iterations,
          converged: fit.converged,
        },
        'S4 segment calibrated — draft saved, awaiting manual activation',
      );
    } catch (err) {
      logger.error({ err, segment }, 'S4 calibration fit failed');
    }
  }
}

export function startS4CalibrationJob(): void {
  cron.schedule('0 6 1 * *', async () => {
    logger.info('S4 calibration started');
    try {
      await recalibrateS4();
      logger.info('S4 calibration completed');
    } catch (err) {
      logger.error({ err }, 'S4 calibration job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('S4 calibration job scheduled (monthly 1st 06:00 UTC)');
}