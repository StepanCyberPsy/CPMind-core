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
      const path = req.url?.split('?')[0];

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
  });

  return app;
}