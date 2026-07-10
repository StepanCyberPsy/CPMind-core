import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listS7QuantileConfigs,
  activateS7QuantileConfig,
  deactivateS7QuantileConfig,
  scheduleS7QuantileConfigDeletion,
  cancelS7QuantileConfigDeletion,
} from '../services/s7_quantile_config.js';

export const s7QuantileRoute: FastifyPluginAsync = async (app) => {

  // GET /api/s7-quantile
  app.get('/s7-quantile', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listS7QuantileConfigs();
    return reply.send(configs);
  });

  // POST /api/s7-quantile/:id/activate
  app.post('/s7-quantile/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateS7QuantileConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s7-quantile/:id/deactivate
  app.post('/s7-quantile/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateS7QuantileConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s7-quantile/:id/schedule-delete
  app.post('/s7-quantile/:id/schedule-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deletionScheduledAt = await scheduleS7QuantileConfigDeletion(id);
    return reply.status(200).send({ deletionScheduledAt: deletionScheduledAt.toISOString() });
  });

  // POST /api/s7-quantile/:id/cancel-delete
  app.post('/s7-quantile/:id/cancel-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelS7QuantileConfigDeletion(id);
    return reply.status(200).send({ ok: true });
  });
};