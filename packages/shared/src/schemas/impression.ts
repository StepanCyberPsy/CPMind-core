import { z } from 'zod';

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
}).nullable();
// null означает: S3 недоступен -> backend перераспределяет веса

// S4 Tab Activity
export const VisibilityStateEntrySchema = z.object({
  state: z.enum(['visible', 'hidden']),
  timestamp: z.number().positive(),
});

export const SignalsS4Schema = z.object({
  tab_active_time_ms: z.number().min(0),
  tab_total_time_ms: z.number().min(0),
  tab_switches_count: z.number().min(0),
  visibility_state_history: z.array(VisibilityStateEntrySchema),
});

// S5 Interaction Events
export const SignalsS5Schema = z.object({
  clicked: z.boolean(),

  hover_count: z.number().min(0).nullable(),
  hover_duration_max_ms: z.number().min(0).nullable(),
  hover_duration_total_ms: z.number().min(0).nullable(),
  hover_to_click_latency_ms: z.number().min(0).nullable(),
  cursor_proximity_min_px: z.number().min(0).nullable(),
  cursor_trajectory_entropy: z.number().min(0).max(1).nullable(),

  tap_count: z.number().min(0).nullable(),
  touch_start_end_delta_ms: z.number().min(0).nullable(),
  zoom: z.boolean().nullable(),
  swipe_count: z.number().min(0).nullable(),
});

// S7 Page Context + Position + Clutter
export const SignalsS7Schema = z.object({
  creative_position_y_px: z.number().min(0),
  page_height_total_px: z.number().min(1),
  is_above_the_fold: z.boolean(),
  competing_ads_visible: z.number().min(0),
  viewability_persistence_pct: z.number().min(0).max(100),
});

// F_Presence
export const PresenceSchema = z.object({
  last_user_event_timestamp: z.number().positive().nullable(),
  time_since_last_event_ms: z.number().min(0),
  events_count_during_impression: z.number().min(0),
});

export const ImpressionPayloadSchema = z.object({
  impression_id: z.string().uuid(),
  campaign_id: z.string().min(1).max(255),
  creative_id: z.string().min(1).max(255),
  creative_type: z.enum(['banner_static', 'banner_gif', 'banner_html5']),
  device_type: z.enum(['desktop', 'mobile', 'tablet']),
  timestamp_start: z.number().positive(),
  timestamp_end: z.number().positive(),
  signals: z.object({
    s1: SignalsS1Schema,
    s2: SignalsS2Schema,
    s3: SignalsS3Schema,
    s4: SignalsS4Schema,
    s5: SignalsS5Schema,
    s7: SignalsS7Schema,
  }),
  presence: PresenceSchema,
});

export type ImpressionPayload = z.infer<typeof ImpressionPayloadSchema>;
export type SignalsS1 = z.infer<typeof SignalsS1Schema>;
export type SignalsS2 = z.infer<typeof SignalsS2Schema>;
export type SignalsS3 = z.infer<typeof SignalsS3Schema>;
export type SignalsS4 = z.infer<typeof SignalsS4Schema>;
export type SignalsS5 = z.infer<typeof SignalsS5Schema>;
export type SignalsS7 = z.infer<typeof SignalsS7Schema>;
export type Presence = z.infer<typeof PresenceSchema>;