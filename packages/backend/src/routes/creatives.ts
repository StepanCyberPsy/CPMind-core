import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    listCreatives,
    getCreativeDetail,
    archiveCreative,
} from '../services/creatives.js';
import { CreateExternalVastCreativeSchema } from '@cpmind/shared';
import { createExternalVastCreative } from '../services/creatives/external_vast.js';

// Карта отказов сервиса на коды ответа: несуществующая кампания и занятый ключ —
// ошибки запроса, остальное — непригодный адрес стороннего тега
const EXTERNAL_VAST_STATUS: Record<string, number> = {
    CAMPAIGN_NOT_FOUND: 404,
    CREATIVE_KEY_TAKEN: 409,
};

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

    // Видеокреатив из стороннего VAST-тега: файла нет, CPMind оборачивает
    // указанный адрес во Wrapper со своим трекингом и блоком верификации
    app.post(
        '/creatives/external-vast',
        { preHandler: requireAuth },
        async (request, reply) => {
            if (!request.authUser) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const parsed = CreateExternalVastCreativeSchema.safeParse(request.body);

            if (!parsed.success) {
                return reply.status(422).send({ errors: parsed.error.flatten() });
            }

            try {
                const result = await createExternalVastCreative(
                    parsed.data,
                    request.authUser.id,
                );

                if (!result.ok) {
                    return reply
                        .status(EXTERNAL_VAST_STATUS[result.reason] ?? 422)
                        .send({ error: 'Invalid external VAST creative', code: result.reason });
                }

                return reply.status(201).send({
                    creativeUuid: result.creativeUuid,
                    versionUuid: result.versionUuid,
                });
            } catch (err) {
                request.log.error({ err }, 'Failed to create external VAST creative');
                return reply.status(500).send({ error: 'Internal server error' });
            }
        },
    );
};
