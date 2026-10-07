import type { FastifyReply } from 'fastify';
import { format } from 'date-fns';
import { eq, and } from 'drizzle-orm';
import { USER_VISIBLE_IMPRESSION_FIELDS, UserUuidSchema } from '@cpmind/shared';
import { db } from '../db/index.js';
import {
  impressions,
  tags,
  users,
  campaigns,
  creatives,
} from '../db/schema.js';
import type { AuthenticatedRequestUser } from '../middleware/requireAuth.js';
import {
  buildWhereClause,
  buildOwnerFilter,
  requireOwnerJoined,
  resolveTargetUserId,
  USER_VISIBLE_COLUMNS,
  ADMIN_DETAIL_COLUMNS,
} from './impressions.js';
import type {
  UserVisibleRow,
  JoinedImpressionDetailRow,
} from './impressions.js';

const CSV_BATCH_SIZE = 10_000;

const ADMIN_CSV_HEADER = [
  'impression_id', 'session_group_id', 'segment_index',
  'tag_uuid', 'tag_label', 'user_uuid', 'user_login',
  'campaign_id', 'creative_id', 'campaign_name', 'creative_name',
  'creative_type', 'format', 'subtype', 'video_show_index',
  'sdk_runtime_version', 'device_type',
  'skippable', 'publisher_domain',
  'timestamp_start', 'timestamp_end', 'weights_version',
  's1_model_version', 's2_model_version', 's3_model_version', 's4_model_version',
  's5_model_version', 's6_model_version', 's7_model_version',
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
  's6_raw_completion_rate', 's6_audible_time_sec', 's6_duration_sec', 's6_skippable',
  's1_normalized', 's2_normalized', 's3_normalized', 's4_normalized', 's5_normalized', 's6_normalized', 's7_normalized',
  'f_presence', 'score_final',
  'no_events', 'tab_mostly_hidden', 'anomaly_duration', 'is_suspicious',
  'ivt_verdict', 'ivt_category', 'ivt_confidence', 'score_reliable',
].join(',');

const USER_CSV_HEADER = USER_VISIBLE_IMPRESSION_FIELDS.join(',');

function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowToAdminCsvLine(row: JoinedImpressionDetailRow): string {
  const owner = requireOwnerJoined(row);
  const raw = row.signals_raw as Record<string, Record<string, unknown>>;
  const s1 = raw['s1'] ?? {};
  const s2 = raw['s2'] ?? {};
  const s3 = (raw['s3'] ?? {}) as Record<string, unknown>;
  const s4 = raw['s4'] ?? {};
  const s5 = raw['s5'] ?? {};
  const s7 = raw['s7'] ?? {};
  const pr = (row.signals_raw as Record<string, unknown>)['presence'] as Record<string, unknown> ?? {};

  const fields: unknown[] = [
    row.impression_id, row.session_group_id, row.segment_index,
    owner.tagUuid, row.tag_label, owner.userUuid, owner.userLogin,
    row.campaign_id, row.creative_id, row.campaign_name, row.creative_name,
    row.creative_type, row.format, row.subtype, row.video_show_index,
    row.sdk_runtime_version, row.device_type,
    row.skippable, row.publisher_domain,
    row.timestamp_start, row.timestamp_end, row.weights_version,
    row.s1_model_version, row.s2_model_version, row.s3_model_version, row.s4_model_version,
    row.s5_model_version, row.s6_model_version, row.s7_model_version,
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
    row.s6_raw_completion_rate, row.s6_audible_time_sec, row.s6_duration_sec, row.s6_skippable,
    row.s1_normalized, row.s2_normalized, row.s3_normalized, row.s4_normalized, row.s5_normalized, row.s6_normalized, row.s7_normalized,
    row.f_presence, row.score_final,
    row.no_events, row.tab_mostly_hidden, row.anomaly_duration, row.is_suspicious,
    row.ivt_verdict, row.ivt_category, row.ivt_confidence, row.score_reliable,
  ];

  return fields.map(csvField).join(',');
}

function rowToUserCsvLine(row: UserVisibleRow): string {
  const fields = USER_VISIBLE_IMPRESSION_FIELDS.map((field) => row[field]);
  return fields.map(csvField).join(',');
}

// Универсальный построитель CSV-тела батчами по CSV_BATCH_SIZE строк. Не зависит от роли — параметризован источником данных и сериализацией строки
async function collectCsvBody<T>(
  header: string,
  fetchBatch: (offset: number) => Promise<T[]>,
  rowToLine: (row: T) => string,
): Promise<string> {
  let offset = 0;
  const chunks: string[] = ['\uFEFF', header + '\r\n'];

  while (true) {
    const batch = await fetchBatch(offset);
    if (batch.length === 0) break;

    for (const row of batch) {
      chunks.push(rowToLine(row) + '\r\n');
    }

    offset += CSV_BATCH_SIZE;
    if (batch.length < CSV_BATCH_SIZE) break;
  }

  return chunks.join('');
}

async function buildAdminCsvBody(
  queryParams: Record<string, string>,
  targetUserId?: number,
): Promise<string> {
  const where = targetUserId !== undefined
    ? and(buildWhereClause(queryParams), buildOwnerFilter(targetUserId))
    : buildWhereClause(queryParams);

  return collectCsvBody(
    ADMIN_CSV_HEADER,
    (offset) => db.select(ADMIN_DETAIL_COLUMNS)
      .from(impressions)
      .leftJoin(tags, eq(impressions.tagId, tags.id))
      .leftJoin(users, eq(impressions.userId, users.id))
      .leftJoin(campaigns, eq(impressions.campaignRefId, campaigns.id))
      .leftJoin(creatives, eq(impressions.creativeRefId, creatives.id))
      .where(where)
      .orderBy(impressions.createdAt)
      .limit(CSV_BATCH_SIZE)
      .offset(offset),
    rowToAdminCsvLine,
  );
}

async function buildUserCsvBody(
  queryParams: Record<string, string>,
  ownerId: number,
): Promise<string> {
  const where = and(buildWhereClause(queryParams), buildOwnerFilter(ownerId));

  return collectCsvBody(
    USER_CSV_HEADER,
    (offset) => db.select(USER_VISIBLE_COLUMNS)
      .from(impressions)
      .leftJoin(campaigns, eq(impressions.campaignRefId, campaigns.id))
      .leftJoin(creatives, eq(impressions.creativeRefId, creatives.id))
      .where(where)
      .orderBy(impressions.createdAt)
      .limit(CSV_BATCH_SIZE)
      .offset(offset),
    rowToUserCsvLine,
  );
}

function sendCsvBody(
  reply: FastifyReply,
  body: string,
): FastifyReply {
  const filename = `cpmind_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  return reply.send(body);
}

export async function buildCsvResponse(
  queryParams: Record<string, string>,
  reply: FastifyReply,
  authUser: AuthenticatedRequestUser,
): Promise<void> {
  if (authUser.role !== 'admin') {
    const body = await buildUserCsvBody(queryParams, authUser.id);
    return sendCsvBody(reply, body);
  }

  if (queryParams['userUuid'] === undefined) {
    const body = await buildAdminCsvBody(queryParams);
    return sendCsvBody(reply, body);
  }

  const parsedUuid = UserUuidSchema.safeParse(queryParams['userUuid']);

  if (!parsedUuid.success) {
    return reply.status(422).send({ error: 'Invalid userUuid' });
  }

  const targetUserId = await resolveTargetUserId(parsedUuid.data);

  if (targetUserId === null) {
    return reply.status(404).send({ error: 'User not found' });
  }

  const body = await buildAdminCsvBody(queryParams, targetUserId);
  return sendCsvBody(reply, body);
}