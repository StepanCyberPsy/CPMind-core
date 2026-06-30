import { z } from 'zod';

// Внешний идентификатор батча калибровки, branded — не пересекается с CalibrationItemId
export const CalibrationBatchIdSchema = z.string().uuid().brand<'CalibrationBatchId'>();

export type CalibrationBatchId = z.infer<typeof CalibrationBatchIdSchema>;

// Внешний идентификатор элемента батча (один импрешен внутри батча), branded
export const CalibrationItemIdSchema = z.string().uuid().brand<'CalibrationItemId'>();

export type CalibrationItemId = z.infer<typeof CalibrationItemIdSchema>;

export const CalibrationBatchStatusSchema = z.enum([
  'processing',
  'ready',
  'expired',
  'failed',
  'discarded'
]);

export type CalibrationBatchStatus = z.infer<typeof CalibrationBatchStatusSchema>;

export const CalibrationItemStatusSchema = z.enum(['pending', 'approved']);

export type CalibrationItemStatus = z.infer<typeof CalibrationItemStatusSchema>;

const MAX_SELECTION_SIZE = 5000;

// Выбор конкретных импрешенов по PK (impressions.id), один или несколько
const IdsSelectionSchema = z.object({
  mode: z.literal('ids'),
  impressionIds: z.array(z.string().uuid()).min(1).max(MAX_SELECTION_SIZE),
});

// Выбор по сегментам показа (session_group_id), один или несколько целиком
const SessionGroupsSelectionSchema = z.object({
  mode: z.literal('session_groups'),
  sessionGroupIds: z.array(z.string().uuid()).min(1).max(MAX_SELECTION_SIZE),
});

// Те же фильтры, что уже используются в GET /api/impressions, без userUuid
// Калибровка всегда неявно скоупится на собственные данные вызывающего админа на уровне сервиса, не принимает целевого пользователя из payload вообще
// Пустой объект фильтров означает "выбрать все свои"
const CalibrationFilterSchema = z.object({
  sessionGroupId: z.string().uuid().optional(),
  campaignId: z.string().min(1).optional(),
  creativeId: z.string().min(1).optional(),
  tagConstantsVersion: z.string().min(1).optional(),
  weightsVersion: z.string().min(1).optional(),
  deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  isSuspicious: z.boolean().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  s1Min: z.number().optional(),
  s1Max: z.number().optional(),
  s2Min: z.number().optional(),
  s2Max: z.number().optional(),
  s3Min: z.number().optional(),
  s3Max: z.number().optional(),
  s4Min: z.number().optional(),
  s4Max: z.number().optional(),
  s5Min: z.number().optional(),
  s5Max: z.number().optional(),
  s7Min: z.number().optional(),
  s7Max: z.number().optional(),
});

export type CalibrationFilters = z.infer<typeof CalibrationFilterSchema>;

const FilterSelectionSchema = z.object({
  mode: z.literal('filter'),
  filters: CalibrationFilterSchema,
});

// Дискриминированный union вместо пяти отдельных эндпоинтов — один контракт покрывает все варианты выбора из плана
export const CalibrationSelectionSchema = z.discriminatedUnion('mode', [
  IdsSelectionSchema,
  SessionGroupsSelectionSchema,
  FilterSelectionSchema,
]);

export type CalibrationSelection = z.infer<typeof CalibrationSelectionSchema>;

// Создание батча — целевая версия весов плюс выбор. Не валидируем существование targetWeightsConfigId на уровне Zod, это ответственность сервиса (нужен поход в БД)
export const CreateCalibrationPayloadSchema = z.object({
  targetWeightsConfigId: z.string().uuid(),
  selection: CalibrationSelectionSchema,
});

export type CreateCalibrationPayload = z.infer<typeof CreateCalibrationPayloadSchema>;

// Контракт батча для списка и для опроса статуса
export const CalibrationBatchSchema = z.object({
  id: CalibrationBatchIdSchema,
  targetWeightsConfigId: z.string().uuid(),
  targetWeightsVersion: z.string(),
  selection: CalibrationSelectionSchema,
  status: CalibrationBatchStatusSchema,
  totalItems: z.number().int().min(0),
  pendingItems: z.number().int().min(0),
  approvedItems: z.number().int().min(0),
  createdByLogin: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  // Момент автоматической отмены черновика (createdAt + TTL cleanup-job'а). null
  // Если батч не в статусе ready — расчет TTL для него не имеет смысла
  expiresAt: z.string().nullable(),
});

export type CalibrationBatch = z.infer<typeof CalibrationBatchSchema>;

export const CalibrationBatchListResponseSchema = z.array(CalibrationBatchSchema);

export type CalibrationBatchListResponse = z.infer<typeof CalibrationBatchListResponseSchema>;

// Контракт одного элемента батча — превью "было/будет" для конкретного импрешена
export const CalibrationItemSchema = z.object({
  id: CalibrationItemIdSchema,
  impressionId: z.string().uuid(),
  campaignId: z.string(),
  creativeId: z.string(),
  deviceType: z.string(),
  // Нормализованные значения (0-100)
  // Статичный контекст, веса их не меняют, только score
  // Единая шкала удобнее для построчного сравнения, чем разнородные raw-единицы
  s1Normalized: z.number().nullable(),
  s2Normalized: z.number().nullable(),
  s3Normalized: z.number().nullable(),
  s4Normalized: z.number().nullable(),
  s5Normalized: z.number().nullable(),
  s7Normalized: z.number().nullable(),
  previousScoreFinal: z.number(),
  previousWeightsVersion: z.string(),
  newScoreFinal: z.number(),
  newWeightsVersion: z.string(),
  status: CalibrationItemStatusSchema,
  approvedAt: z.string().nullable(),
});

export type CalibrationItem = z.infer<typeof CalibrationItemSchema>;

export const CalibrationItemListResponseSchema = z.object({
  items: z.array(CalibrationItemSchema),
  total: z.number().int(),
  pages: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export type CalibrationItemListResponse = z.infer<typeof CalibrationItemListResponseSchema>;

// Подтверждение батча целиком или выборочно. Отсутствие itemIds означает "все pending-элементы батча"
export const ApproveCalibrationItemsPayloadSchema = z.object({
  itemIds: z.array(CalibrationItemIdSchema).optional(),
});

export type ApproveCalibrationItemsPayload = z.infer<typeof ApproveCalibrationItemsPayloadSchema>;

// Результат массового подтверждения — раздельно успешные и конфликтные (score изменился с момента создания черновика)
export const ApproveCalibrationResultSchema = z.object({
  approved: z.array(CalibrationItemIdSchema),
  conflicted: z.array(CalibrationItemIdSchema),
});

export type ApproveCalibrationResult = z.infer<typeof ApproveCalibrationResultSchema>;

export const CalibrationBatchIdParamSchema = z.object({
  batchId: CalibrationBatchIdSchema,
});

export type CalibrationBatchIdParam = z.infer<typeof CalibrationBatchIdParamSchema>;

export const CalibrationItemIdParamSchema = z.object({
  batchId: CalibrationBatchIdSchema,
  itemId: CalibrationItemIdSchema,
});

export type CalibrationItemIdParam = z.infer<typeof CalibrationItemIdParamSchema>;