import cron from 'node-cron';
import { and, eq, gte, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';
import { getActiveIvtThresholds } from '../services/ivt_thresholds.js';
import pino from 'pino';

const logger = pino({ name: 'ivt-frequency-job' });

async function runFrequencyAnalysis(): Promise<void> {
  const thresholds = await getActiveIvtThresholds();

  if (
    thresholds.repeat_fp_window_min === null ||
    thresholds.repeat_fp_max_creatives === null
  ) {
    logger.debug('IVT frequency thresholds not configured — skipping');
    return;
  }

  const windowMs = thresholds.repeat_fp_window_min * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs);
  const confirmThreshold = thresholds.confidence_confirm ?? 0.85;

  // Находим fp_hash с аномальным числом уникальных креативов за окно
  const anomalous = await db
    .select({
      fpHash: impressions.fpHash,
      uniqueCreatives: sql<number>`count(distinct ${impressions.creativeId})::int`,
    })
    .from(impressions)
    .where(and(
      isNotNull(impressions.fpHash),
      gte(impressions.createdAt, cutoff),
      eq(impressions.ivtVerdict, 'valid'),
    ))
    .groupBy(impressions.fpHash)
    .having(
      sql`count(distinct ${impressions.creativeId})::int > ${thresholds.repeat_fp_max_creatives}`,
    );

  if (anomalous.length === 0) return;

  logger.info(
    { count: anomalous.length, windowMin: thresholds.repeat_fp_window_min },
    'IVT frequency anomalies detected',
  );

  const confidence = 0.75;
  const verdict = confidence >= confirmThreshold ? 'sivt_confirmed' : 'sivt_suspected';

  for (const row of anomalous) {
    if (!row.fpHash) continue;

    await db
      .update(impressions)
      .set({
        ivtVerdict: verdict,
        ivtCategory: 'botnet_frequency',
        ivtConfidence: confidence,
        scoreReliable: false,
        ivtSignals: [{
          rule: 'botnet_frequency',
          confidence,
          detail: `fp_hash hits ${row.uniqueCreatives} unique creatives in ${thresholds.repeat_fp_window_min}min window (max: ${thresholds.repeat_fp_max_creatives})`,
        }],
      })
      .where(and(
        eq(impressions.fpHash, row.fpHash),
        gte(impressions.createdAt, cutoff),
        ne(impressions.ivtVerdict, 'givt'),
      ));
  }

  logger.info(
    { updatedHashes: anomalous.length, verdict },
    'IVT frequency update complete',
  );
}

export function startIvtFrequencyJob(): void {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runFrequencyAnalysis();
    } catch (err) {
      logger.error({ err }, 'IVT frequency job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('IVT frequency job scheduled (every 30 minutes)');
}