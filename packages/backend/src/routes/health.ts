import { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply) => {
    let dbStatus: 'ok' | 'error' = 'error';

    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'ok';
    } catch {
      // db unreachable
    }

    const status = dbStatus === 'ok' ? 200 : 503;
    return reply.status(status).send({
      ok: dbStatus === 'ok',
      db: dbStatus,
      ts: new Date().toISOString(),
    });
  });
};