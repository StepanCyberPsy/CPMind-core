import { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.authUser) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  if (request.authUser.role !== 'admin') {
    reply.status(403).send({ error: 'Forbidden' });
    return;
  }
}