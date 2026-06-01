import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';

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

  app.register(cookie, {
    secret: process.env['COOKIE_SECRET'] ?? process.env['JWT_SECRET']!,
  });

  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
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