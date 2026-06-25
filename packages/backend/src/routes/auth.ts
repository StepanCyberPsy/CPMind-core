import { FastifyPluginAsync } from 'fastify';
import { LoginSchema } from '@cpmind/shared';
import type { MePayload } from '@cpmind/shared';
import { verifyCredentials, signToken } from '../services/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

const COOKIE_NAME = 'cpmind_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export const authRoute: FastifyPluginAsync = async (app) => {

  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const user = await verifyCredentials(parsed.data.login, parsed.data.password);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = signToken({
      uuid: user.uuid,
      id: user.id,
      role: user.role,
    });

    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return reply.send({ ok: true });
  });

  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const response: MePayload = {
      uuid: request.authUser.uuid,
      login: request.authUser.login,
      role: request.authUser.role,
    };

    return reply.send(response);
  });
};