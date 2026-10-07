import cron from 'node-cron';
import { deleteScheduledS1WeibullConfigs } from '../services/configs/weibull_config.js';
import { deleteScheduledS2Configs } from '../services/configs/s2_config.js';
import { deleteScheduledS3LogisticConfigs } from '../services/configs/logistic_config.js';
import { deleteScheduledS4Configs } from '../services/configs/s4_config.js';
import { deleteScheduledS5LogisticConfigs } from '../services/configs/s5_logistic_config.js';
import { deleteScheduledS6LogisticConfigs } from '../services/configs/s6_logistic_config.js';
import { deleteScheduledS7QuantileConfigs } from '../services/configs/s7_quantile_config.js';
import pino from 'pino';

const logger = pino({ name: 'scheduled-deletion-job' });

async function runScheduledDeletion(): Promise<void> {
  const [
    s1Deleted,
    s2Deleted,
    s3Deleted,
    s4Deleted,
    s5Deleted,
    s6Deleted,
    s7Deleted,
  ] = await Promise.all([
    deleteScheduledS1WeibullConfigs(),
    deleteScheduledS2Configs(),
    deleteScheduledS3LogisticConfigs(),
    deleteScheduledS4Configs(),
    deleteScheduledS5LogisticConfigs(),
    deleteScheduledS6LogisticConfigs(),
    deleteScheduledS7QuantileConfigs(),
  ]);

  if (s1Deleted > 0) {
    logger.info({ deleted: s1Deleted }, 'Scheduled deletion: removed S1 Weibull configs');
  }
  if (s2Deleted > 0) {
    logger.info({ deleted: s2Deleted }, 'Scheduled deletion: removed S2 configs');
  }
  if (s3Deleted > 0) {
    logger.info({ deleted: s3Deleted }, 'Scheduled deletion: removed S3 Logistic configs');
  }
  if (s4Deleted > 0) {
    logger.info({ deleted: s4Deleted }, 'Scheduled deletion: removed S4 configs');
  }
  if (s5Deleted > 0) {
    logger.info({ deleted: s5Deleted }, 'Scheduled deletion: removed S5 Logistic configs');
  }
  if (s6Deleted > 0) {
    logger.info({ deleted: s6Deleted }, 'Scheduled deletion: removed S6 Logistic configs');
  }
  if (s7Deleted > 0) {
    logger.info({ deleted: s7Deleted }, 'Scheduled deletion: removed S7 Quantile configs');
  }
}

export function startScheduledDeletionJob(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runScheduledDeletion();
    } catch (err) {
      logger.error({ err }, 'Scheduled deletion job failed');
    }
  }, { timezone: 'UTC' });

  logger.info('Scheduled deletion job scheduled (every 15 minutes)');
}