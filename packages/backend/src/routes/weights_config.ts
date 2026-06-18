import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    listWeightsConfigs,
    createWeightsConfig,
    activateWeightsConfig,
    deleteWeightsConfig,
} from '../services/weights_config.js';

const CreateWeightsConfigSchema = z.object({
    version: z.string().min(1).max(100),
    weights: z.object({
        s1: z.number().min(0).max(1),
        s2: z.number().min(0).max(1),
        s3: z.number().min(0).max(1),
        s4: z.number().min(0).max(1),
        s5: z.number().min(0).max(1),
        s7: z.number().min(0).max(1),
    }),
    description: z.string().max(500).optional(),
});

export const weightsConfigRoute: FastifyPluginAsync = async (app) => {

    // GET /api/weights-config
    app.get('/weights-config', { preHandler: requireAuth }, async (request, reply) => {
        const configs = await listWeightsConfigs();
        return reply.send(configs);
    });

    // POST /api/weights-config
    app.post('/weights-config', { preHandler: requireAuth }, async (request, reply) => {
        const parsed = CreateWeightsConfigSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        const { version, weights, description } = parsed.data;
        const config = await createWeightsConfig({
            version,
            weights,
            ...(description !== undefined && { description }),
        });
        return reply.status(201).send(config);
    });

    // POST /api/weights-config/:id/activate
    app.post('/weights-config/:id/activate', { preHandler: requireAuth }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await activateWeightsConfig(id);
        return reply.status(200).send({ ok: true });
    });

    // DELETE /api/weights-config/:id
    app.delete('/weights-config/:id', { preHandler: requireAuth }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await deleteWeightsConfig(id);
        return reply.status(200).send({ ok: true });
    });
};