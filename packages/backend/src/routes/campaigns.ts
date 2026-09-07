import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    createCampaign,
    listCampaigns,
} from '../services/campaigns.js';

const CreateCampaignBodySchema = z.object({
    name: z.string().min(1).max(255),
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
            );
            return reply.status(201).send(campaign);
        } catch (err) {
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