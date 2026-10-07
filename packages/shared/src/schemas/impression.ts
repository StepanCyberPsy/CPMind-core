import { z } from 'zod';
import { TagUuidSchema } from './tag.js';
import { CreativeTypeSchema } from './creative.js';
import { AudioConnectionSchema } from './asset.js';
import {
  AdSessionIdSchema,
  DeliveryModeSchema,
  MeasurementModeSchema,
  MeasurementFinalizationReasonSchema,
  DeliveryTimingSchema,
} from './delivery.js';

const SAFE_ID_REGEX = /^[A-Za-zА-Яа-яЁё0-9_-]+$/u;
const FP_HASH_REGEX = /^[0-9a-f]+$/;

// S1 Time-in-View
export const SignalsS1Schema = z.object({
  time_in_view_sec: z.number().min(0),
  mrc_compliant: z.boolean(),
  visible_pixels_pct: z.number().int().min(0).max(100),
  max_continuous_view_sec: z.number().min(0),
});

// S2 Share of Screen
export const SignalsS2Schema = z.object({
  share_of_screen_avg_pct: z.number().min(0).max(100),
  share_of_screen_max_pct: z.number().min(0).max(100),
});

// S3 Scroll Velocity
export const SignalsS3Schema = z.object({
  scroll_speed_avg_px_s: z.number().min(0).nullable(),
  scroll_speed_max_px_s: z.number().min(0).nullable(),
  scroll_speed_std_dev: z.number().min(0).nullable(),
  pause_count: z.number().min(0).nullable(),
  pause_duration_total_ms: z.number().min(0).nullable(),
  scroll_streaks: z.number().min(0).nullable(),
  direction_changes: z.number().min(0).nullable(),
  reading_pattern_detected: z.boolean().nullable(),
  is_momentum_scroll: z.boolean().nullable(),
  scroll_quiet_max_ms: z.number().min(0).nullable().optional(),
}).nullable();

// S4 Tab Activity
export const VisibilityStateEntrySchema = z.object({
  state: z.enum(['visible', 'hidden']),
  timestamp: z.number().positive(),
});

export const SignalsS4Schema = z.object({
  tab_active_time_ms: z.number().min(0),
  tab_total_time_ms: z.number().min(0),
  tab_switches_count: z.number().min(0),
  visibility_state_history: z.array(VisibilityStateEntrySchema).max(2000),
  tab_absent_max_ms: z.number().min(0).optional(),
  window_unfocused_max_ms: z.number().min(0).optional(),
  surface_absent_max_ms: z.number().min(0).nullable().optional(),
});

// S5 Interaction Events
export const SignalsS5Schema = z.object({
  clicked: z.boolean(),

  // Desktop
  hover_count: z.number().min(0).nullable(),
  hover_duration_max_ms: z.number().min(0).nullable(),
  hover_duration_total_ms: z.number().min(0).nullable(),
  hover_to_click_latency_ms: z.number().min(0).nullable(),
  cursor_proximity_min_px: z.number().min(0).nullable(),
  cursor_trajectory_entropy: z.number().min(0).max(1).nullable(),

  // Mobile
  tap_count: z.number().min(0).nullable(),
  touch_start_end_delta_ms: z.number().min(0).nullable(),
  zoom: z.boolean().nullable(),
  swipe_count: z.number().min(0).nullable(),

  // Диагностика HTML5: события моста креатива, не подтверждённые хостом. В Score не участвует
  unconfirmed_frame_events: z.number().int().min(0).optional(),

  // Поведение курсора в зоне кнопки пропуска после её появления — условие метки
  // обучения in-stream. Доля времени в зоне сама по себе ожидание пропуска не доказывает:
  // зритель, не трогающий мышь, даёт ту же долю. Второе поле отделяет его от того,
  // кто держал курсор на кнопке и больше никуда не двигал
  skip_zone_hover_ratio: z.number().min(0).max(1).nullable().optional(),
  skip_zone_moved_outside: z.boolean().nullable().optional(),
});

// S7 Page Context + Position + Clutter
export const SignalsS7Schema = z.object({
  creative_position_y_px: z.number().min(0),
  page_height_total_px: z.number().min(1),
  is_above_the_fold: z.boolean(),
  competing_ads_visible: z.number().min(0),
  viewability_persistence_pct: z.number().min(0).max(100),
});

// S6 Video Engagement + Audibility
export const SignalsS6Schema = z.object({
  // Video Engagement
  play_initiated: z.boolean(),
  quartile_25: z.boolean(),
  quartile_50: z.boolean(),
  quartile_75: z.boolean(),
  completion: z.boolean(),
  completion_rate_pct: z.number().min(0).max(100).nullable(),
  pause_initiated: z.boolean(),
  skipped: z.boolean(),
  replay_count: z.number().int().min(0),

  // Audibility
  muted_status: z.enum(['muted', 'unmuted', 'mixed']),
  volume_level: z.number().int().min(0).max(100),
  audio_connection: AudioConnectionSchema,
  audible_time_sec: z.number().min(0),
  duration_sec: z.number().min(0).nullable(),
  audible_quartile_25: z.boolean(),
  audible_quartile_50: z.boolean(),
  audible_quartile_75: z.boolean(),
  audible_quartile_100: z.boolean(),
  muted_throughout: z.boolean(),
  unmuted_by_user: z.boolean(),

  // Действия зрителя и фактическое состояние звука на старте. Optional — бандлы тега,
  // собранные до введения полей, их не отправляют
  muted_by_user: z.boolean().optional(),
  start_muted: z.boolean().optional(),

  // Закрытие поверхности зрителем — признак модели out-stream. У in-stream отказ
  // выражается пропуском, поэтому поле заполняет только плеер out-stream
  closed_by_user: z.boolean().optional(),
});

// F_Presence
export const PresenceSchema = z.object({
  last_user_event_timestamp: z.number().positive().nullable(),
  time_since_last_event_ms: z.number().min(0),
  events_count_during_impression: z.number().min(0),
  event_intervals_ms: z.array(z.number().int().min(0)).max(50).optional(),
});

export const ImpressionPayloadSchema = z
  .object({
    impression_id: z.string().uuid(),
    session_group_id: z.string().uuid().optional(),
    segment_index: z.number().int().min(0).optional(),
    tag_uuid: TagUuidSchema,
    tag_constants_version: z.string().min(1),
    campaign_id: z.string().min(1).max(255).regex(SAFE_ID_REGEX),
    creative_id: z.string().min(1).max(255).regex(SAFE_ID_REGEX),
    creative_type: CreativeTypeSchema,
    skippable: z.boolean().default(false),
    device_type: z.enum(['desktop', 'mobile', 'tablet']),
    publisher_domain: z.string().min(1).max(253),
    timestamp_start: z.number().positive(),
    timestamp_end: z.number().positive(),
    signals: z.object({
      s1: SignalsS1Schema,
      s2: SignalsS2Schema,
      s3: SignalsS3Schema,
      s4: SignalsS4Schema,
      s5: SignalsS5Schema,
      s6: SignalsS6Schema.nullable().optional(),
      s7: SignalsS7Schema,
    }),
    presence: PresenceSchema,
    fp_hash: z.string().length(32).regex(FP_HASH_REGEX).optional(),
    ad_session_id: AdSessionIdSchema.optional(),
    placement_uuid: z.string().uuid().optional(),
    creative_version_uuid: z.string().uuid().optional(),
    delivery_mode: DeliveryModeSchema.optional(),
    measurement_mode: MeasurementModeSchema.optional(),
    delivery_timing: DeliveryTimingSchema.optional(),
    finalization_reason: MeasurementFinalizationReasonSchema.optional(),

    // Промежуточный снимок сегмента — перезаписывается следующей отправкой того же impression_id
    checkpoint: z.boolean().optional(),
  })
  .refine(
    (data) => data.timestamp_end >= data.timestamp_start,
    {
      path: ['timestamp_end'],
      message: 'timestamp_end must be greater than or equal to timestamp_start',
    },
  );

export type ImpressionPayload = z.infer<typeof ImpressionPayloadSchema>;
export type SignalsS1 = z.infer<typeof SignalsS1Schema>;
export type SignalsS2 = z.infer<typeof SignalsS2Schema>;
export type SignalsS3 = z.infer<typeof SignalsS3Schema>;
export type SignalsS4 = z.infer<typeof SignalsS4Schema>;
export type SignalsS5 = z.infer<typeof SignalsS5Schema>;
export type SignalsS6 = z.infer<typeof SignalsS6Schema>;
export type SignalsS7 = z.infer<typeof SignalsS7Schema>;
export type Presence = z.infer<typeof PresenceSchema>;
export type VisibilityStateEntry = z.infer<typeof VisibilityStateEntrySchema>;