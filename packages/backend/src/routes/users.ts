import { FastifyPluginAsync } from 'fastify';
import {
  CreateUserPayloadSchema,
  UpdateUserPayloadSchema,
  UserUuidParamSchema,
} from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  createUser,
  listUsers,
  updateUserByUuid,
  LoginAlreadyExistsError,
} from '../services/users/users.js';
import {
  getUsersWithStats,
  getCampaignStatsForUser,
} from '../services/users/users_stats.js';

export const usersRoute: FastifyPluginAsync = async (app) => {

  // Создание пользователя администратором, с автоматическим созданием одного тега
  app.post('/users', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = CreateUserPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    try {
      const result = await createUser(parsed.data);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof LoginAlreadyExistsError) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // Список всех пользователей, доступен только администратору
  app.get('/users', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const items = await listUsers();
    return reply.send(items);
  });

  // Агрегированная статистика по каждому пользователю для страницы выбора юзера, доступна только администратору
  app.get('/users/stats', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const items = await getUsersWithStats();
    return reply.send(items);
  });

  // Агрегированная статистика по кампаниям текущего пользователя для user dashboard
  app.get('/user/campaigns', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const items = await getCampaignStatsForUser(request.authUser.id);
    return reply.send(items);
  });

  // Деактивация и/или смена пароля пользователя администратором
  app.patch('/users/:userUuid', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = UserUuidParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const parsedBody = UpdateUserPayloadSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    if (parsedBody.data.isActive === false && request.authUser?.uuid === parsedParams.data.userUuid) {
      return reply.status(409).send({ error: 'Cannot deactivate your own account' });
    }

    const updated = await updateUserByUuid(parsedParams.data.userUuid, parsedBody.data);
    if (!updated) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(updated);
  });
};