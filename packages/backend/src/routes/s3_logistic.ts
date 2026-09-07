import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listS3LogisticConfigs,
  activateS3LogisticConfig,
  deactivateS3LogisticConfig,
  scheduleS3LogisticConfigDeletion,
  cancelS3LogisticConfigDeletion,
} from '../services/configs/logistic_config.js';

export const s3LogisticRoute: FastifyPluginAsync = async (app) => {

  // GET /api/s3-logistic
  app.get('/s3-logistic', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listS3LogisticConfigs();
    return reply.send(configs);
  });

  // POST /api/s3-logistic/:id/activate
  app.post('/s3-logistic/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateS3LogisticConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s3-logistic/:id/deactivate
  app.post('/s3-logistic/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateS3LogisticConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/s3-logistic/:id/schedule-delete
  app.post('/s3-logistic/:id/schedule-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deletionScheduledAt = await scheduleS3LogisticConfigDeletion(id);
    return reply.status(200).send({ deletionScheduledAt: deletionScheduledAt.toISOString() });
  });

  // POST /api/s3-logistic/:id/cancel-delete
  app.post('/s3-logistic/:id/cancel-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelS3LogisticConfigDeletion(id);
    return reply.status(200).send({ ok: true });
  });
};