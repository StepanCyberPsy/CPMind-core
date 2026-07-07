import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { IvtThresholdsSchema } from '@cpmind/shared';
import {
  listIvtThresholdsConfigs,
  createIvtThresholdsConfig,
  activateIvtThresholdsConfig,
  deactivateIvtThresholdsConfig,
} from '../services/ivt_thresholds.js';

const CreateIvtThresholdsSchema = z.object({
  version: z.string().min(1).max(100),
  thresholds: IvtThresholdsSchema,
  description: z.string().max(500).optional(),
});

export const ivtThresholdsRoute: FastifyPluginAsync = async (app) => {

  // GET /api/ivt-thresholds
  app.get('/ivt-thresholds', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listIvtThresholdsConfigs();
    return reply.send(configs);
  });

  // POST /api/ivt-thresholds
  app.post('/ivt-thresholds', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = CreateIvtThresholdsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ errors: parsed.error.flatten() });
    }

    const { version, thresholds, description } = parsed.data;
    const config = await createIvtThresholdsConfig({
      version,
      thresholds,
      ...(description !== undefined && { description }),
    });

    return reply.status(201).send(config);
  });

  // POST /api/ivt-thresholds/:id/activate
  app.post('/ivt-thresholds/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateIvtThresholdsConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/ivt-thresholds/:id/deactivate
  app.post('/ivt-thresholds/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateIvtThresholdsConfig(id);
    return reply.status(200).send({ ok: true });
  });
};