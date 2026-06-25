import { FastifyPluginAsync } from 'fastify';
import {
  CreateTagPayloadSchema,
  UpdateTagPayloadSchema,
  TagUuidParamSchema,
} from '@cpmind/shared';
import type { UserUuid } from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  createAdditionalTag,
  listAllTags,
  listMyTags,
  updateTagByUuid,
} from '../services/tags.js';

export const tagsRoute: FastifyPluginAsync = async (app) => {

  // Создание дополнительного тега для существующего пользователя, доступно только администратору
  app.post('/tags', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = CreateTagPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const created = await createAdditionalTag(parsed.data);
    if (!created) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.status(201).send(created);
  });

  // Список всех тегов всех пользователей, доступен только администратору
  app.get('/tags', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const items = await listAllTags();
    return reply.send(items);
  });

  // Деактивация и/или переименование тега администратором
  app.patch('/tags/:tagUuid', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = TagUuidParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const parsedBody = UpdateTagPayloadSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const updated = await updateTagByUuid(parsedParams.data.tagUuid, parsedBody.data);
    if (!updated) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    return reply.send(updated);
  });

  // Собственные теги авторизованного пользователя, владелец строго из JWT, не из query/params
  app.get('/tags/mine', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const items = await listMyTags(request.authUser.id, request.authUser.uuid as UserUuid);
    return reply.send(items);
  });
};