import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import {
  CreateCalibrationPayloadSchema,
  CalibrationBatchIdParamSchema,
  CalibrationItemIdParamSchema,
  ApproveCalibrationItemsPayloadSchema,
} from '@cpmind/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  createCalibrationBatch,
  getCalibrationBatch,
  listCalibrationBatches,
  listCalibrationBatchItems,
  getCalibrationBatchItem,
  approveCalibrationItems,
  discardCalibrationBatch,
} from '../services/calibration/calibrations.js';

const CalibrationItemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const calibrationsRoute: FastifyPluginAsync = async (app) => {

  // POST /api/calibrations — создание батча, фоновая обработка запускается асинхронно
  app.post('/calibrations', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parsed = CreateCalibrationPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ errors: parsed.error.flatten() });
    }

    const batchId = await createCalibrationBatch(parsed.data, request.authUser.id);
    return reply.status(202).send({ batchId });
  });

  // GET /api/calibrations — список всех батчей
  app.get('/calibrations', { preHandler: [requireAuth, requireAdmin] }, async (_request, reply) => {
    const items = await listCalibrationBatches();
    return reply.send(items);
  });

  // GET /api/calibrations/:batchId — статус и прогресс батча, для опроса фронтендом
  app.get('/calibrations/:batchId', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = CalibrationBatchIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const batch = await getCalibrationBatch(parsedParams.data.batchId);
    if (!batch) {
      return reply.status(404).send({ error: 'Calibration batch not found' });
    }

    return reply.send(batch);
  });

  // GET /api/calibrations/:batchId/items — постраничный превью-список "было/будет"
  app.get('/calibrations/:batchId/items', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = CalibrationBatchIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const parsedQuery = CalibrationItemListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(422).send({ errors: parsedQuery.error.flatten() });
    }

    const batch = await getCalibrationBatch(parsedParams.data.batchId);
    if (!batch) {
      return reply.status(404).send({ error: 'Calibration batch not found' });
    }

    const { page, limit } = parsedQuery.data;
    const result = await listCalibrationBatchItems(parsedParams.data.batchId, page, limit);
    return reply.send(result);
  });

  // GET /api/calibrations/:batchId/items/:itemId — детальный вид одного элемента
  app.get('/calibrations/:batchId/items/:itemId', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = CalibrationItemIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const item = await getCalibrationBatchItem(parsedParams.data.batchId, parsedParams.data.itemId);
    if (!item) {
      return reply.status(404).send({ error: 'Calibration item not found' });
    }

    return reply.send(item);
  });

  // POST /api/calibrations/:batchId/items/:itemId/approve — подтверждение одного элемента
  app.post('/calibrations/:batchId/items/:itemId/approve', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = CalibrationItemIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const { batchId, itemId } = parsedParams.data;

    const existing = await getCalibrationBatchItem(batchId, itemId);
    if (!existing) {
      return reply.status(404).send({ error: 'Calibration item not found' });
    }

    if (existing.status !== 'pending') {
      return reply.status(409).send({ error: 'Calibration item is not pending' });
    }

    const result = await approveCalibrationItems(batchId, [itemId]);

    if (result.conflicted.includes(itemId)) {
      return reply.status(409).send({
        error: 'Impression score changed since the draft was created — recalibrate to get a fresh preview',
      });
    }

    const updated = await getCalibrationBatchItem(batchId, itemId);
    return reply.send(updated);
  });

  // POST /api/calibrations/:batchId/approve — массовое подтверждение, itemIds опущен = все pending в батче
  app.post('/calibrations/:batchId/approve', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = CalibrationBatchIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const parsedBody = ApproveCalibrationItemsPayloadSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.status(422).send({ errors: parsedBody.error.flatten() });
    }

    const result = await approveCalibrationItems(parsedParams.data.batchId, parsedBody.data.itemIds);
    return reply.send(result);
  });

  // DELETE /api/calibrations/:batchId — отмена батча, approved-элементы сохраняются как аудит
  app.delete('/calibrations/:batchId', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsedParams = CalibrationBatchIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    await discardCalibrationBatch(parsedParams.data.batchId);
    return reply.status(200).send({ ok: true });
  });
};