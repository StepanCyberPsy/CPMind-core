import type { ImpressionPayload } from '../schemas/impression.js';

export interface CappingResult {
  payload: ImpressionPayload;
  anomaly_duration: boolean;
}

/** Ограничивает число в диапазоне [min, max] */
function cap(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** То же для nullable: null проходит без изменений */
function capN(value: number | null, min: number, max: number): number | null {
  return value === null ? null : cap(value, min, max);
}

/** Любое отрицательное число -> 0. Без верхней границы */
function floor0(value: number): number {
  return Math.max(0, value);
}

/** floor0 для nullable */
function floor0N(value: number | null): number | null {
  return value === null ? null : Math.max(0, value);
}

/**
 * Правила:
 *   time_in_view_sec > 3600 -> cap до 3600, anomaly_duration = true
 *   visible_pixels_pct > 100 -> cap до 100
 *   share_of_screen_*_pct > 100 -> cap до 100
 *   scroll_speed_*_px_s > 50 000 -> cap до 50 000
 *   hover_duration_total_ms > 300 000 -> cap до 300 000
 *   любое числовое поле < 0 -> заменить на 0
 */
export function applyAnomalyCapping(payload: ImpressionPayload): CappingResult {
  const p: ImpressionPayload = JSON.parse(JSON.stringify(payload)) as ImpressionPayload;
  const anomaly_duration = p.signals.s1.time_in_view_sec > 3600;

  // S1 Time-in-View
  p.signals.s1.time_in_view_sec = cap(p.signals.s1.time_in_view_sec, 0, 3600);
  p.signals.s1.max_continuous_view_sec = cap(p.signals.s1.max_continuous_view_sec, 0, 3600);
  p.signals.s1.visible_pixels_pct = cap(p.signals.s1.visible_pixels_pct, 0, 100);

  // S2 Share of Screen
  p.signals.s2.share_of_screen_avg_pct = cap(p.signals.s2.share_of_screen_avg_pct, 0, 100);
  p.signals.s2.share_of_screen_max_pct = cap(p.signals.s2.share_of_screen_max_pct, 0, 100);

  // S3 Scroll Velocity
  if (p.signals.s3 !== null) {
    p.signals.s3.scroll_speed_avg_px_s = capN(p.signals.s3.scroll_speed_avg_px_s, 0, 50_000);
    p.signals.s3.scroll_speed_max_px_s = capN(p.signals.s3.scroll_speed_max_px_s, 0, 50_000);
    p.signals.s3.scroll_speed_std_dev = floor0N(p.signals.s3.scroll_speed_std_dev);
    p.signals.s3.pause_count = floor0N(p.signals.s3.pause_count);
    p.signals.s3.pause_duration_total_ms = floor0N(p.signals.s3.pause_duration_total_ms);
    p.signals.s3.scroll_streaks = floor0N(p.signals.s3.scroll_streaks);
    p.signals.s3.direction_changes = floor0N(p.signals.s3.direction_changes);
  }

  // S4 Tab Activity
  p.signals.s4.tab_active_time_ms = floor0(p.signals.s4.tab_active_time_ms);
  p.signals.s4.tab_total_time_ms = floor0(p.signals.s4.tab_total_time_ms);
  p.signals.s4.tab_switches_count = floor0(p.signals.s4.tab_switches_count);

  // S5 Interaction Events
  p.signals.s5.hover_count = floor0N(p.signals.s5.hover_count);
  p.signals.s5.hover_duration_max_ms = floor0N(p.signals.s5.hover_duration_max_ms);
  p.signals.s5.hover_duration_total_ms = capN(p.signals.s5.hover_duration_total_ms, 0, 300_000);
  p.signals.s5.hover_to_click_latency_ms = floor0N(p.signals.s5.hover_to_click_latency_ms);
  p.signals.s5.cursor_proximity_min_px = floor0N(p.signals.s5.cursor_proximity_min_px);
  p.signals.s5.cursor_trajectory_entropy = capN(p.signals.s5.cursor_trajectory_entropy, 0, 1);
  p.signals.s5.tap_count = floor0N(p.signals.s5.tap_count);
  p.signals.s5.touch_start_end_delta_ms = floor0N(p.signals.s5.touch_start_end_delta_ms);
  p.signals.s5.swipe_count = floor0N(p.signals.s5.swipe_count);

  // S6 Video Engagement & Audibility
  if (p.signals.s6 !== null && p.signals.s6 !== undefined) {
    p.signals.s6.completion_rate_pct = capN(p.signals.s6.completion_rate_pct, 0, 100);
    p.signals.s6.audible_time_sec = cap(p.signals.s6.audible_time_sec, 0, 3600);
    p.signals.s6.duration_sec = capN(p.signals.s6.duration_sec, 0, 3600);
    p.signals.s6.replay_count = floor0(p.signals.s6.replay_count);
    p.signals.s6.volume_level = cap(p.signals.s6.volume_level, 0, 100);
  }

  // S7 Page Context
  p.signals.s7.creative_position_y_px = floor0(p.signals.s7.creative_position_y_px);
  p.signals.s7.page_height_total_px = Math.max(1, p.signals.s7.page_height_total_px);
  p.signals.s7.competing_ads_visible = floor0(p.signals.s7.competing_ads_visible);
  p.signals.s7.viewability_persistence_pct = cap(p.signals.s7.viewability_persistence_pct, 0, 100);

  // F_Presence
  p.presence.time_since_last_event_ms = floor0(p.presence.time_since_last_event_ms);
  p.presence.events_count_during_impression = floor0(p.presence.events_count_during_impression);

  return { payload: p, anomaly_duration };
}