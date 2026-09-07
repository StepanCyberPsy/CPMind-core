import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listS4Configs,
  activateS4Config,
  deactivateS4Config,
  scheduleS4ConfigDeletion,
  cancelS4ConfigDeletion,
} from '../services/configs/s4_config.js';

export const s4ConfigRoute: FastifyPluginAsync = async (app) => {

  // GET /api/s4-config
  app.get('/s4-config', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listS4Configs();
    return reply.send(configs);
  });

  // POST /api/s4-config/:id/activate
  app.post('/s4-config/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateS4Config(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s4-config/:id/deactivate
  app.post('/s4-config/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateS4Config(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s4-config/:id/schedule-delete
  app.post('/s4-config/:id/schedule-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deletionScheduledAt = await scheduleS4ConfigDeletion(id);
    return reply.status(200).send({ deletionScheduledAt: deletionScheduledAt.toISOString() });
  });

  // POST /api/s4-config/:id/cancel-delete
  app.post('/s4-config/:id/cancel-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelS4ConfigDeletion(id);
    return reply.status(200).send({ ok: true });
  });
};