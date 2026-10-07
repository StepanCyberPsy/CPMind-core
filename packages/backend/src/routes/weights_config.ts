import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CREATIVE_CATEGORIES } from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
    listWeightsConfigs,
    createWeightsConfig,
    activateWeightsConfig,
    deleteWeightsConfig,
} from '../services/configs/weights_config.js';

// Перечень категорий выводится из CREATIVE_CATEGORIES: литеральный список расходится
// с типом молча, и создание конфигурации новой категории отклонялось бы с 422
const CreateWeightsConfigSchema = z.object({
    version: z.string().min(1).max(100),
    configType: z.enum(CREATIVE_CATEGORIES),
    weights: z.object({
        s1: z.number().min(0).max(1),
        s2: z.number().min(0).max(1),
        s3: z.number().min(0).max(1),
        s4: z.number().min(0).max(1),
        s5: z.number().min(0).max(1),
        s6: z.number().min(0).max(1),
        s7: z.number().min(0).max(1),
    }),
    description: z.string().max(500).optional(),
});

export const weightsConfigRoute: FastifyPluginAsync = async (app) => {

    // GET /api/weights-config
    app.get('/weights-config', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const configs = await listWeightsConfigs();
        return reply.send(configs);
    });

    // POST /api/weights-config
    app.post('/weights-config', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const parsed = CreateWeightsConfigSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(422).send({ errors: parsed.error.flatten() });
        }

        const { version, configType, weights, description } = parsed.data;
        const config = await createWeightsConfig({
            version,
            configType,
            weights,
            ...(description !== undefined && { description }),
        });
        return reply.status(201).send(config);
    });

    // POST /api/weights-config/:id/activate
    app.post('/weights-config/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await activateWeightsConfig(id);
        return reply.status(200).send({ ok: true });
    });

    // DELETE /api/weights-config/:id
    app.delete('/weights-config/:id', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await deleteWeightsConfig(id);
        return reply.status(200).send({ ok: true });
    });
};