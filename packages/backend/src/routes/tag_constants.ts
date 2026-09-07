import { FastifyPluginAsync } from 'fastify';
import {
  CreateTagConstantsPayloadSchema,
  TagConstantsConfigIdParamSchema,
} from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  createTagConstantsConfig,
  listTagConstantsConfigs,
  getTagConstantsConfig,
  activateTagConstantsConfig,
  deactivateTagConstantsConfig,
} from '../services/tag/tag_constants.js';

export const tagConstantsRoute: FastifyPluginAsync = async (app) => {

  // POST /api/tag-constants — создание новой неизменяемой версии, сразу собирает файл
  app.post('/tag-constants', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = CreateTagConstantsPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ errors: parsed.error.flatten() });
    }

    const config = await createTagConstantsConfig(parsed.data);
    return reply.status(201).send(config);
  });

  // GET /api/tag-constants — список всех версий
  app.get('/tag-constants', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const items = await listTagConstantsConfigs();
    return reply.send(items);
  });

  // GET /api/tag-constants/:configId — детальный вид одной версии
  app.get('/tag-constants/:configId', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = TagConstantsConfigIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const config = await getTagConstantsConfig(parsed.data.configId);
    if (!config) {
      return reply.status(404).send({ error: 'Tag constants config not found' });
    }

    return reply.send(config);
  });

  // POST /api/tag-constants/:configId/activate — пересобирает файл, делает доступным для приема данных
  app.post('/tag-constants/:configId/activate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = TagConstantsConfigIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const config = await activateTagConstantsConfig(parsed.data.configId);
    return reply.send(config);
  });

  // POST /api/tag-constants/:configId/deactivate — удаляет физический файл, блокирует прием данных этой версии
  app.post('/tag-constants/:configId/deactivate', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = TagConstantsConfigIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const config = await deactivateTagConstantsConfig(parsed.data.configId);
    return reply.send(config);
  });
};