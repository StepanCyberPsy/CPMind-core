import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';
import {
  ImpressionPayloadSchema,
  UserUuidSchema,
  isInstreamFormat,
  isSelfMountedFormat,
  resolveS6SegmentKeys,
  type CreativeCategory,
  type PlacementFormat
} from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  processImpression,
  buildCheckpointUpdateSet,
} from '../services/scoring.js';
import { getActiveWeightsConfig } from '../services/configs/weights_config.js';
import { getActiveWeibullParams } from '../services/configs/weibull_config.js';
import { getActiveS2Params } from '../services/configs/s2_config.js';
import { getActiveS3LogisticParams } from '../services/configs/logistic_config.js';
import { getActiveS4Config } from '../services/configs/s4_config.js';
import { getActiveS5LogisticParams } from '../services/configs/s5_logistic_config.js';
import { getActiveS6LogisticParams } from '../services/configs/s6_logistic_config.js';
import { getActiveS7Thresholds } from '../services/configs/s7_quantile_config.js';
import { getActiveIvtList } from '../services/ivt/ivt_list.js';
import { getActiveIvtThresholds } from '../services/ivt/ivt_thresholds.js';
import { resolveActiveTagOwner } from '../services/tag/tags.js';
import { resolveTagConstantsVersion } from '../services/tag/tag_constants.js';
import { resolveImpressionContext } from '../services/delivery/impression_context.js';
import {
  listImpressionsForAdmin,
  listImpressionsForUser,
  getImpressionForAdmin,
  getPublisherDomainAggregate,
  resolveTargetUserId,
  type RangeFieldKey,
  type RangeValue,
} from '../services/impressions.js';
import { buildCsvResponse } from '../services/csv.js';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';

function resolveVideoWeightsCategory(
  format: PlacementFormat | null,
): CreativeCategory {
  if (format === null) return 'video';
  if (isInstreamFormat(format)) return 'video_instream';
  if (isSelfMountedFormat(format)) return 'video_outstream';
  return 'video';
}

const ImpressionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum([
    'createdAt',
    'scoreFinal',
    's1Normalized',
    's2Normalized',
    's3Normalized',
    's4Normalized',
    's5Normalized',
    's6Normalized',
    's7Normalized',
  ]).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  sessionGroupId: z.string().uuid().optional(),
  campaignId: z.string().min(1).optional(),
  campaignUuid: z.string().uuid().optional(),
  creativeId: z.string().min(1).optional(),
  creativeType: z.enum([
    'banner_static',
    'banner_gif',
    'banner_html5',
    'video_creative',
  ]).optional(),
  format: z.enum([
    'banner',
    'instream',
    'outstream',
  ]).optional(),
  subtype: z.enum([
    'preroll',
    'midroll',
    'postroll',
    'pauseroll',
    'inpage',
    'sticky',
  ]).optional(),
  publisherDomain: z.string().min(1).optional(),
  deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  isSuspicious: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  dateFrom: z.string().datetime({ offset: true }).optional().transform(v => v ? new Date(v) : undefined),
  dateTo: z.string().datetime({ offset: true }).optional().transform(v => v ? new Date(v) : undefined),
  userUuid: UserUuidSchema.optional(),
  tagConstantsVersion: z.string().min(1).optional(),
  weightsVersion: z.string().min(1).optional(),
  ivtVerdict: z.enum(['valid', 'givt', 'sivt_suspected', 'sivt_confirmed']).optional(),
  scoreMin: z.coerce.number().optional(),
  scoreMax: z.coerce.number().optional(),
  s1Min: z.coerce.number().optional(),
  s1Max: z.coerce.number().optional(),
  s2Min: z.coerce.number().optional(),
  s2Max: z.coerce.number().optional(),
  s3Min: z.coerce.number().optional(),
  s3Max: z.coerce.number().optional(),
  s4Min: z.coerce.number().optional(),
  s4Max: z.coerce.number().optional(),
  s5Min: z.coerce.number().optional(),
  s5Max: z.coerce.number().optional(),
  s6Min: z.coerce.number().optional(),
  s6Max: z.coerce.number().optional(),
  s7Min: z.coerce.number().optional(),
  s7Max: z.coerce.number().optional(),
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

    const contextResolution = await resolveImpressionContext(parsed.data, owner.userId);

    if (contextResolution.kind === 'rejected') {
      request.log.warn(
        {
          impressionId: parsed.data.impression_id,
          adSessionId: parsed.data.ad_session_id,
          code: contextResolution.reason,
        },
        'Rejected impression — invalid delivery context',
      );
      return reply.status(422).send({
        error: 'Invalid delivery context',
        code: contextResolution.reason,
      });
    }

    const deliveryContext = contextResolution.kind === 'hosted'
      ? contextResolution.context
      : null;

    if (deliveryContext !== null && deliveryContext.contextViolations.length > 0) {
      request.log.warn(
        {
          impressionId: parsed.data.impression_id,
          adSessionId: deliveryContext.adSessionId,
          violations: deliveryContext.contextViolations,
        },
        'Impression accepted with delivery context violations',
      );
    }

    // Версия констант hosted-показа — выданная сессии: показы идущих сессий принимаются
    // в пределах окна приёма и после деактивации версии
    const tagConstantsVersion = deliveryContext?.tagConstantsVersion ?? parsed.data.tag_constants_version;
    const allowInactiveConstants = deliveryContext !== null && deliveryContext.tagConstantsVersion !== null;

    const constantsVersionResolution = await resolveTagConstantsVersion(
      tagConstantsVersion,
      allowInactiveConstants,
    );

    if (!constantsVersionResolution) {
      request.log.warn(
        { tagConstantsVersion, code: 'UNKNOWN_TAG_CONSTANTS_VERSION' },
        'Rejected impression — unknown or inactive tag constants version',
      );
      return reply.status(422).send({ error: 'Unknown or inactive tag constants version' });
    }

    if (!constantsVersionResolution.isActive) {
      request.log.info(
        {
          impressionId: parsed.data.impression_id,
          adSessionId: deliveryContext?.adSessionId,
          tagConstantsVersion,
        },
        'Impression accepted for deactivated tag constants version within ad session window',
      );
    }

    request.log.info(
      { impressionId: parsed.data.impression_id },
      'Impression received',
    );

    const creativeType = deliveryContext?.creativeType ?? parsed.data.creative_type;
    const skippable = deliveryContext?.skippable ?? parsed.data.skippable;

    const creativeCategory: CreativeCategory =
      creativeType === 'video_creative'
        ? resolveVideoWeightsCategory(deliveryContext?.format ?? null)
        : 'banner';

    const creativeGroup =
      creativeType === 'banner_gif' || creativeType === 'banner_html5'
        ? 'animated'
        : creativeType === 'video_creative'
          ? 'video'
          : 'static';

    const segmentKey = `${parsed.data.device_type}|${creativeGroup}`;
    const s3CreativeGroup = creativeType === 'video_creative' ? 'video' : 'static';
    const s3SegmentKey = `${parsed.data.device_type}|${s3CreativeGroup}`;

    const s4Device = parsed.data.device_type === 'tablet' ? 'mobile' : parsed.data.device_type;
    const s4Creative = creativeType === 'video_creative' ? 'video' : 'banner';
    const s4Segment = `${s4Device}_${s4Creative}`;
    const s5Segment = parsed.data.device_type === 'desktop' ? 'desktop' : 'mobile_tablet';
    const s6SegmentKeys = creativeType === 'video_creative'
      ? resolveS6SegmentKeys(
        parsed.data.device_type,
        deliveryContext?.format ?? null,
        deliveryContext?.subtype ?? null,
        skippable,
      )
      : null;

    const [
      config,
      weibullResolution,
      s2Resolution,
      logisticResolution,
      s4Resolution,
      s5Resolution,
      s6Resolution,
      s7Resolution,
      ivtList,
      ivtThresholds,
    ] = await Promise.all([
      getActiveWeightsConfig(creativeCategory),
      getActiveWeibullParams(segmentKey),
      getActiveS2Params(segmentKey),
      getActiveS3LogisticParams(s3SegmentKey, tagConstantsVersion),
      getActiveS4Config(s4Segment),
      getActiveS5LogisticParams(s5Segment, tagConstantsVersion),
      getActiveS6LogisticParams(s6SegmentKeys, tagConstantsVersion),
      getActiveS7Thresholds(parsed.data.device_type),
      getActiveIvtList(),
      getActiveIvtThresholds(),
    ]);

    const userAgent = request.headers['user-agent'] ?? '';
    const record = processImpression(
      parsed.data,
      config,
      weibullResolution.params,
      weibullResolution.modelVersion,
      s2Resolution.params,
      s2Resolution.modelVersion,
      logisticResolution.params,
      logisticResolution.modelVersion,
      s4Resolution.config,
      s4Resolution.modelVersion,
      s5Resolution.params,
      s5Resolution.modelVersion,
      s6Resolution.params,
      s6Resolution.modelVersion,
      s7Resolution.thresholds,
      s7Resolution.modelVersion,
      owner,
      constantsVersionResolution.presenceIdleThresholdMs,
      ivtList,
      ivtThresholds,
      userAgent,
      deliveryContext,
    );

    // Промежуточный снимок перезаписывается только более свежим снимком того же
    // владельца и той же ad_session. Финальная запись неизменяема
    try {
      await db.insert(impressions)
        .values(record)
        .onConflictDoUpdate({
          target: impressions.impressionId,
          set: buildCheckpointUpdateSet(record),
          setWhere: sql`${impressions.isCheckpoint} = true
            AND ${impressions.tagId} = ${record.tagId}
            AND ${impressions.adSessionId} IS NOT DISTINCT FROM ${record.adSessionId}
            AND ${impressions.timestampEnd} <= ${record.timestampEnd}`,
        });
    } catch (err) {
      request.log.error(
        { err, payload: parsed.data },
        'DB write failed — payload logged for recovery',
      );
      return reply.status(503).send({ error: 'Impression storage unavailable' });
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
      campaignUuid,
      creativeId,
      creativeType,
      format,
      subtype,
      publisherDomain,
      deviceType,
      isSuspicious,
      dateFrom,
      dateTo,
      userUuid,
      tagConstantsVersion,
      weightsVersion,
      ivtVerdict,
      scoreMin,
      scoreMax,
      s1Min,
      s1Max,
      s2Min,
      s2Max,
      s3Min,
      s3Max,
      s4Min,
      s4Max,
      s5Min,
      s5Max,
      s6Min,
      s6Max,
      s7Min,
      s7Max,
    } = parsed.data;

    const ranges: Partial<Record<RangeFieldKey, RangeValue>> = {};
    const setRange = (key: RangeFieldKey, min: number | undefined, max: number | undefined): void => {
      if (min === undefined && max === undefined) return;
      ranges[key] = { ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
    };
    setRange('score', scoreMin, scoreMax);
    setRange('s1', s1Min, s1Max);
    setRange('s2', s2Min, s2Max);
    setRange('s3', s3Min, s3Max);
    setRange('s4', s4Min, s4Max);
    setRange('s5', s5Min, s5Max);
    setRange('s6', s6Min, s6Max);
    setRange('s7', s7Min, s7Max);

    const listParams = {
      page, limit, sortBy, sortDir,
      ...(sessionGroupId !== undefined && { sessionGroupId }),
      ...(campaignId !== undefined && { campaignId }),
      ...(campaignUuid !== undefined && { campaignUuid }),
      ...(creativeId !== undefined && { creativeId }),
      ...(creativeType !== undefined && { creativeType }),
      ...(format !== undefined && { format }),
      ...(subtype !== undefined && { subtype }),
      ...(publisherDomain !== undefined && { publisherDomain }),
      ...(deviceType !== undefined && { deviceType }),
      ...(isSuspicious !== undefined && { isSuspicious }),
      ...(dateFrom !== undefined && { dateFrom }),
      ...(dateTo !== undefined && { dateTo }),
      ...(tagConstantsVersion !== undefined && { tagConstantsVersion }),
      ...(weightsVersion !== undefined && { weightsVersion }),
      ...(ivtVerdict !== undefined && { ivtVerdict }),
      ...(Object.keys(ranges).length > 0 && { ranges }),
    };

    if (request.authUser.role !== 'admin') {
      const result = await listImpressionsForUser(listParams, request.authUser.id);
      return reply.send(result);
    }

    if (userUuid === undefined) {
      const result = await listImpressionsForAdmin(listParams);
      return reply.send(result);
    }

    const targetUserId = await resolveTargetUserId(userUuid);

    if (targetUserId === null) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const result = await listImpressionsForAdmin(listParams, targetUserId);
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

  // GET /api/impressions/domain_aggregate
  app.get('/impressions/domain_aggregate', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const schema = z.object({
      creativeId: z.string().min(1),
      publisherDomain: z.string().min(1).optional(),
      userUuid: UserUuidSchema.optional(),
    });

    const parsed = schema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(422).send({ errors: parsed.error.flatten() });
    }

    const { creativeId, publisherDomain, userUuid } = parsed.data;

    if (request.authUser.role !== 'admin') {
      const result = await getPublisherDomainAggregate(
        creativeId,
        publisherDomain,
        request.authUser.id,
      );
      return reply.send(result);
    }

    if (userUuid === undefined) {
      const result = await getPublisherDomainAggregate(creativeId, publisherDomain);
      return reply.send(result);
    }

    const targetUserId = await resolveTargetUserId(userUuid);

    if (targetUserId === null) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const result = await getPublisherDomainAggregate(creativeId, publisherDomain, targetUserId);
    return reply.send(result);
  });
};