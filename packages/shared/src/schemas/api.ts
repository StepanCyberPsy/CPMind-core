import { z } from 'zod';
import { TagUuidSchema } from './tag.js';
import { UserUuidSchema } from './user.js';
import { IvtVerdictSchema } from './ivt.js';

// Список импрессенов
export const ImpressionRowSchema = z.object({
  id: z.string().uuid(),
  impression_id: z.string().uuid(),
  session_group_id: z.string().uuid(),
  segment_index: z.number().int().min(0),
  tag_uuid: TagUuidSchema,
  tag_label: z.string().nullable(),
  user_uuid: UserUuidSchema,
  user_login: z.string(),
  tag_constants_version: z.string().nullable(),
  campaign_id: z.string(),
  creative_id: z.string(),

  // Отображаемые названия из справочников. null для показов legacy-тега:
  // ссылок на кампанию и креатив у них нет, в панели показывается ключ
  campaign_name: z.string().nullable(),
  creative_name: z.string().nullable(),

  creative_type: z.string(),

  // Таксономия размещения и порядковый номер показа ролика.
  // null для показов legacy-тега
  format: z.string().nullable(),
  subtype: z.string().nullable(),
  video_show_index: z.number().int().nullable(),

  // Версия рантайма, собравшего показ. null для показов legacy-тега
  sdk_runtime_version: z.string().nullable(),

  device_type: z.string(),
  skippable: z.boolean(),
  publisher_domain: z.string(),
  timestamp_start: z.number(),
  timestamp_end: z.number(),
  created_at: z.string(),

  s1_raw_time_in_view: z.number().nullable(), // time_in_view_sec
  s2_raw_share_of_screen: z.number().nullable(), // share_of_screen_avg_pct
  s3_raw_scroll_speed: z.number().nullable(), // scroll_speed_avg_px_s
  s4_raw_active_time_pct: z.number().nullable(), // tab_active/tab_total * 100
  s5_raw_top_event: z.string(), // label: "clicked" | "zoom/swipe" | ...
  s6_raw_completion_rate: z.number().nullable(), // completion_rate_pct (null для баннеров)
  s6_audible_time_sec: z.number().nullable(), // viewability_persistence_pct
  s6_duration_sec: z.number().nullable(),
  s6_skippable: z.boolean().nullable(),
  s7_raw_persistence: z.number().nullable(),

  s1_normalized: z.number().nullable(),
  s2_normalized: z.number().nullable(),
  s3_normalized: z.number().nullable(),
  s4_normalized: z.number().nullable(),
  s5_normalized: z.number().nullable(),
  s6_normalized: z.number().nullable(),
  s7_normalized: z.number().nullable(),
  f_presence: z.number().int(),
  score_final: z.number(),
  weights_version: z.string(),
  s1_model_version: z.string().nullable(),
  s3_model_version: z.string().nullable(),
  s4_model_version: z.string().nullable(),
  s5_model_version: z.string().nullable(),
  s6_model_version: z.string().nullable(),
  s7_model_version: z.string().nullable(),

  no_events: z.boolean(),
  tab_mostly_hidden: z.boolean(),
  anomaly_duration: z.boolean(),
  is_suspicious: z.boolean(),

  ivt_verdict: IvtVerdictSchema,
  ivt_category: z.string().nullable(),
  ivt_confidence: z.number().min(0).max(1),
  score_reliable: z.boolean(),
});

export const ImpressionDetailSchema = ImpressionRowSchema.extend({
  signals_raw: z.unknown(),
  signals_normalized: z.unknown(),
  ivt_signals: z.unknown(),
  lastRecalibratedAt: z.string().optional(),
  lastRecalibratedWeightsVersion: z.string().optional(),
});

export const ImpressionListResponseSchema = z.object({
  items: z.array(ImpressionRowSchema),
  total: z.number().int(),
  pages: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export type ImpressionRow = z.infer<typeof ImpressionRowSchema>;
export type ImpressionDetail = z.infer<typeof ImpressionDetailSchema>;
export type ImpressionListResponse = z.infer<typeof ImpressionListResponseSchema>;

// Агрегат по publisher_domain для сводной строки режима площадки
export const PublisherDomainAggregateSchema = z.object({
  impressions_count: z.number().int(),
  campaigns_count: z.number().int(),
  avg_score: z.number().nullable(),
  avg_s1: z.number().nullable(),
  avg_s2: z.number().nullable(),
  avg_s3: z.number().nullable(),
  avg_s4: z.number().nullable(),
  avg_s5: z.number().nullable(),
  avg_s6: z.number().nullable(),
  avg_s7: z.number().nullable(),
});

export type PublisherDomainAggregate = z.infer<typeof PublisherDomainAggregateSchema>;

// Конфигурация весов
export const WeightConfigRowSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  configType: z.enum(['banner', 'video']),
  weights: z.object({
    s1: z.number(),
    s2: z.number(),
    s3: z.number(),
    s4: z.number(),
    s5: z.number(),
    s6: z.number(),
    s7: z.number(),
  }),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type WeightConfigRow = z.infer<typeof WeightConfigRowSchema>;