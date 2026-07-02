import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigserial,
  bigint,
  jsonb,
  real,
  smallint,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  uuid: uuid('uuid').notNull().defaultRandom(),

  // Учетные данные
  login: text('login').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('user'),

  // Деактивация вместо удаления
  isActive: boolean('is_active').notNull().default(true),

  // Системное
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uuidIdx: uniqueIndex('uidx_users_uuid').on(t.uuid),
  loginIdx: uniqueIndex('uidx_users_login').on(t.login),
  roleIdx: index('idx_users_role').on(t.role),
}));

export const tags = pgTable('tags', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  uuid: uuid('uuid').notNull().defaultRandom(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),

  // Произвольное название для администратора, пользователю не показывается
  label: text('label'),

  // Деактивация тега независимо от деактивации пользователя
  isActive: boolean('is_active').notNull().default(true),

  // Системное
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uuidIdx: uniqueIndex('uidx_tags_uuid').on(t.uuid),
  userIdIdx: index('idx_tags_user_id').on(t.userId),
}));

export const impressions = pgTable('impressions', {
  id: uuid('id').primaryKey().defaultRandom(),
  impressionId: uuid('impression_id').notNull(),

  // Сегментация показа: группа сегментов одного показа при разрыве на простое
  sessionGroupId: uuid('session_group_id').notNull().defaultRandom(),
  segmentIndex: integer('segment_index').notNull().default(0),

  // Владелец показа
  tagId: bigint('tag_id', { mode: 'number' }).notNull().references(() => tags.id),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),

  // Версия констант тега, собравшего показ. Nullable навсегда для исторических данных,
  // собранных до введения версионирования — обязательна только для новых payload на уровне Zod
  tagConstantsVersion: text('tag_constants_version').references(() => tagConstantsConfigs.version),

  // Метаданные кампании
  campaignId: text('campaign_id').notNull(),
  creativeId: text('creative_id').notNull(),
  creativeType: text('creative_type').notNull(),
  deviceType: text('device_type').notNull(),
  timestampStart: bigint('timestamp_start', { mode: 'number' }).notNull(),
  timestampEnd: bigint('timestamp_end', { mode: 'number' }).notNull(),

  // Хранилище сигналов
  signalsRaw: jsonb('signals_raw').notNull(),
  signalsNormalized: jsonb('signals_normalized').notNull(),

  // Raw-поля для таблицы панели
  s1RawTimeInView: real('s1_raw_time_in_view'),
  s2RawShareOfScreen: real('s2_raw_share_of_screen'),
  s3RawScrollSpeed: real('s3_raw_scroll_speed'),
  s4RawActiveTimePct: real('s4_raw_active_time_pct'),
  s5RawTopEvent: text('s5_raw_top_event').notNull(),
  s6RawCompletionRate: real('s6_raw_completion_rate'),
  s7RawPersistence: real('s7_raw_persistence'),

  // Нормализованные значения
  s1Normalized: real('s1_normalized'),
  s2Normalized: real('s2_normalized'),
  s3Normalized: real('s3_normalized'),
  s4Normalized: real('s4_normalized'),
  s5Normalized: real('s5_normalized'),
  s6Normalized: real('s6_normalized'),
  s7Normalized: real('s7_normalized'),

  // Score
  fPresence: smallint('f_presence').notNull(),
  scoreFinal: real('score_final').notNull(),
  weightsVersion: text('weights_version').notNull().default('v1.0_uncalibrated'),

  // Флаги подозрительности
  noEvents: boolean('no_events').notNull().default(false),
  tabMostlyHidden: boolean('tab_mostly_hidden').notNull().default(false),
  anomalyDuration: boolean('anomaly_duration').notNull().default(false),
  isSuspicious: boolean('is_suspicious').notNull().default(false),

  // Системное
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
  (t) => ({
    impressionIdIdx: uniqueIndex('uidx_impression_id').on(t.impressionId),
    sessionGroupIdIdx: index('idx_session_group_id').on(t.sessionGroupId),
    createdAtIdx: index('idx_created_at').on(t.createdAt),
    campaignIdIdx: index('idx_campaign_id').on(t.campaignId),
    creativeIdIdx: index('idx_creative_id').on(t.creativeId),
    deviceTypeIdx: index('idx_device_type').on(t.deviceType),
    isSuspiciousIdx: index('idx_is_suspicious').on(t.isSuspicious),
    scoreFinalIdx: index('idx_score_final').on(t.scoreFinal),
    s6NormalizedIdx: index('idx_impressions_s6_normalized').on(t.s6Normalized),
    tagIdIdx: index('idx_impressions_tag_id').on(t.tagId),
    userIdIdx: index('idx_impressions_user_id').on(t.userId),
    userIdCreatedAtIdx: index('idx_impressions_user_id_created_at').on(t.userId, t.createdAt),
    tagConstantsVersionIdx: index('idx_impressions_tag_constants_version').on(t.tagConstantsVersion),
  }));

// Версии констант тега неизменяемы после создания. isActive управляет распространением
// (наличием физического файла) и приемом данных в /api/collect — не обновлением содержимого
export const tagConstantsConfigs = pgTable('tag_constants_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  constants: jsonb('constants').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),

  // Путь к собранному файлу и его размер — null когда файл физически отсутствует
  // (только что создана и еще не собрана, либо деактивирована и удалена с диска)
  scriptPath: text('script_path'),
  fileSizeBytes: integer('file_size_bytes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  isActiveIdx: index('idx_tag_constants_configs_is_active').on(t.isActive),
}));

export const weightConfigs = pgTable('weight_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  configType: text('config_type').notNull().default('banner'),
  weights: jsonb('weights').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  isActiveIdx: index('idx_weight_configs_is_active').on(t.isActive),
  activeTypeUniqueIdx: uniqueIndex('uidx_weight_configs_active_type')
    .on(t.configType)
    .where(sql`${t.isActive} = true`),
}));

export const calibrationBatchStatusEnum = pgEnum('calibration_batch_status', ['processing', 'ready', 'expired', 'failed', 'discarded']);
export const calibrationItemStatusEnum = pgEnum('calibration_item_status', ['pending', 'approved']);

export const calibrationBatches = pgTable('calibration_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetWeightsConfigId: uuid('target_weights_config_id').notNull().references(() => weightConfigs.id),

  // Снимок критериев выбора — для аудита "что выбрал админ"
  selection: jsonb('selection').notNull(),

  status: calibrationBatchStatusEnum('status').notNull().default('processing'),
  createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => users.id),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  statusCreatedAtIdx: index('idx_calibration_batches_status_created_at').on(t.status, t.createdAt),
  createdByIdx: index('idx_calibration_batches_created_by').on(t.createdBy),
}));

export const calibrationItems = pgTable('calibration_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => calibrationBatches.id),

  // onDelete cascade — аудит конкретного показа не может пережить сам показ при retention-удалении
  impressionId: uuid('impression_id').notNull().references(() => impressions.id, { onDelete: 'cascade' }),

  // Снимок состояния на момент создания черновика — основа для обнаружения конфликта при подтверждении
  previousScoreFinal: real('previous_score_final').notNull(),
  previousWeightsVersion: text('previous_weights_version').notNull(),

  // Расчетное значение по целевым весам батча
  newScoreFinal: real('new_score_final').notNull(),
  newWeightsVersion: text('new_weights_version').notNull(),

  status: calibrationItemStatusEnum('status').notNull().default('pending'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
}, (t) => ({
  batchImpressionIdx: uniqueIndex('uidx_calibration_items_batch_impression').on(t.batchId, t.impressionId),
  batchStatusIdx: index('idx_calibration_items_batch_status').on(t.batchId, t.status),
  impressionIdIdx: index('idx_calibration_items_impression_id').on(t.impressionId),
}));

export type ImpressionInsert = typeof impressions.$inferInsert;
export type ImpressionSelect = typeof impressions.$inferSelect;
export type WeightConfigInsert = typeof weightConfigs.$inferInsert;
export type WeightConfigSelect = typeof weightConfigs.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type UserSelect = typeof users.$inferSelect;
export type TagInsert = typeof tags.$inferInsert;
export type TagSelect = typeof tags.$inferSelect;
export type CalibrationBatchInsert = typeof calibrationBatches.$inferInsert;
export type CalibrationBatchSelect = typeof calibrationBatches.$inferSelect;
export type CalibrationItemInsert = typeof calibrationItems.$inferInsert;
export type CalibrationItemSelect = typeof calibrationItems.$inferSelect;
export type TagConstantsConfigInsert = typeof tagConstantsConfigs.$inferInsert;
export type TagConstantsConfigSelect = typeof tagConstantsConfigs.$inferSelect;