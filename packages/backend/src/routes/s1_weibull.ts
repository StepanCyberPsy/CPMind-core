import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listS1WeibullConfigs,
  activateS1WeibullConfig,
  deactivateS1WeibullConfig,
  scheduleS1WeibullConfigDeletion,
  cancelS1WeibullConfigDeletion,
} from '../services/weibull_config.js';

export const s1WeibullRoute: FastifyPluginAsync = async (app) => {

  // GET /api/s1-weibull
  app.get('/s1-weibull', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listS1WeibullConfigs();
    return reply.send(configs);
  });

  // POST /api/s1-weibull/:id/activate
  app.post('/s1-weibull/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateS1WeibullConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s1-weibull/:id/deactivate
  app.post('/s1-weibull/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateS1WeibullConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s1-weibull/:id/schedule-delete
  app.post('/s1-weibull/:id/schedule-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deletionScheduledAt = await scheduleS1WeibullConfigDeletion(id);
    return reply.status(200).send({ deletionScheduledAt: deletionScheduledAt.toISOString() });
  });

  // POST /api/s1-weibull/:id/cancel-delete
  app.post('/s1-weibull/:id/cancel-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelS1WeibullConfigDeletion(id);
    return reply.status(200).send({ ok: true });
  });
};