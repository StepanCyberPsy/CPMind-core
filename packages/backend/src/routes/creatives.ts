import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    listCreatives,
    getCreativeDetail,
    archiveCreative,
} from '../services/creatives.js';

export const creativesRoute: FastifyPluginAsync = async (app) => {
    app.get('/creatives', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        try {
            const result = await listCreatives(request.authUser.id);
            return reply.send(result);
        } catch (err) {
            request.log.error({ err }, 'Failed to list creatives');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.get('/creatives/:uuid', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { uuid } = request.params as { uuid: string };

        try {
            const result = await getCreativeDetail(uuid, request.authUser.id);
            if (!result) {
                return reply.status(404).send({ error: 'Creative not found' });
            }
            return reply.send(result);
        } catch (err) {
            request.log.error({ err, uuid }, 'Failed to get creative');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.post(
        '/creatives/:uuid/archive',
        { preHandler: requireAuth },
        async (request, reply) => {
            if (!request.authUser) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { uuid } = request.params as { uuid: string };

            try {
                const archived = await archiveCreative(uuid, request.authUser.id);
                if (!archived) {
                    return reply.status(404).send({ error: 'Creative not found' });
                }
                return reply.status(200).send({ ok: true });
            } catch (err) {
                request.log.error({ err, uuid }, 'Failed to archive creative');
                return reply.status(500).send({ error: 'Internal server error' });
            }
        },
    );
};