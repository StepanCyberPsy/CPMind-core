import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ENTITY_KEY_REGEX } from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    createCampaign,
    listCampaigns,
    CampaignServiceError,
} from '../services/campaigns.js';

const CreateCampaignBodySchema = z.object({
    name: z.string().min(1).max(255),
    campaignKey: z.string().min(1).max(255).regex(ENTITY_KEY_REGEX).optional(),
});

export const campaignsRoute: FastifyPluginAsync = async (app) => {
    app.post('/campaigns', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const parsed = CreateCampaignBodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        try {
            const campaign = await createCampaign(
                request.authUser.id,
                parsed.data.name,
                parsed.data.campaignKey,
            );
            return reply.status(201).send(campaign);
        } catch (err) {
            if (err instanceof CampaignServiceError) {
                return reply.status(err.statusCode).send({ error: err.message, code: err.code });
            }
            request.log.error({ err }, 'Failed to create campaign');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    app.get('/campaigns', { preHandler: requireAuth }, async (request, reply) => {
        if (!request.authUser) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        try {
            const result = await listCampaigns(request.authUser.id);
            return reply.send(result);
        } catch (err) {
            request.log.error({ err }, 'Failed to list campaigns');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });
};