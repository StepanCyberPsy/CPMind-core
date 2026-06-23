import {
  pgTable,
  uuid,
  text,
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

export const impressions = pgTable('impressions', {
  id: uuid('id').primaryKey().defaultRandom(),
  impressionId: uuid('impression_id').notNull(),

  // Сегментация показа: группа сегментов одного показа при разрыве на простое
  sessionGroupId: uuid('session_group_id').notNull().defaultRandom(),
  segmentIndex: integer('segment_index').notNull().default(0),

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
  s7RawPersistence: real('s7_raw_persistence'),

  // Нормализованные значения
  s1Normalized: real('s1_normalized'),
  s2Normalized: real('s2_normalized'),
  s3Normalized: real('s3_normalized'),
  s4Normalized: real('s4_normalized'),
  s5Normalized: real('s5_normalized'),
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
  }));

export const weightConfigs = pgTable('weight_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  weights: jsonb('weights').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  isActiveIdx: index('idx_weight_configs_is_active').on(t.isActive),
}));

export type ImpressionInsert = typeof impressions.$inferInsert;
export type ImpressionSelect = typeof impressions.$inferSelect;
export type WeightConfigInsert = typeof weightConfigs.$inferInsert;
export type WeightConfigSelect = typeof weightConfigs.$inferSelect;