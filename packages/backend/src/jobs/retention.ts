import cron from 'node-cron';
import { inArray, lt, sql } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';

const logger = pino({ name: 'retention-job' });
const RETENTION_DAYS = 90;
const DELETE_BATCH_SIZE = 5_000;

let running = false;

// Батчевое удаление ограничивает длительность транзакции и объём WAL за один проход
async function deleteExpiredImpressions(cutoff: Date): Promise<number> {
  let total = 0;
  let deletedInBatch: number;

  do {
    const expired = db
      .select({ id: impressions.id })
      .from(impressions)
      .where(lt(impressions.createdAt, cutoff))
      .limit(DELETE_BATCH_SIZE);

    const deleted = await db
      .delete(impressions)
      .where(inArray(impressions.id, expired))
      .returning({ id: impressions.id });

    deletedInBatch = deleted.length;
    total += deletedInBatch;
  } while (deletedInBatch === DELETE_BATCH_SIZE);

  return total;
}

// Сессия удаляется только после своих показов: FK impressions.ad_session_id запрещает
// обратный порядок. Сессии без показов (баннер не отрисован, автозапуск заблокирован,
// vast_only) удаляются по тому же окну
async function deleteOrphanedAdSessions(cutoff: Date): Promise<number> {
  let total = 0;
  let deletedInBatch: number;

  do {
    const result = await db.execute(sql`
      DELETE FROM ad_sessions
      WHERE ad_session_id IN (
        SELECT s.ad_session_id
        FROM ad_sessions s
        WHERE s.created_at < ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM impressions i WHERE i.ad_session_id = s.ad_session_id
          )
        LIMIT ${DELETE_BATCH_SIZE}
      )
    `);

    deletedInBatch = result.rowCount ?? 0;
    total += deletedInBatch;
  } while (deletedInBatch === DELETE_BATCH_SIZE);

  return total;
}

export function startRetentionJob(): void {
  cron.schedule('0 3 * * *', async () => {
    if (running) {
      logger.warn('Retention cleanup skipped — previous run still in progress');
      return;
    }

    running = true;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    logger.info({ cutoff }, 'Starting retention cleanup');

    try {
      const impressionsDeleted = await deleteExpiredImpressions(cutoff);
      const adSessionsDeleted = await deleteOrphanedAdSessions(cutoff);
      logger.info(
        { cutoff, impressionsDeleted, adSessionsDeleted },
        'Retention cleanup completed',
      );
    } catch (err) {
      logger.error({ err }, 'Retention cleanup failed');
    } finally {
      running = false;
    }
  }, { timezone: 'UTC' });

  logger.info('Retention job scheduled (daily 03:00 UTC)');
}