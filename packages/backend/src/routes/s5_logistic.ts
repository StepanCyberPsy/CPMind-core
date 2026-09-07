import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listS5LogisticConfigs,
  activateS5LogisticConfig,
  deactivateS5LogisticConfig,
  scheduleS5LogisticConfigDeletion,
  cancelS5LogisticConfigDeletion,
} from '../services/configs/s5_logistic_config.js';

export const s5LogisticRoute: FastifyPluginAsync = async (app) => {

  // GET /api/s5-logistic
  app.get('/s5-logistic', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listS5LogisticConfigs();
    return reply.send(configs);
  });

  // POST /api/s5-logistic/:id/activate
  app.post('/s5-logistic/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateS5LogisticConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s5-logistic/:id/deactivate
  app.post('/s5-logistic/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateS5LogisticConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s5-logistic/:id/schedule-delete
  app.post('/s5-logistic/:id/schedule-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deletionScheduledAt = await scheduleS5LogisticConfigDeletion(id);
    return reply.status(200).send({ deletionScheduledAt: deletionScheduledAt.toISOString() });
  });

  // POST /api/s5-logistic/:id/cancel-delete
  app.post('/s5-logistic/:id/cancel-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelS5LogisticConfigDeletion(id);
    return reply.status(200).send({ ok: true });
  });
};