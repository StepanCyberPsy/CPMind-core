import { FastifyPluginAsync } from 'fastify';
import { ImpressionPayloadSchema } from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { processImpression } from '../services/scoring.js';
import { getActiveWeightsConfig } from '../services/weights_config.js';
import { listImpressions, getImpression } from '../services/impressions.js';
import { buildCsvResponse } from '../services/csv.js';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';

export const impressionsRoute: FastifyPluginAsync = async (app) => {

  // POST /api/collect
  app.post('/collect', async (request, reply) => {
    const parsed = ImpressionPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      request.log.error({ errors: parsed.error.flatten() }, 'Validation failed');
      return reply.status(422).send({ errors: parsed.error.flatten() });
    }

    request.log.info(
      { impressionId: parsed.data.impression_id },
      'Impression received',
    );

    const config = await getActiveWeightsConfig();
    const record = processImpression(parsed.data, config);

    try {
      await db.insert(impressions)
        .values(record)
        .onConflictDoNothing({ target: impressions.impressionId });
    } catch (err) {
      request.log.error(
        { err, payload: parsed.data },
        'DB write failed — payload logged for recovery',
      );
    }

    return reply.status(202).send({ ok: true });
  });

  // GET /api/impressions
  app.get('/impressions', { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as Record<string, string>;

    const params = {
      page: Math.max(1, Number(query['page'] ?? 1)),
      limit: Math.min(200, Math.max(1, Number(query['limit'] ?? 50))),
      sortBy: (query['sortBy'] as 'createdAt' | 'scoreFinal') ?? 'createdAt',
      sortDir: (query['sortDir'] as 'asc' | 'desc') ?? 'desc',
      ...(query['campaignId'] !== undefined && { campaignId: query['campaignId'] }),
      ...(query['creativeId'] !== undefined && { creativeId: query['creativeId'] }),
      ...(query['deviceType'] !== undefined && { deviceType: query['deviceType'] }),
      ...(query['isSuspicious'] !== undefined && {
        isSuspicious: query['isSuspicious'] === 'true',
      }),
      ...(query['dateFrom'] !== undefined && { dateFrom: new Date(query['dateFrom']) }),
      ...(query['dateTo'] !== undefined && { dateTo: new Date(query['dateTo']) }),
    };

    const result = await listImpressions(params);
    return reply.send(result);
  });

  // GET /api/impressions/export/csv
  app.get('/impressions/export/csv', { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    await buildCsvResponse(query, reply);
  });

  // GET /api/impressions/:id
  app.get('/impressions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await getImpression(id);

    if (!record) {
      return reply.status(404).send({ error: 'Impression not found' });
    }

    return reply.send(record);
  });
};