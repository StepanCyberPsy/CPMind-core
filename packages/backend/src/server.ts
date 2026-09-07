import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { healthRoute } from './routes/health.js';
import { impressionsRoute } from './routes/impressions.js';
import { authRoute } from './routes/auth.js';
import { weightsConfigRoute } from './routes/weights_config.js';
import { usersRoute } from './routes/users.js';
import { tagsRoute } from './routes/tags.js';
import { calibrationsRoute } from './routes/calibrations.js';
import { tagConstantsRoute } from './routes/tag_constants.js';
import { startRetentionJob } from './jobs/retention.js';
import { startCalibrationCleanupJob } from './jobs/calibration_cleanup.js';
import { startIvtFrequencyJob } from './jobs/ivt_frequency.js';
import { ivtListsRoute } from './routes/ivt_lists.js';
import { ivtThresholdsRoute } from './routes/ivt_thresholds.js';
import { s1WeibullRoute } from './routes/s1_weibull.js';
import { s3LogisticRoute } from './routes/s3_logistic.js';
import { s4ConfigRoute } from './routes/s4_config.js';
import { s5LogisticRoute } from './routes/s5_logistic.js';
import { s6LogisticRoute } from './routes/s6_logistic.js';
import { s7QuantileRoute } from './routes/s7_quantile.js';
import { startScheduledDeletionJob } from './jobs/scheduled_deletion.js';
import { startS1WeibullRecalibrationJob } from './jobs/s1_weibull_recalibration.js';
import { startS3LogisticRecalibrationJob } from './jobs/s3_logistic_recalibration.js';
import { startS4CalibrationJob } from './jobs/s4_calibration.js';
import { startS5LogisticRecalibrationJob } from './jobs/s5_logistic_recalibration.js';
import { startS6LogisticRecalibrationJob } from './jobs/s6_logistic_recalibration.js';
import { startS7QuantileRecalibrationJob } from './jobs/s7_quantile_recalibration.js';
import { startAssetGcJob } from './jobs/asset_gc.js';
import { campaignsRoute } from './routes/campaigns.js';
import { creativesRoute } from './routes/creatives.js';
import { uploadsRoute } from './routes/uploads.js';
import { placementsRoute } from './routes/placements.js';
import { deliveryRoute } from './routes/delivery.js';
import { vastRoute } from './routes/vast.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      ...(process.env['NODE_ENV'] === 'development' && {
        transport: { target: 'pino-pretty' },
      }),
    },
    trustProxy: true,
  });

  app.register(helmet, {
    contentSecurityPolicy: false,
  });

  app.register(cookie, {
    secret: process.env['COOKIE_SECRET'] ?? process.env['JWT_SECRET']!,
  });

  app.decorateRequest('authUser', null);

  app.register(cors, {
    hook: 'onRequest',
    delegator: (req, callback) => {
      const origin = req.headers.origin;
      const path = req.url?.split('?')[0] ?? '';

      if (
        path.startsWith('/e/') ||
        path.startsWith('/vast/') ||
        path.startsWith('/t/') ||
        path.startsWith('/api/delivery/')
      ) {
        return callback(null, {
          origin: '*',
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type'],
          credentials: false,
        });
      }

      if (path === '/api/collect') {
        return callback(null, {
          origin: true,
          methods: ['POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type'],
          credentials: true,
        });
      }

      return callback(null, {
        origin: origin ?? false,
        methods: [
          'GET',
          'POST',
          'PATCH',
          'DELETE',
          'OPTIONS'
        ],
        allowedHeaders: ['Content-Type'],
        credentials: true,
      });
    },
  });

  app.register(healthRoute, { prefix: '/api' });
  app.register(impressionsRoute, { prefix: '/api' });
  app.register(authRoute, { prefix: '/api' });
  app.register(weightsConfigRoute, { prefix: '/api' });
  app.register(usersRoute, { prefix: '/api' });
  app.register(tagsRoute, { prefix: '/api' });
  app.register(calibrationsRoute, { prefix: '/api' });
  app.register(tagConstantsRoute, { prefix: '/api' });
  app.register(ivtListsRoute, { prefix: '/api' });
  app.register(ivtThresholdsRoute, { prefix: '/api' });
  app.register(s1WeibullRoute, { prefix: '/api' });
  app.register(s3LogisticRoute, { prefix: '/api' });
  app.register(s4ConfigRoute, { prefix: '/api' });
  app.register(s5LogisticRoute, { prefix: '/api' });
  app.register(s6LogisticRoute, { prefix: '/api' });
  app.register(s7QuantileRoute, { prefix: '/api' });
  app.register(campaignsRoute, { prefix: '/api' });
  app.register(creativesRoute, { prefix: '/api' });
  app.register(uploadsRoute, { prefix: '/api' });
  app.register(placementsRoute, { prefix: '/api' });
  app.register(deliveryRoute);
  app.register(vastRoute);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled error');
    reply.status(error.statusCode ?? 500).send({
      error: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    });
  });

  app.ready().then(() => {
    startRetentionJob();
    startCalibrationCleanupJob();
    startIvtFrequencyJob();
    startScheduledDeletionJob();
    startAssetGcJob();
    startS1WeibullRecalibrationJob();
    startS3LogisticRecalibrationJob();
    startS4CalibrationJob();
    startS5LogisticRecalibrationJob();
    startS6LogisticRecalibrationJob();
    startS7QuantileRecalibrationJob();
  });

  return app;
}