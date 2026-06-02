import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { healthRoute } from './routes/health.js';
import { impressionsRoute } from './routes/impressions.js';
import { authRoute } from './routes/auth.js';
import { startRetentionJob } from './jobs/retention.js';

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

  app.register(cors, {
    hook: 'preHandler',
    delegator: (req, callback) => {
      const origin = req.headers.origin;
      const path = req.url?.split('?')[0];

      if (path === '/api/impressions') {
        return callback(null, {
          origin: '*',
          methods: ['POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type'],
          credentials: false,
        });
      }

      return callback(null, {
        origin: origin ?? false,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
      });
    },
  });

  app.register(healthRoute, { prefix: '/api' });
  app.register(impressionsRoute, { prefix: '/api' });
  app.register(authRoute, { prefix: '/api' });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled error');
    reply.status(error.statusCode ?? 500).send({
      error: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    });
  });

  app.ready().then(() => {
    startRetentionJob();
  });

  return app;
}