import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import { ImpressionPayloadSchema } from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { processImpression } from '../services/scoring.js';
import { getActiveWeightsConfig } from '../services/weights_config.js';
import { resolveActiveTagOwner } from '../services/tags.js';
import { resolveActiveTagConstantsVersion } from '../services/tag_constants.js';
import {
  listImpressionsForAdmin,
  listImpressionsForUser,
  getImpressionForAdmin,
} from '../services/impressions.js';
import { buildCsvResponse } from '../services/csv.js';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';

const ImpressionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum(['createdAt', 'scoreFinal']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  sessionGroupId: z.string().uuid().optional(),
  campaignId: z.string().min(1).optional(),
  creativeId: z.string().min(1).optional(),
  deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  isSuspicious: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  dateFrom: z.string().datetime({ offset: true }).optional().transform(v => v ? new Date(v) : undefined),
  dateTo: z.string().datetime({ offset: true }).optional().transform(v => v ? new Date(v) : undefined),
});

export const impressionsRoute: FastifyPluginAsync = async (app) => {

  // POST /api/collect
  app.post('/collect', async (request, reply) => {
    const parsed = ImpressionPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      request.log.error({ errors: parsed.error.flatten() }, 'Validation failed');
      return reply.status(422).send({ errors: parsed.error.flatten() });
    }

    const owner = await resolveActiveTagOwner(parsed.data.tag_uuid);

    if (!owner) {
      request.log.warn(
        { tagUuid: parsed.data.tag_uuid, code: 'UNKNOWN_TAG' },
        'Rejected impression — unknown or inactive tag',
      );
      return reply.status(422).send({ error: 'Unknown or inactive tag' });
    }

    const constantsVersionResolution = await resolveActiveTagConstantsVersion(
      parsed.data.tag_constants_version,
    );

    if (!constantsVersionResolution) {
      request.log.warn(
        { tagConstantsVersion: parsed.data.tag_constants_version, code: 'UNKNOWN_TAG_CONSTANTS_VERSION' },
        'Rejected impression — unknown or inactive tag constants version',
      );
      return reply.status(422).send({ error: 'Unknown or inactive tag constants version' });
    }

    request.log.info(
      { impressionId: parsed.data.impression_id },
      'Impression received',
    );

    const config = await getActiveWeightsConfig();
    const record = processImpression(parsed.data, config, owner, constantsVersionResolution.presenceIdleThresholdMs);

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

  // GET /api/impressions — admin видит все, user только свои с урезанным набором полей
  app.get('/impressions', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parsed = ImpressionListQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(422).send({ errors: parsed.error.flatten() });
    }

    const {
      page,
      limit,
      sortBy,
      sortDir,
      sessionGroupId,
      campaignId,
      creativeId,
      deviceType,
      isSuspicious,
      dateFrom,
      dateTo
    } = parsed.data;
    const listParams = {
      page,
      limit,
      sortBy,
      sortDir,
      ...(sessionGroupId !== undefined && { sessionGroupId }),
      ...(campaignId !== undefined && { campaignId }),
      ...(creativeId !== undefined && { creativeId }),
      ...(deviceType !== undefined && { deviceType }),
      ...(isSuspicious !== undefined && { isSuspicious }),
      ...(dateFrom !== undefined && { dateFrom }),
      ...(dateTo !== undefined && { dateTo }),
    };

    const result = request.authUser.role === 'admin'
      ? await listImpressionsForAdmin(listParams)
      : await listImpressionsForUser(listParams, request.authUser.id);

    return reply.send(result);
  });

  // GET /api/impressions/export/csv — фильтрация полей по роли внутри buildCsvResponse
  app.get('/impressions/export/csv', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const query = request.query as Record<string, string>;
    await buildCsvResponse(query, reply, request.authUser);
  });

  // GET /api/impressions/:id — детальный вид только для администратора
  app.get('/impressions/:id', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await getImpressionForAdmin(id);

    if (!record) {
      return reply.status(404).send({ error: 'Impression not found' });
    }

    return reply.send(record);
  });
};