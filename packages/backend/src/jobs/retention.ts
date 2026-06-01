import cron from 'node-cron';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';
import { lt } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'retention-job' });
const RETENTION_DAYS = 90;

export function startRetentionJob(): void {
  cron.schedule('0 3 * * *', async () => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    logger.info({ cutoff }, 'Starting retention cleanup');

    try {
      await db.delete(impressions)
        .where(lt(impressions.createdAt, cutoff));
      logger.info({ cutoff }, 'Retention cleanup completed');
    } catch (err) {
      logger.error({ err }, 'Retention cleanup failed');
    }
  }, { timezone: 'UTC' });

  logger.info('Retention job scheduled (daily 03:00 UTC)');
}