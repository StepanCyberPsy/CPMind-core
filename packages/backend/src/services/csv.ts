import type { FastifyReply } from 'fastify';
import { format } from 'date-fns';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';
import type { ImpressionSelect } from '../db/schema.js';
import { buildWhereClause } from './impressions.js';

const CSV_HEADER = [
  'impression_id', 'campaign_id', 'creative_id', 'creative_type', 'device_type',
  'timestamp_start', 'timestamp_end', 'weights_version',
  'time_in_view_sec', 'mrc_compliant', 'visible_pixels_pct', 'max_continuous_view_sec',
  'share_of_screen_avg_pct', 'share_of_screen_max_pct',
  'scroll_speed_avg_px_s', 'scroll_speed_max_px_s', 'scroll_speed_std_dev',
  'pause_count', 'pause_duration_total_ms', 'scroll_streaks',
  'direction_changes', 'reading_pattern_detected', 'is_momentum_scroll',
  'tab_active_time_ms', 'tab_total_time_ms', 'tab_switches_count',
  'clicked', 'hover_count', 'hover_duration_max_ms', 'hover_duration_total_ms',
  'hover_to_click_latency_ms', 'cursor_proximity_min_px', 'cursor_trajectory_entropy',
  'tap_count', 'touch_start_end_delta_ms', 'zoom', 'swipe_count',
  'creative_position_y_px', 'page_height_total_px', 'is_above_the_fold',
  'competing_ads_visible', 'viewability_persistence_pct',
  'last_user_event_timestamp', 'time_since_last_event_ms', 'events_count_during_impression',
  's1_normalized', 's2_normalized', 's3_normalized', 's4_normalized', 's5_normalized', 's7_normalized',
  'f_presence', 'score_final',
  'no_events', 'tab_mostly_hidden', 'anomaly_duration', 'is_suspicious',
].join(',');

function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowToCsvLine(row: ImpressionSelect): string {
  const raw = row.signalsRaw as Record<string, Record<string, unknown>>;
  const s1 = raw['s1'] ?? {};
  const s2 = raw['s2'] ?? {};
  const s3 = (raw['s3'] ?? {}) as Record<string, unknown>;
  const s4 = raw['s4'] ?? {};
  const s5 = raw['s5'] ?? {};
  const s7 = raw['s7'] ?? {};
  const pr = (row.signalsRaw as Record<string, unknown>)['presence'] as Record<string, unknown> ?? {};

  const fields: unknown[] = [
    row.impressionId, row.campaignId, row.creativeId, row.creativeType, row.deviceType,
    row.timestampStart, row.timestampEnd, row.weightsVersion,
    s1['time_in_view_sec'], s1['mrc_compliant'], s1['visible_pixels_pct'], s1['max_continuous_view_sec'],
    s2['share_of_screen_avg_pct'], s2['share_of_screen_max_pct'],
    s3['scroll_speed_avg_px_s'], s3['scroll_speed_max_px_s'], s3['scroll_speed_std_dev'],
    s3['pause_count'], s3['pause_duration_total_ms'], s3['scroll_streaks'],
    s3['direction_changes'], s3['reading_pattern_detected'], s3['is_momentum_scroll'],
    s4['tab_active_time_ms'], s4['tab_total_time_ms'], s4['tab_switches_count'],
    s5['clicked'], s5['hover_count'], s5['hover_duration_max_ms'], s5['hover_duration_total_ms'],
    s5['hover_to_click_latency_ms'], s5['cursor_proximity_min_px'], s5['cursor_trajectory_entropy'],
    s5['tap_count'], s5['touch_start_end_delta_ms'], s5['zoom'], s5['swipe_count'],
    s7['creative_position_y_px'], s7['page_height_total_px'], s7['is_above_the_fold'],
    s7['competing_ads_visible'], s7['viewability_persistence_pct'],
    pr['last_user_event_timestamp'], pr['time_since_last_event_ms'], pr['events_count_during_impression'],
    row.s1Normalized, row.s2Normalized, row.s3Normalized, row.s4Normalized, row.s5Normalized, row.s7Normalized,
    row.fPresence, row.scoreFinal,
    row.noEvents, row.tabMostlyHidden, row.anomalyDuration, row.isSuspicious,
  ];

  return fields.map(csvField).join(',');
}

export async function buildCsvResponse(
  queryParams: Record<string, string>,
  reply: FastifyReply,
): Promise<void> {
  const filename = `cpmind_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;

  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);

  const where = buildWhereClause(queryParams);
  const BATCH = 500;
  let offset = 0;
  const chunks: string[] = [];

  chunks.push('\uFEFF');
  chunks.push(CSV_HEADER + '\r\n');

  while (true) {
    const batch = await db.select()
      .from(impressions)
      .where(where)
      .orderBy(impressions.createdAt)
      .limit(BATCH)
      .offset(offset);

    if (batch.length === 0) break;

    for (const row of batch) {
      chunks.push(rowToCsvLine(row) + '\r\n');
    }

    offset += BATCH;
    if (batch.length < BATCH) break;
  }

  return reply.send(chunks.join(''));
}