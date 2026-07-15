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
  publisherDomain: text('publisher_domain'),
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
  weightsVersion: text('weights_version').notNull(),
  s1ModelVersion: text('s1_model_version'),
  s3ModelVersion: text('s3_model_version'),
  s4ModelVersion: text('s4_model_version'),
  s5ModelVersion: text('s5_model_version'),
  s6ModelVersion: text('s6_model_version'),
  s6CompletionRatePct: real('s6_completion_rate_pct'),
  s6AudibleTimeSec: real('s6_audible_time_sec'),
  s6DurationSec: real('s6_duration_sec'),
  s6Skippable: boolean('s6_skippable'),
  s7ModelVersion: text('s7_model_version'),

  // Флаги подозрительности
  noEvents: boolean('no_events').notNull().default(false),
  tabMostlyHidden: boolean('tab_mostly_hidden').notNull().default(false),
  anomalyDuration: boolean('anomaly_duration').notNull().default(false),
  isSuspicious: boolean('is_suspicious').notNull().default(false),

  // IVT
  ivtVerdict: text('ivt_verdict').notNull().default('valid'),
  ivtCategory: text('ivt_category'),
  ivtConfidence: real('ivt_confidence').notNull().default(0),
  scoreReliable: boolean('score_reliable').notNull().default(true),
  fpHash: text('fp_hash'),
  ivtSignals: jsonb('ivt_signals'),

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
    ivtVerdictIdx: index('idx_impressions_ivt_verdict').on(t.ivtVerdict),
    fpHashIdx: index('idx_impressions_fp_hash').on(t.fpHash),
    publisherDomainIdx: index('idx_impressions_publisher_domain').on(t.publisherDomain),
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

export const ivtListConfigs = pgTable('ivt_list_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  entries: jsonb('entries').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(false),
  entriesCount: integer('entries_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  isActiveIdx: uniqueIndex('uidx_ivt_list_active')
    .on(t.isActive)
    .where(sql`${t.isActive} = true`),
}));

export const ivtThresholdsConfigs = pgTable('ivt_thresholds_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  thresholds: jsonb('thresholds').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  isActiveIdx: uniqueIndex('uidx_ivt_thresholds_active')
    .on(t.isActive)
    .where(sql`${t.isActive} = true`),
}));

export const s1WeibullConfigs = pgTable('s1_weibull_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  segmentKey: text('segment_key').notNull(),
  k: real('k').notNull(),
  lambda: real('lambda').notNull(),
  sampleSize: integer('sample_size').notNull(),
  fittedAt: timestamp('fitted_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').notNull().default(false),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
}, (t) => ({
  activeSegmentIdx: uniqueIndex('uidx_s1_weibull_active_segment')
    .on(t.segmentKey)
    .where(sql`${t.isActive} = true`),
  deletionScheduledAtIdx: index('idx_s1_weibull_deletion_scheduled_at').on(t.deletionScheduledAt),
}));

export const s3LogisticConfigs = pgTable('s3_logistic_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  segmentKey: text('segment_key').notNull(),
  tagConstantsVersion: text('tag_constants_version').notNull(),
  coefficients: jsonb('coefficients').notNull(),
  featureMeans: jsonb('feature_means').notNull(),
  featureStds: jsonb('feature_stds').notNull(),
  sampleSize: integer('sample_size').notNull(),
  accuracy: real('accuracy'),
  fittedAt: timestamp('fitted_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').notNull().default(false),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
}, (t) => ({
  activeSegmentIdx: uniqueIndex('uidx_s3_logistic_active_segment')
    .on(t.segmentKey)
    .where(sql`${t.isActive} = true`),
  deletionScheduledAtIdx: index('idx_s3_logistic_deletion_scheduled_at').on(t.deletionScheduledAt),
}));

export const s4Configs = pgTable('s4_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  segmentKey: text('segment_key').notNull(),
  version: text('version').notNull(),
  lambda: real('lambda').notNull(),
  tRefMs: integer('t_ref_ms').notNull(),
  sampleSize: integer('sample_size'),
  isActive: boolean('is_active').notNull().default(false),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
  fittedAt: timestamp('fitted_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  activeSegmentIdx: uniqueIndex('uidx_s4_configs_active_segment')
    .on(t.segmentKey)
    .where(sql`${t.isActive} = true`),
  deletionScheduledAtIdx: index('idx_s4_configs_deletion_scheduled_at').on(t.deletionScheduledAt),
}));

export const s5LogisticConfigs = pgTable('s5_logistic_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  segmentKey: text('segment_key').notNull(),
  tagConstantsVersion: text('tag_constants_version').notNull(),
  coefficients: jsonb('coefficients').notNull(),
  sampleSize: integer('sample_size').notNull(),
  accuracy: real('accuracy'),
  fittedAt: timestamp('fitted_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').notNull().default(false),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
}, (t) => ({
  activeSegmentIdx: uniqueIndex('uidx_s5_logistic_active_segment')
    .on(t.segmentKey)
    .where(sql`${t.isActive} = true`),
  deletionScheduledAtIdx: index('idx_s5_logistic_deletion_scheduled_at').on(t.deletionScheduledAt),
}));

export const s6LogisticConfigs = pgTable('s6_logistic_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  segmentKey: text('segment_key').notNull(),
  tagConstantsVersion: text('tag_constants_version').notNull(),
  coefficients: jsonb('coefficients').notNull(),
  featureMeans: jsonb('feature_means').notNull(),
  featureStds: jsonb('feature_stds').notNull(),
  sampleSize: integer('sample_size').notNull(),
  accuracy: real('accuracy'),
  fittedAt: timestamp('fitted_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').notNull().default(false),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
}, (t) => ({
  activeSegmentIdx: uniqueIndex('uidx_s6_logistic_active_segment')
    .on(t.segmentKey)
    .where(sql`${t.isActive} = true`),
  deletionScheduledAtIdx: index('idx_s6_logistic_deletion_scheduled_at').on(t.deletionScheduledAt),
}));

export const s7QuantileConfigs = pgTable('s7_quantile_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceType: text('device_type').notNull(),
  relativeYLow: real('relative_y_low').notNull(),
  relativeYMid: real('relative_y_mid').notNull(),
  clutterMid: real('clutter_mid').notNull(),
  clutterHigh: real('clutter_high').notNull(),
  sampleSize: integer('sample_size').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').notNull().default(false),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
}, (t) => ({
  activeDeviceIdx: uniqueIndex('uidx_s7_quantile_active_device')
    .on(t.deviceType)
    .where(sql`${t.isActive} = true`),
  deletionScheduledAtIdx: index('idx_s7_quantile_deletion_scheduled_at').on(t.deletionScheduledAt),
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
export type IvtListConfigInsert = typeof ivtListConfigs.$inferInsert;
export type IvtListConfigSelect = typeof ivtListConfigs.$inferSelect;
export type IvtThresholdsConfigInsert = typeof ivtThresholdsConfigs.$inferInsert;
export type IvtThresholdsConfigSelect = typeof ivtThresholdsConfigs.$inferSelect;
export type S1WeibullConfigInsert = typeof s1WeibullConfigs.$inferInsert;
export type S1WeibullConfigSelect = typeof s1WeibullConfigs.$inferSelect;
export type S3LogisticConfigInsert = typeof s3LogisticConfigs.$inferInsert;
export type S3LogisticConfigSelect = typeof s3LogisticConfigs.$inferSelect;
export type S4ConfigInsert = typeof s4Configs.$inferInsert;
export type S4ConfigSelect = typeof s4Configs.$inferSelect;
export type S5LogisticConfigInsert = typeof s5LogisticConfigs.$inferInsert;
export type S5LogisticConfigSelect = typeof s5LogisticConfigs.$inferSelect;
export type S6LogisticConfigInsert = typeof s6LogisticConfigs.$inferInsert;
export type S6LogisticConfigSelect = typeof s6LogisticConfigs.$inferSelect;
export type S7QuantileConfigInsert = typeof s7QuantileConfigs.$inferInsert;
export type S7QuantileConfigSelect = typeof s7QuantileConfigs.$inferSelect;