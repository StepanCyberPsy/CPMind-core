import { z } from 'zod';

// Внешний идентификатор версии констант тега, branded — не пересекается с другими uuid-типами
export const TagConstantsConfigIdSchema = z.string().uuid().brand<'TagConstantsConfigId'>();

export type TagConstantsConfigId = z.infer<typeof TagConstantsConfigIdSchema>;

// Полный набор калибруемых констант тега. Единственный источник истины для формы
// в UI, валидации на создании и для esbuild define при сборке конкретной версии
export const TagConstantsValuesSchema = z.object({
  PRESENCE_IDLE_TIMEOUT_MS: z.number().int().positive(),
  S1_VIEWPORT_THRESHOLDS: z.array(z.number().min(0).max(1)).min(1).max(10).refine(
    (thresholds) => thresholds.every((value, index) => index === 0 || value > thresholds[index - 1]!),
    {
      message: 'Thresholds must be strictly ascending',
    },
  ),
  S2_SAMPLE_INTERVAL_MS: z.number().int().positive(),
  SCROLL_ZONE_PX: z.number().int().positive(),
  PAUSE_THRESHOLD_MS: z.number().int().positive(),
  STREAK_WINDOW_MS: z.number().int().positive(),
  STREAK_MIN_EVENTS: z.number().int().positive(),
  STREAK_MIN_SPEED: z.number().positive(),
  READING_SPEED_MAX: z.number().positive(),
  READING_TIME_MIN: z.number().int().positive(),
  SWIPE_MIN_DISTANCE_PX: z.number().int().positive(),
  ENTROPY_ANGLE_THRESHOLD: z.number().positive().max(180),
  PROXIMITY_TRACK_ZONE_PX: z.number().int().positive(),
  PINCH_DELTA_MIN_PX: z.number().int().positive(),
  GESTURE_SCALE_DELTA_MIN: z.number().positive().max(1),
  TAP_MAX_OFFSET_PX: z.number().int().positive(),
  TAP_MAX_DURATION_MS: z.number().int().positive(),
  MOUSE_MOVE_DEDUP_PX: z.number().min(0),
  S7_SAMPLE_INTERVAL_MS: z.number().int().positive(),
});

export type TagConstantsValues = z.infer<typeof TagConstantsValuesSchema>;

// Причина, по которой деактивация версии запрещена
export const TagConstantsDeactivationBlockSchema = z.enum([
  'DEFAULT_VERSION',
  'PINNED_BY_PLACEMENTS',
]);

export type TagConstantsDeactivationBlock = z.infer<typeof TagConstantsDeactivationBlockSchema>;

// Контракт версии констант для API — полный набор значений плюс метаданные сборки.
// scriptPath — путь, который нужно вписать в <script src> на странице клиента.
// isDefault — версия для плейсментов без закреплённой версии, pinnedPlacementsCount —
// число плейсментов с закреплённой версией, deactivationBlockedReason — готовое для UI
// объяснение запрета деактивации (null — деактивация разрешена или версия уже неактивна)
export const TagConstantsConfigSchema = z.object({
  id: TagConstantsConfigIdSchema,
  version: z.string(),
  constants: TagConstantsValuesSchema,
  description: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  pinnedPlacementsCount: z.number().int().min(0),
  deactivationBlockedReason: TagConstantsDeactivationBlockSchema.nullable(),
  scriptPath: z.string(),
  fileSizeBytes: z.number().int().min(0),
  createdAt: z.string(),
});

export type TagConstantsConfig = z.infer<typeof TagConstantsConfigSchema>;

export const TagConstantsConfigListResponseSchema = z.array(TagConstantsConfigSchema);

export type TagConstantsConfigListResponse = z.infer<typeof TagConstantsConfigListResponseSchema>;

// Создание новой версии. version присваивается сервисом через Postgres sequence,
// не принимается от клиента. Сами значения констант после создания неизменяемы —
// единственная последующая операция над версией — переключение isActive
export const CreateTagConstantsPayloadSchema = z.object({
  constants: TagConstantsValuesSchema,
  description: z.string().max(500).optional(),
});

export type CreateTagConstantsPayload = z.infer<typeof CreateTagConstantsPayloadSchema>;

export const TagConstantsConfigIdParamSchema = z.object({
  configId: TagConstantsConfigIdSchema,
});

export type TagConstantsConfigIdParam = z.infer<typeof TagConstantsConfigIdParamSchema>;

// Дефолтные значения — то, что действовало в коде тега до введения версионирования.
// Используется backend-bootstrap'ом для создания v0 и CLI-сборкой тега для локальной
// разработки (packages/backend/src/services/bootstrap.ts, packages/tag/build.ts) —
// единственный источник истины, чтобы не дублировать 19 значений в нескольких местах
export const DEFAULT_TAG_CONSTANTS: TagConstantsValues = {
  PRESENCE_IDLE_TIMEOUT_MS: 60_000,
  S1_VIEWPORT_THRESHOLDS: [0, 0.75, 1.0],
  S2_SAMPLE_INTERVAL_MS: 500,
  SCROLL_ZONE_PX: 300,
  PAUSE_THRESHOLD_MS: 500,
  STREAK_WINDOW_MS: 2000,
  STREAK_MIN_EVENTS: 3,
  STREAK_MIN_SPEED: 300,
  READING_SPEED_MAX: 150,
  READING_TIME_MIN: 2000,
  SWIPE_MIN_DISTANCE_PX: 60,
  ENTROPY_ANGLE_THRESHOLD: 30,
  PROXIMITY_TRACK_ZONE_PX: 300,
  PINCH_DELTA_MIN_PX: 10,
  GESTURE_SCALE_DELTA_MIN: 0.15,
  TAP_MAX_OFFSET_PX: 10,
  TAP_MAX_DURATION_MS: 300,
  MOUSE_MOVE_DEDUP_PX: 1,
  S7_SAMPLE_INTERVAL_MS: 1000,
};

// Матрица поддерживаемых браузеров для сборки тега. Не калибруется через UI — это
// решение о технической поддержке, не сигнальный порог. Общий источник для CLI
// (packages/tag/build.ts) и runtime-сборки внутри backend (services/tag_builder.ts)
export const TAG_BUILD_TARGETS = [
  'chrome90',
  'firefox90',
  'safari14',
  'edge90'
] as const;