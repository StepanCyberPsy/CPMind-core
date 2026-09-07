import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listS6LogisticConfigs,
  activateS6LogisticConfig,
  deactivateS6LogisticConfig,
  scheduleS6LogisticConfigDeletion,
  cancelS6LogisticConfigDeletion,
} from '../services/configs/s6_logistic_config.js';

export const s6LogisticRoute: FastifyPluginAsync = async (app) => {

  // GET /api/s6-logistic
  app.get('/s6-logistic', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listS6LogisticConfigs();
    return reply.send(configs);
  });

  // POST /api/s6-logistic/:id/activate
  app.post('/s6-logistic/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateS6LogisticConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s6-logistic/:id/deactivate
  app.post('/s6-logistic/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateS6LogisticConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s6-logistic/:id/schedule-delete
  app.post('/s6-logistic/:id/schedule-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deletionScheduledAt = await scheduleS6LogisticConfigDeletion(id);
    return reply.status(200).send({ deletionScheduledAt: deletionScheduledAt.toISOString() });
  });

  // POST /api/s6-logistic/:id/cancel-delete
  app.post('/s6-logistic/:id/cancel-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelS6LogisticConfigDeletion(id);
    return reply.status(200).send({ ok: true });
  });
};