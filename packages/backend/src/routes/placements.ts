import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    CreatePlacementPayloadSchema,
    UpdatePlacementPayloadSchema,
} from '@cpmind/shared';
import {
    createPlacement,
    listPlacements,
    getPlacementDetail,
    updatePlacement,
    setPlacementActive,
} from '../services/placements.js';

export const placementsRoute: FastifyPluginAsync = async (app) => {
    app.post('/placements', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const parsed = CreatePlacementPayloadSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        try {
            const result = await createPlacement(parsed.data, request.authUser.id);
            if (!result) {
                return reply.status(404).send({ error: 'Campaign or creative not found' });
            }
            return reply.status(201).send(result);
        } catch (err) {
            request.log.error({ err }, 'Failed to create placement');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.get('/placements', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        try {
            const result = await listPlacements(request.authUser.id);
            return reply.send(result);
        } catch (err) {
            request.log.error({ err }, 'Failed to list placements');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.get('/placements/:uuid', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { uuid } = request.params as { uuid: string };

        try {
            const result = await getPlacementDetail(uuid, request.authUser.id);
            if (!result) {
                return reply.status(404).send({ error: 'Placement not found' });
            }
            return reply.send(result);
        } catch (err) {
            request.log.error({ err, uuid }, 'Failed to get placement');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.patch('/placements/:uuid', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { uuid } = request.params as { uuid: string };

        const parsed = UpdatePlacementPayloadSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        try {
            const result = await updatePlacement(uuid, request.authUser.id, parsed.data);
            if (!result) {
                return reply.status(404).send({ error: 'Placement not found' });
            }
            return reply.send(result);
        } catch (err) {
            request.log.error({ err, uuid }, 'Failed to update placement');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.post(
        '/placements/:uuid/activate',
        { preHandler: requireAuth },
        async (request, reply) => {
            if (!request.authUser) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { uuid } = request.params as { uuid: string };

            try {
                const ok = await setPlacementActive(uuid, request.authUser.id, true);
                if (!ok) {
                    return reply.status(404).send({ error: 'Placement not found' });
                }
                return reply.send({ ok: true });
            } catch (err) {
                request.log.error({ err, uuid }, 'Failed to activate placement');
                return reply.status(500).send({ error: 'Internal server error' });
            }
        },
    );

    app.post(
        '/placements/:uuid/deactivate',
        { preHandler: requireAuth },
        async (request, reply) => {
            if (!request.authUser) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { uuid } = request.params as { uuid: string };

            try {
                const ok = await setPlacementActive(uuid, request.authUser.id, false);
                if (!ok) {
                    return reply.status(404).send({ error: 'Placement not found' });
                }
                return reply.send({ ok: true });
            } catch (err) {
                request.log.error({ err, uuid }, 'Failed to deactivate placement');
                return reply.status(500).send({ error: 'Internal server error' });
            }
        },
    );
};