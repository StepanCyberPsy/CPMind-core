import cron from 'node-cron';
import { inArray, and, eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { calibrationBatches, calibrationItems } from '../db/schema.js';
import pino from 'pino';

const logger = pino({ name: 'calibration-cleanup-job' });

const DEFAULT_TTL_MINUTES = 60;

export function getDraftTtlMinutes(): number {
  const raw = process.env['CALIBRATION_DRAFT_TTL_MINUTES'];
  if (!raw) return DEFAULT_TTL_MINUTES;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(
      { raw },
      'CALIBRATION_DRAFT_TTL_MINUTES is set but invalid — falling back to default',
    );
    return DEFAULT_TTL_MINUTES;
  }

  return parsed;
}

// Удаляет pending-черновики батчей, не подтвержденных в течение TTL. Approved-элементы
// не трогает никогда — они хранятся как аудит, согласно зафиксированному решению.
// Сам батч не удаляется, только переводится в expired
async function cleanupExpiredDrafts(): Promise<void> {
  const ttlMinutes = getDraftTtlMinutes();
  const cutoff = new Date(Date.now() - ttlMinutes * 60_000);

  const expiredBatches = await db
    .select({ id: calibrationBatches.id })
    .from(calibrationBatches)
    .where(and(
      eq(calibrationBatches.status, 'ready'),
      lt(calibrationBatches.createdAt, cutoff),
    ));

  if (expiredBatches.length === 0) return;

  const batchIds = expiredBatches.map((b) => b.id);

  logger.info({ batchIds, ttlMinutes }, 'Expiring calibration batches past TTL');

  await db.transaction(async (tx) => {
    await tx
      .delete(calibrationItems)
      .where(and(
        inArray(calibrationItems.batchId, batchIds),
        eq(calibrationItems.status, 'pending'),
      ));

    await tx
      .update(calibrationBatches)
      .set({ status: 'expired', completedAt: new Date() })
      .where(inArray(calibrationBatches.id, batchIds));
  });

  logger.info({ count: batchIds.length }, 'Calibration batches expired');
}

export function startCalibrationCleanupJob(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      await cleanupExpiredDrafts();
    } catch (err) {
      logger.error({ err }, 'Calibration cleanup failed');
    }
  }, { timezone: 'UTC' });

  logger.info(
    { ttlMinutes: getDraftTtlMinutes() },
    'Calibration cleanup job scheduled (every 15 minutes)',
  );
}