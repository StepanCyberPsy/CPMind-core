import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listIvtListConfigs,
  getIvtListConfig,
  createIvtListConfig,
  activateIvtListConfig,
  deactivateIvtListConfig,
  parseIvtListCsv,
} from '../services/ivt/ivt_list.js';

const CreateIvtListSchema = z.object({
  version: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const ivtListsRoute: FastifyPluginAsync = async (app) => {

  // GET /api/ivt-lists
  app.get('/ivt-lists', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const configs = await listIvtListConfigs();
    return reply.send(configs);
  });

  // POST /api/ivt-lists — multipart/form-data: version, description?, file (CSV)
  app.post('/ivt-lists', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const contentType = request.headers['content-type'] ?? '';

    if (!contentType.includes('application/json')) {
      return reply.status(415).send({ error: 'Content-Type must be application/json' });
    }

    const body = request.body as Record<string, unknown>;
    const parsedMeta = CreateIvtListSchema.safeParse(body);
    if (!parsedMeta.success) {
      return reply.status(422).send({ errors: parsedMeta.error.flatten() });
    }

    const csvRaw = body['csv'];
    if (typeof csvRaw !== 'string' || csvRaw.trim().length === 0) {
      return reply.status(422).send({ error: 'Поле csv обязательно и не может быть пустым' });
    }

    const { entries, errors } = parseIvtListCsv(csvRaw);

    if (entries.length === 0) {
      return reply.status(422).send({
        error: 'CSV не содержит валидных записей',
        parseErrors: errors,
      });
    }

    const config = await createIvtListConfig({
      version: parsedMeta.data.version,
      entries,
      ...(parsedMeta.data.description !== undefined && { description: parsedMeta.data.description }),
    });

    return reply.status(201).send({
      ...config,
      parseErrors: errors.length > 0 ? errors : undefined,
    });
  });

  // POST /api/ivt-lists/:id/activate
  app.post('/ivt-lists/:id/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await activateIvtListConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // POST /api/ivt-lists/:id/deactivate
  app.post('/ivt-lists/:id/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deactivateIvtListConfig(id);
    return reply.status(200).send({ ok: true });
  });

  // GET /api/ivt-lists/:id
  app.get('/ivt-lists/:id', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const config = await getIvtListConfig(id);

    if (!config) {
      return reply.status(404).send({ error: 'Конфигурация не найдена' });
    }

    return reply.send(config);
  });
};