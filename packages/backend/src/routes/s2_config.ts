import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
    listS2Configs,
    activateS2Config,
    deactivateS2Config,
    scheduleS2ConfigDeletion,
    cancelS2ConfigDeletion,
} from '../services/configs/s2_config.js';

export const s2ConfigRoute: FastifyPluginAsync = async (app) => {

    // GET /api/s2-config
    app.get('/s2-config', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
        const configs = await listS2Configs();
        return reply.send(configs);
    });

    // POST /api/s2-config/:id/activate
    app.post('/s2-config/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await activateS2Config(id);
        return reply.status(200).send({ ok: true });
    });

    // POST /api/s2-config/:id/deactivate
    app.post('/s2-config/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await deactivateS2Config(id);
        return reply.status(200).send({ ok: true });
    });

    // POST /api/s2-config/:id/schedule-delete
    app.post('/s2-config/:id/schedule-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const deletionScheduledAt = await scheduleS2ConfigDeletion(id);
        return reply.status(200).send({ deletionScheduledAt: deletionScheduledAt.toISOString() });
    });

    // POST /api/s2-config/:id/cancel-delete
    app.post('/s2-config/:id/cancel-delete', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await cancelS2ConfigDeletion(id);
        return reply.status(200).send({ ok: true });
    });
};