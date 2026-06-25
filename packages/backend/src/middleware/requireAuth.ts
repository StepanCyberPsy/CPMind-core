import { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../services/auth.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import type { UserUuid, UserRole } from '@cpmind/shared';

export interface AuthenticatedRequestUser {
  uuid: UserUuid;
  id: number;
  role: UserRole;
  login: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedRequestUser;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies['cpmind_token'];

  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' });
    return;
  }

  const [user] = await db
    .select({ isActive: users.isActive, login: users.login })
    .from(users)
    .where(eq(users.id, payload.id))
    .limit(1);

  if (!user || !user.isActive) {
    reply.status(401).send({ error: 'Invalid or expired token' });
    return;
  }

  request.authUser = {
    uuid: payload.uuid,
    id: payload.id,
    role: payload.role,
    login: user.login,
  };
}