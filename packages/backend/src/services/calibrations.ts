import { eq, and, inArray, desc, sql, type SQL } from 'drizzle-orm';
import pino from 'pino';
import { recomputeScoreFromNormalized } from '@cpmind/shared';
import type {
  CalibrationBatchId,
  CalibrationItemId,
  CalibrationSelection,
  CreateCalibrationPayload,
  CalibrationBatch,
  CalibrationBatchStatus,
  CalibrationItem,
  CalibrationItemListResponse,
  ApproveCalibrationResult,
  NormalizedSignals,
  WeightsValues,
} from '@cpmind/shared';
import { db } from '../db/index.js';
import {
  calibrationBatches,
  calibrationItems,
  impressions,
  weightConfigs,
  users,
} from '../db/schema.js';
import { buildWhereFromFilters, type ListFilters } from './impressions.js';

const logger = pino({ name: 'calibrations-service' });

const PROCESSING_BATCH_SIZE = 500;

export class CalibrationServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CalibrationServiceError';
  }
}

interface BatchAggregateRow {
  id: string;
  targetWeightsConfigId: string;
  targetWeightsVersion: string;
  selection: unknown;
  status: CalibrationBatchStatus;
  createdByLogin: string;
  createdAt: Date;
  completedAt: Date | null;
  pendingItems: number;
  approvedItems: number;
}

const BATCH_AGGREGATE_COLUMNS = {
  id: calibrationBatches.id,
  targetWeightsConfigId: calibrationBatches.targetWeightsConfigId,
  targetWeightsVersion: weightConfigs.version,
  selection: calibrationBatches.selection,
  status: calibrationBatches.status,
  createdByLogin: users.login,
  createdAt: calibrationBatches.createdAt,
  completedAt: calibrationBatches.completedAt,
  pendingItems: sql<number>`count(${calibrationItems.id}) filter (where ${calibrationItems.status} = 'pending')::int`,
  approvedItems: sql<number>`count(${calibrationItems.id}) filter (where ${calibrationItems.status} = 'approved')::int`,
};

const BATCH_GROUP_BY_COLUMNS = [
  calibrationBatches.id,
  calibrationBatches.targetWeightsConfigId,
  weightConfigs.version,
  calibrationBatches.selection,
  calibrationBatches.status,
  users.login,
  calibrationBatches.createdAt,
  calibrationBatches.completedAt,
];

function toApiBatch(row: BatchAggregateRow): CalibrationBatch {
  return {
    id: row.id as CalibrationBatchId,
    targetWeightsConfigId: row.targetWeightsConfigId,
    targetWeightsVersion: row.targetWeightsVersion,
    selection: row.selection as CalibrationSelection,
    status: row.status,
    totalItems: row.pendingItems + row.approvedItems,
    pendingItems: row.pendingItems,
    approvedItems: row.approvedItems,
    createdByLogin: row.createdByLogin,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

interface ItemRow {
  id: string;
  impressionId: string;
  campaignId: string;
  creativeId: string;
  previousScoreFinal: number;
  previousWeightsVersion: string;
  newScoreFinal: number;
  newWeightsVersion: string;
  status: 'pending' | 'approved';
  approvedAt: Date | null;
}

function toApiItem(row: ItemRow): CalibrationItem {
  return {
    id: row.id as CalibrationItemId,
    impressionId: row.impressionId,
    campaignId: row.campaignId,
    creativeId: row.creativeId,
    previousScoreFinal: row.previousScoreFinal,
    previousWeightsVersion: row.previousWeightsVersion,
    newScoreFinal: row.newScoreFinal,
    newWeightsVersion: row.newWeightsVersion,
    status: row.status,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}

// Резолв выбора батча в SQL-условие. Режимы ids/session_groups — прямой IN, режим filter переиспользует buildWhereFromFilters из services/impressions.ts (тот же контракт, что и у GET /api/impressions), плюс собственный userUuid -> impressions.userId
async function resolveSelectionWhere(selection: CalibrationSelection): Promise<SQL | undefined> {
  if (selection.mode === 'ids') {
    return inArray(impressions.id, selection.impressionIds);
  }

  if (selection.mode === 'session_groups') {
    return inArray(impressions.sessionGroupId, selection.sessionGroupIds);
  }

  const { userUuid, dateFrom, dateTo, ...rest } = selection.filters;

  const listFilters: ListFilters = {
    ...(rest.sessionGroupId !== undefined && { sessionGroupId: rest.sessionGroupId }),
    ...(rest.campaignId !== undefined && { campaignId: rest.campaignId }),
    ...(rest.creativeId !== undefined && { creativeId: rest.creativeId }),
    ...(rest.deviceType !== undefined && { deviceType: rest.deviceType }),
    ...(rest.isSuspicious !== undefined && { isSuspicious: rest.isSuspicious }),
    ...(dateFrom !== undefined && { dateFrom: new Date(dateFrom) }),
    ...(dateTo !== undefined && { dateTo: new Date(dateTo) }),
  };

  const baseWhere = buildWhereFromFilters(listFilters);

  if (userUuid === undefined) return baseWhere;

  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.uuid, userUuid))
    .limit(1);

  if (!targetUser) {
    return and(baseWhere, sql`false`);
  }

  return and(baseWhere, eq(impressions.userId, targetUser.id));
}

// Фоновая обработка батча: проходит выборку чанками, для каждой строки пересчитывает
// score на целевых весах через recomputeScoreFromNormalized (нормализация и presence
// не пересчитываются — они не зависят от весов), создает черновик calibration_items.
// Не вызывается напрямую снаружи файла — запускается из createCalibrationBatch без await
async function processCalibrationBatch(
  batchId: CalibrationBatchId,
  selection: CalibrationSelection,
  weights: WeightsValues,
): Promise<void> {
  try {
    const where = await resolveSelectionWhere(selection);
    let offset = 0;

    while (true) {
      const rows = await db
        .select({
          id: impressions.id,
          signalsNormalized: impressions.signalsNormalized,
          fPresence: impressions.fPresence,
          scoreFinal: impressions.scoreFinal,
          weightsVersion: impressions.weightsVersion,
        })
        .from(impressions)
        .where(where)
        .orderBy(impressions.id)
        .limit(PROCESSING_BATCH_SIZE)
        .offset(offset);

      if (rows.length === 0) break;

      const draftItems = rows.map((row) => {
        const normalized = row.signalsNormalized as NormalizedSignals;
        const fPresence = row.fPresence as 0 | 1;
        const { score_final } = recomputeScoreFromNormalized(normalized, fPresence, weights);

        return {
          batchId,
          impressionId: row.id,
          previousScoreFinal: row.scoreFinal,
          previousWeightsVersion: row.weightsVersion,
          newScoreFinal: score_final,
          newWeightsVersion: weights.version,
          status: 'pending' as const,
        };
      });

      await db.insert(calibrationItems).values(draftItems);

      offset += PROCESSING_BATCH_SIZE;
      if (rows.length < PROCESSING_BATCH_SIZE) break;
    }

    await db
      .update(calibrationBatches)
      .set({ status: 'ready', completedAt: new Date() })
      .where(eq(calibrationBatches.id, batchId));
  } catch (err) {
    logger.error({ err, batchId }, 'Calibration batch processing failed');

    await db
      .update(calibrationBatches)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(calibrationBatches.id, batchId));
  }
}

// Создает батч калибровки и запускает фоновую обработку без ожидания (async без очереди).
// Возвращает id немедленно, не дожидаясь завершения расчета — статус опрашивается отдельно
export async function createCalibrationBatch(
  payload: CreateCalibrationPayload,
  adminUserId: number,
): Promise<CalibrationBatchId> {
  const [targetConfig] = await db
    .select({ id: weightConfigs.id, version: weightConfigs.version, weights: weightConfigs.weights })
    .from(weightConfigs)
    .where(eq(weightConfigs.id, payload.targetWeightsConfigId))
    .limit(1);

  if (!targetConfig) {
    throw new CalibrationServiceError(
      'Целевая версия весов не найдена',
      404,
      'WEIGHTS_CONFIG_NOT_FOUND',
    );
  }

  const [createdBatch] = await db
    .insert(calibrationBatches)
    .values({
      targetWeightsConfigId: targetConfig.id,
      selection: payload.selection,
      status: 'processing',
      createdBy: adminUserId,
    })
    .returning({ id: calibrationBatches.id });

  if (!createdBatch) {
    throw new Error('Failed to create calibration batch');
  }

  const batchId = createdBatch.id as CalibrationBatchId;
  const w = targetConfig.weights as Record<string, number>;

  const weightsValues: WeightsValues = {
    version: targetConfig.version,
    s1: w['s1']!,
    s2: w['s2']!,
    s3: w['s3']!,
    s4: w['s4']!,
    s5: w['s5']!,
    s7: w['s7']!,
  };

  void processCalibrationBatch(batchId, payload.selection, weightsValues);

  return batchId;
}

export async function getCalibrationBatch(batchId: CalibrationBatchId): Promise<CalibrationBatch | null> {
  const [row] = await db
    .select(BATCH_AGGREGATE_COLUMNS)
    .from(calibrationBatches)
    .innerJoin(weightConfigs, eq(calibrationBatches.targetWeightsConfigId, weightConfigs.id))
    .innerJoin(users, eq(calibrationBatches.createdBy, users.id))
    .leftJoin(calibrationItems, eq(calibrationItems.batchId, calibrationBatches.id))
    .where(eq(calibrationBatches.id, batchId))
    .groupBy(...BATCH_GROUP_BY_COLUMNS)
    .limit(1);

  if (!row) return null;

  return toApiBatch(row);
}

export async function listCalibrationBatches(): Promise<CalibrationBatch[]> {
  const rows = await db
    .select(BATCH_AGGREGATE_COLUMNS)
    .from(calibrationBatches)
    .innerJoin(weightConfigs, eq(calibrationBatches.targetWeightsConfigId, weightConfigs.id))
    .innerJoin(users, eq(calibrationBatches.createdBy, users.id))
    .leftJoin(calibrationItems, eq(calibrationItems.batchId, calibrationBatches.id))
    .groupBy(...BATCH_GROUP_BY_COLUMNS)
    .orderBy(desc(calibrationBatches.createdAt));

  return rows.map(toApiBatch);
}

export async function listCalibrationBatchItems(
  batchId: CalibrationBatchId,
  page: number,
  limit: number,
): Promise<CalibrationItemListResponse> {
  const offset = (page - 1) * limit;

  const [rows, [countResult]] = await Promise.all([
    db.select({
      id: calibrationItems.id,
      impressionId: calibrationItems.impressionId,
      campaignId: impressions.campaignId,
      creativeId: impressions.creativeId,
      previousScoreFinal: calibrationItems.previousScoreFinal,
      previousWeightsVersion: calibrationItems.previousWeightsVersion,
      newScoreFinal: calibrationItems.newScoreFinal,
      newWeightsVersion: calibrationItems.newWeightsVersion,
      status: calibrationItems.status,
      approvedAt: calibrationItems.approvedAt,
    })
      .from(calibrationItems)
      .innerJoin(impressions, eq(calibrationItems.impressionId, impressions.id))
      .where(eq(calibrationItems.batchId, batchId))
      .orderBy(calibrationItems.id)
      .limit(limit)
      .offset(offset),

    db.select({ total: sql<number>`count(*)::int` })
      .from(calibrationItems)
      .where(eq(calibrationItems.batchId, batchId)),
  ]);

  const total = countResult?.total ?? 0;
  const pages = limit > 0 ? Math.ceil(total / limit) : 0;
  const items = rows.map(toApiItem);

  return { items, total, pages, page, limit };
}

export async function getCalibrationBatchItem(
  batchId: CalibrationBatchId,
  itemId: CalibrationItemId,
): Promise<CalibrationItem | null> {
  const [row] = await db
    .select({
      id: calibrationItems.id,
      impressionId: calibrationItems.impressionId,
      campaignId: impressions.campaignId,
      creativeId: impressions.creativeId,
      previousScoreFinal: calibrationItems.previousScoreFinal,
      previousWeightsVersion: calibrationItems.previousWeightsVersion,
      newScoreFinal: calibrationItems.newScoreFinal,
      newWeightsVersion: calibrationItems.newWeightsVersion,
      status: calibrationItems.status,
      approvedAt: calibrationItems.approvedAt,
    })
    .from(calibrationItems)
    .innerJoin(impressions, eq(calibrationItems.impressionId, impressions.id))
    .where(and(
      eq(calibrationItems.batchId, batchId),
      eq(calibrationItems.id, itemId),
    ))
    .limit(1);

  if (!row) return null;

  return toApiItem(row);
}

// Подтверждение элементов батча целиком или выборочно (itemIds undefined = все pending).
// Каждый элемент обрабатывается в собственной транзакции: UPDATE impressions только если
// текущий score_final все еще равен previousScoreFinal, зафиксированному при создании
// черновика — это и есть защита от перезаписи, если кто-то другим путем изменил данные
export async function approveCalibrationItems(
  batchId: CalibrationBatchId,
  itemIds: CalibrationItemId[] | undefined,
): Promise<ApproveCalibrationResult> {
  const [batch] = await db
    .select({ status: calibrationBatches.status })
    .from(calibrationBatches)
    .where(eq(calibrationBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw new CalibrationServiceError(
      'Батч калибровки не найден',
      404,
      'CALIBRATION_BATCH_NOT_FOUND',
    );
  }

  if (batch.status !== 'ready') {
    throw new CalibrationServiceError(
      'Подтверждение доступно только для батча в статусе ready',
      409,
      'CALIBRATION_BATCH_NOT_READY',
    );
  }

  const targetItems = await db
    .select({
      id: calibrationItems.id,
      impressionId: calibrationItems.impressionId,
      previousScoreFinal: calibrationItems.previousScoreFinal,
      newScoreFinal: calibrationItems.newScoreFinal,
      newWeightsVersion: calibrationItems.newWeightsVersion,
    })
    .from(calibrationItems)
    .where(and(
      eq(calibrationItems.batchId, batchId),
      eq(calibrationItems.status, 'pending'),
      itemIds !== undefined ? inArray(calibrationItems.id, itemIds) : undefined,
    ));

  const approved: CalibrationItemId[] = [];
  const conflicted: CalibrationItemId[] = [];

  for (const item of targetItems) {
    const applied = await db.transaction(async (tx) => {
      const updated = await tx
        .update(impressions)
        .set({
          scoreFinal: item.newScoreFinal,
          weightsVersion: item.newWeightsVersion,
        })
        .where(and(
          eq(impressions.id, item.impressionId),
          eq(impressions.scoreFinal, item.previousScoreFinal),
        ))
        .returning({ id: impressions.id });

      if (updated.length === 0) return false;

      await tx
        .update(calibrationItems)
        .set({ status: 'approved', approvedAt: new Date() })
        .where(eq(calibrationItems.id, item.id));

      return true;
    });

    if (applied) {
      approved.push(item.id as CalibrationItemId);
    } else {
      conflicted.push(item.id as CalibrationItemId);
    }
  }

  return { approved, conflicted };
}

// Отмена батча: удаляет только pending-элементы, approved остаются навсегда как аудит.
// Сама строка батча никогда не удаляется — только переводится в статус discarded
export async function discardCalibrationBatch(batchId: CalibrationBatchId): Promise<void> {
  const [batch] = await db
    .select({ status: calibrationBatches.status })
    .from(calibrationBatches)
    .where(eq(calibrationBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw new CalibrationServiceError(
      'Батч калибровки не найден',
      404,
      'CALIBRATION_BATCH_NOT_FOUND',
    );
  }

  if (batch.status !== 'ready') {
    throw new CalibrationServiceError(
      'Отмена доступна только для батча в статусе ready',
      409,
      'CALIBRATION_BATCH_NOT_READY',
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(calibrationItems)
      .where(and(
        eq(calibrationItems.batchId, batchId),
        eq(calibrationItems.status, 'pending'),
      ));

    await tx
      .update(calibrationBatches)
      .set({ status: 'discarded', completedAt: new Date() })
      .where(eq(calibrationBatches.id, batchId));
  });
}