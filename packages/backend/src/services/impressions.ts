import { and, eq, gte, lte, asc, desc, count, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { impressions } from '../db/schema.js';
import type { ImpressionSelect } from '../db/schema.js';
import type {
  ImpressionRow,
  ImpressionDetail,
  ImpressionListResponse,
} from '@cpmind/shared';

export interface ListParams {
  page: number;
  limit: number;
  sessionGroupId?: string;
  campaignId?: string;
  creativeId?: string;
  deviceType?: string;
  isSuspicious?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy: 'createdAt' | 'scoreFinal';
  sortDir: 'asc' | 'desc';
}

interface FilterParams {
  sessionGroupId?: string;
  campaignId?: string;
  creativeId?: string;
  deviceType?: string;
  isSuspicious?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

function buildWhereFromFilters(filters: FilterParams): SQL | undefined {
  return and(
    filters.sessionGroupId !== undefined ? eq(impressions.sessionGroupId, filters.sessionGroupId) : undefined,
    filters.campaignId !== undefined ? eq(impressions.campaignId, filters.campaignId) : undefined,
    filters.creativeId !== undefined ? eq(impressions.creativeId, filters.creativeId) : undefined,
    filters.deviceType !== undefined ? eq(impressions.deviceType, filters.deviceType) : undefined,
    filters.isSuspicious !== undefined ? eq(impressions.isSuspicious, filters.isSuspicious) : undefined,
    filters.dateFrom !== undefined ? gte(impressions.createdAt, filters.dateFrom) : undefined,
    filters.dateTo !== undefined ? lte(impressions.createdAt, filters.dateTo) : undefined,
  );
}

export function buildWhereClause(queryParams: Record<string, string>): SQL | undefined {
  const filters: FilterParams = {
    ...(queryParams['sessionGroupId'] !== undefined && { sessionGroupId: queryParams['sessionGroupId'] }),
    ...(queryParams['campaignId'] !== undefined && { campaignId: queryParams['campaignId'] }),
    ...(queryParams['creativeId'] !== undefined && { creativeId: queryParams['creativeId'] }),
    ...(queryParams['deviceType'] !== undefined && { deviceType: queryParams['deviceType'] }),
    ...(queryParams['isSuspicious'] !== undefined && {
      isSuspicious: queryParams['isSuspicious'] === 'true',
    }),
  };

  if (queryParams['dateFrom'] !== undefined) {
    const d = new Date(queryParams['dateFrom']);
    if (!isNaN(d.getTime())) filters.dateFrom = d;
  }

  if (queryParams['dateTo'] !== undefined) {
    const d = new Date(queryParams['dateTo']);
    if (!isNaN(d.getTime())) filters.dateTo = d;
  }

  return buildWhereFromFilters(filters);
}

function toImpressionDetail(row: ImpressionSelect): ImpressionDetail {
  return {
    id: row.id,
    impression_id: row.impressionId,
    session_group_id: row.sessionGroupId,
    segment_index: row.segmentIndex,
    campaign_id: row.campaignId,
    creative_id: row.creativeId,
    creative_type: row.creativeType,
    device_type: row.deviceType,
    timestamp_start: row.timestampStart,
    timestamp_end: row.timestampEnd,
    created_at: row.createdAt.toISOString(),

    s1_raw_time_in_view: row.s1RawTimeInView ?? null,
    s2_raw_share_of_screen: row.s2RawShareOfScreen ?? null,
    s3_raw_scroll_speed: row.s3RawScrollSpeed ?? null,
    s4_raw_active_time_pct: row.s4RawActiveTimePct ?? null,
    s5_raw_top_event: row.s5RawTopEvent,
    s7_raw_persistence: row.s7RawPersistence ?? null,

    s1_normalized: row.s1Normalized ?? null,
    s2_normalized: row.s2Normalized ?? null,
    s3_normalized: row.s3Normalized ?? null,
    s4_normalized: row.s4Normalized ?? null,
    s5_normalized: row.s5Normalized ?? null,
    s7_normalized: row.s7Normalized ?? null,

    f_presence: row.fPresence,
    score_final: row.scoreFinal,
    weights_version: row.weightsVersion,

    no_events: row.noEvents,
    tab_mostly_hidden: row.tabMostlyHidden,
    anomaly_duration: row.anomalyDuration,
    is_suspicious: row.isSuspicious,

    signals_raw: row.signalsRaw,
    signals_normalized: row.signalsNormalized,
  };
}

export async function listImpressions(params: ListParams): Promise<ImpressionListResponse> {
  const filters: FilterParams = {
    ...(params.sessionGroupId !== undefined && { sessionGroupId: params.sessionGroupId }),
    ...(params.campaignId !== undefined && { campaignId: params.campaignId }),
    ...(params.creativeId !== undefined && { creativeId: params.creativeId }),
    ...(params.deviceType !== undefined && { deviceType: params.deviceType }),
    ...(params.isSuspicious !== undefined && { isSuspicious: params.isSuspicious }),
    ...(params.dateFrom !== undefined && { dateFrom: params.dateFrom }),
    ...(params.dateTo !== undefined && { dateTo: params.dateTo }),
  };

  const where = buildWhereFromFilters(filters);

  const orderCol = params.sortBy === 'scoreFinal'
    ? impressions.scoreFinal
    : impressions.createdAt;
  const orderExpr = params.sortDir === 'asc' ? asc(orderCol) : desc(orderCol);
  const offset = (params.page - 1) * params.limit;

  const [rows, [countResult]] = await Promise.all([
    db.select({
      id: impressions.id,
      impressionId: impressions.impressionId,
      sessionGroupId: impressions.sessionGroupId,
      segmentIndex: impressions.segmentIndex,
      campaignId: impressions.campaignId,
      creativeId: impressions.creativeId,
      creativeType: impressions.creativeType,
      deviceType: impressions.deviceType,
      timestampStart: impressions.timestampStart,
      timestampEnd: impressions.timestampEnd,
      createdAt: impressions.createdAt,

      s1RawTimeInView: impressions.s1RawTimeInView,
      s2RawShareOfScreen: impressions.s2RawShareOfScreen,
      s3RawScrollSpeed: impressions.s3RawScrollSpeed,
      s4RawActiveTimePct: impressions.s4RawActiveTimePct,
      s5RawTopEvent: impressions.s5RawTopEvent,
      s7RawPersistence: impressions.s7RawPersistence,
      s1Normalized: impressions.s1Normalized,
      s2Normalized: impressions.s2Normalized,
      s3Normalized: impressions.s3Normalized,
      s4Normalized: impressions.s4Normalized,
      s5Normalized: impressions.s5Normalized,
      s7Normalized: impressions.s7Normalized,

      fPresence: impressions.fPresence,
      scoreFinal: impressions.scoreFinal,
      weightsVersion: impressions.weightsVersion,

      noEvents: impressions.noEvents,
      tabMostlyHidden: impressions.tabMostlyHidden,
      anomalyDuration: impressions.anomalyDuration,

      isSuspicious: impressions.isSuspicious,
    })
      .from(impressions)
      .where(where)
      .orderBy(orderExpr)
      .limit(params.limit)
      .offset(offset),

    db.select({ total: count() })
      .from(impressions)
      .where(where),
  ]);

  const total = countResult?.total ?? 0;
  const pages = params.limit > 0 ? Math.ceil(total / params.limit) : 0;

  const items: ImpressionRow[] = rows.map((row) => ({
    id: row.id,
    impression_id: row.impressionId,
    session_group_id: row.sessionGroupId,
    segment_index: row.segmentIndex,
    campaign_id: row.campaignId,
    creative_id: row.creativeId,
    creative_type: row.creativeType,
    device_type: row.deviceType,
    timestamp_start: row.timestampStart,
    timestamp_end: row.timestampEnd,
    created_at: row.createdAt.toISOString(),

    s1_raw_time_in_view: row.s1RawTimeInView ?? null,
    s2_raw_share_of_screen: row.s2RawShareOfScreen ?? null,
    s3_raw_scroll_speed: row.s3RawScrollSpeed ?? null,
    s4_raw_active_time_pct: row.s4RawActiveTimePct ?? null,
    s5_raw_top_event: row.s5RawTopEvent,
    s7_raw_persistence: row.s7RawPersistence ?? null,

    s1_normalized: row.s1Normalized ?? null,
    s2_normalized: row.s2Normalized ?? null,
    s3_normalized: row.s3Normalized ?? null,
    s4_normalized: row.s4Normalized ?? null,
    s5_normalized: row.s5Normalized ?? null,
    s7_normalized: row.s7Normalized ?? null,

    f_presence: row.fPresence,
    score_final: row.scoreFinal,
    weights_version: row.weightsVersion,

    no_events: row.noEvents,
    tab_mostly_hidden: row.tabMostlyHidden,
    anomaly_duration: row.anomalyDuration,
    is_suspicious: row.isSuspicious,
  }));

  return { items, total, pages, page: params.page, limit: params.limit };
}

export async function getImpression(id: string): Promise<ImpressionDetail | null> {
  const [row] = await db.select()
    .from(impressions)
    .where(eq(impressions.id, id))
    .limit(1);

  if (row === undefined) return null;

  return toImpressionDetail(row);
}