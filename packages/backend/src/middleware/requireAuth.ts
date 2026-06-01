import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../services/auth.js';

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies['cpmind_token'];

  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  try {
    verifyToken(token);
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' });
  }
}