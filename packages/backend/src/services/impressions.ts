import {
  and,
  eq,
  gte,
  lte,
  asc,
  desc,
  avg,
  count,
  countDistinct,
  type SQL,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  impressions,
  tags,
  users,
  campaigns,
  creatives,
} from '../db/schema.js';
import type {
  ImpressionRow,
  ImpressionDetail,
  ImpressionListResponse,
  UserVisibleImpressionField,
  UserImpressionRow,
  UserImpressionListResponse,
  TagUuid,
  UserUuid,
  IvtVerdict,
  MeasurementMode,
} from '@cpmind/shared';

import { getLatestApprovedCalibrationForImpression } from './calibration/calibrations.js';

export const NUMERIC_RANGE_COLUMNS = {
  score: impressions.scoreFinal,
  s1: impressions.s1Normalized,
  s2: impressions.s2Normalized,
  s3: impressions.s3Normalized,
  s4: impressions.s4Normalized,
  s5: impressions.s5Normalized,
  s6: impressions.s6Normalized,
  s7: impressions.s7Normalized,
} as const;

export type RangeFieldKey = keyof typeof NUMERIC_RANGE_COLUMNS;

export interface RangeValue {
  min?: number;
  max?: number;
}

export interface ListFilters {
  sessionGroupId?: string;
  campaignId?: string;
  campaignUuid?: string;
  creativeId?: string;
  creativeType?: string;
  format?: string;
  subtype?: string;
  publisherDomain?: string;
  deviceType?: string;
  isSuspicious?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  tagConstantsVersion?: string;
  weightsVersion?: string;
  ivtVerdict?: string;
  ranges?: Partial<Record<RangeFieldKey, RangeValue>>;
}

export interface ListParams extends ListFilters {
  page: number;
  limit: number;
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
}

export function buildWhereFromFilters(filters: ListFilters): SQL | undefined {
  const rangeConditions: Array<SQL | undefined> = [];
  for (const key of Object.keys(NUMERIC_RANGE_COLUMNS) as RangeFieldKey[]) {
    const range = filters.ranges?.[key];
    if (!range) continue;
    const column = NUMERIC_RANGE_COLUMNS[key];
    if (range.min !== undefined) rangeConditions.push(gte(column, range.min));
    if (range.max !== undefined) rangeConditions.push(lte(column, range.max));
  }

  return and(
    filters.sessionGroupId !== undefined ? eq(impressions.sessionGroupId, filters.sessionGroupId) : undefined,
    filters.campaignId !== undefined ? eq(impressions.campaignId, filters.campaignId) : undefined,
    filters.campaignUuid !== undefined ? eq(campaigns.uuid, filters.campaignUuid) : undefined,
    filters.creativeId !== undefined ? eq(impressions.creativeId, filters.creativeId) : undefined,
    filters.creativeType !== undefined ? eq(impressions.creativeType, filters.creativeType) : undefined,
    filters.format !== undefined ? eq(impressions.format, filters.format) : undefined,
    filters.subtype !== undefined ? eq(impressions.subtype, filters.subtype) : undefined,
    filters.publisherDomain !== undefined ? eq(impressions.publisherDomain, filters.publisherDomain) : undefined,
    filters.deviceType !== undefined ? eq(impressions.deviceType, filters.deviceType) : undefined,
    filters.isSuspicious !== undefined ? eq(impressions.isSuspicious, filters.isSuspicious) : undefined,
    filters.dateFrom !== undefined ? gte(impressions.createdAt, filters.dateFrom) : undefined,
    filters.dateTo !== undefined ? lte(impressions.createdAt, filters.dateTo) : undefined,
    filters.tagConstantsVersion !== undefined ? eq(impressions.tagConstantsVersion, filters.tagConstantsVersion) : undefined,
    filters.weightsVersion !== undefined ? eq(impressions.weightsVersion, filters.weightsVersion) : undefined,
    filters.ivtVerdict !== undefined ? eq(impressions.ivtVerdict, filters.ivtVerdict) : undefined,
    ...rangeConditions,
  );
}

export function buildWhereClause(queryParams: Record<string, string>): SQL | undefined {
  const filters: ListFilters = {
    ...(queryParams['sessionGroupId'] !== undefined && { sessionGroupId: queryParams['sessionGroupId'] }),
    ...(queryParams['campaignId'] !== undefined && { campaignId: queryParams['campaignId'] }),
    ...(queryParams['campaignUuid'] !== undefined && { campaignUuid: queryParams['campaignUuid'] }),
    ...(queryParams['creativeId'] !== undefined && { creativeId: queryParams['creativeId'] }),
    ...(queryParams['creativeType'] !== undefined && { creativeType: queryParams['creativeType'] }),
    ...(queryParams['format'] !== undefined && { format: queryParams['format'] }),
    ...(queryParams['subtype'] !== undefined && { subtype: queryParams['subtype'] }),
    ...(queryParams['publisherDomain'] !== undefined && { publisherDomain: queryParams['publisherDomain'] }),
    ...(queryParams['deviceType'] !== undefined && { deviceType: queryParams['deviceType'] }),
    ...(queryParams['isSuspicious'] !== undefined && {
      isSuspicious: queryParams['isSuspicious'] === 'true',
    }),
    ...(queryParams['tagConstantsVersion'] !== undefined && { tagConstantsVersion: queryParams['tagConstantsVersion'] }),
    ...(queryParams['weightsVersion'] !== undefined && { weightsVersion: queryParams['weightsVersion'] }),
    ...(queryParams['ivtVerdict'] !== undefined && { ivtVerdict: queryParams['ivtVerdict'] }),
  };

  if (queryParams['dateFrom'] !== undefined) {
    const d = new Date(queryParams['dateFrom']);
    if (!isNaN(d.getTime())) filters.dateFrom = d;
  }

  if (queryParams['dateTo'] !== undefined) {
    const d = new Date(queryParams['dateTo']);
    if (!isNaN(d.getTime())) filters.dateTo = d;
  }

  function parseNumericParam(key: string): number | undefined {
    const raw = queryParams[key];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return isNaN(n) ? undefined : n;
  }

  const ranges: Partial<Record<RangeFieldKey, RangeValue>> = {};
  for (const key of Object.keys(NUMERIC_RANGE_COLUMNS) as RangeFieldKey[]) {
    const min = parseNumericParam(`${key}Min`);
    const max = parseNumericParam(`${key}Max`);
    if (min === undefined && max === undefined) continue;
    ranges[key] = { ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
  }
  if (Object.keys(ranges).length > 0) filters.ranges = ranges;

  return buildWhereFromFilters(filters);
}

// Принудительное ограничение владельца для роли user. Комбинируется с buildWhereClause через and() на уровне роута, никогда не строится из данных запроса клиента
export function buildOwnerFilter(ownerId: number): SQL {
  return eq(impressions.userId, ownerId);
}

// Резолв userUuid в внутренний numeric id для опционального admin-only скоупинга списка/CSV по конкретному пользователю. Резолвится независимо от isActive — деактивация блокирует только /api/collect, не просмотр истории. Null означает, что пользователь с таким uuid не найден
export async function resolveTargetUserId(userUuid: UserUuid): Promise<number | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.uuid, userUuid)).limit(1);
  return row?.id ?? null;
}

// Колонки, доступные роли user. satisfies проверяет соответствие ключей USER_VISIBLE_IMPRESSION_FIELDS в обе стороны — расхождение состава полей не пройдет компиляцию
export const USER_VISIBLE_COLUMNS = {
  impression_id: impressions.impressionId,
  campaign_id: impressions.campaignId,
  creative_id: impressions.creativeId,
  campaign_name: campaigns.name,
  creative_name: creatives.name,
  creative_type: impressions.creativeType,
  format: impressions.format,
  subtype: impressions.subtype,
  device_type: impressions.deviceType,
  publisher_domain: impressions.publisherDomain,
  timestamp_start: impressions.timestampStart,
  timestamp_end: impressions.timestampEnd,
  s1_normalized: impressions.s1Normalized,
  s2_normalized: impressions.s2Normalized,
  s3_normalized: impressions.s3Normalized,
  s4_normalized: impressions.s4Normalized,
  s5_normalized: impressions.s5Normalized,
  s6_normalized: impressions.s6Normalized,
  s7_normalized: impressions.s7Normalized,
  score_final: impressions.scoreFinal,
  is_suspicious: impressions.isSuspicious,
  ivt_verdict: impressions.ivtVerdict,
  ivt_category: impressions.ivtCategory,
  ivt_confidence: impressions.ivtConfidence,
  score_reliable: impressions.scoreReliable,
} satisfies Record<UserVisibleImpressionField, unknown>;

// Колонки сверх USER_VISIBLE_COLUMNS, доступны только администратору
const ADMIN_ONLY_COLUMNS = {
  id: impressions.id,
  session_group_id: impressions.sessionGroupId,
  segment_index: impressions.segmentIndex,
  video_show_index: impressions.videoShowIndex,
  sdk_runtime_version: impressions.sdkRuntimeVersion,

  // Диагностика неполного показа: режим измерения, уровень доступа, выданный
  // плеером площадки, и форма VAST-доставки
  measurement_mode: impressions.measurementMode,
  omid_access_mode: impressions.omidAccessMode,
  vast_delivery_kind: impressions.vastDeliveryKind,

  skippable: impressions.s6Skippable,
  publisher_domain: impressions.publisherDomain,
  s1_raw_time_in_view: impressions.s1RawTimeInView,
  s2_raw_share_of_screen: impressions.s2RawShareOfScreen,
  s3_raw_scroll_speed: impressions.s3RawScrollSpeed,
  s4_raw_active_time_pct: impressions.s4RawActiveTimePct,
  s5_raw_top_event: impressions.s5RawTopEvent,
  s6_raw_completion_rate: impressions.s6RawCompletionRate,
  s6_audible_time_sec: impressions.s6AudibleTimeSec,
  s6_duration_sec: impressions.s6DurationSec,
  s6_skippable: impressions.s6Skippable,
  s7_raw_persistence: impressions.s7RawPersistence,
  f_presence: impressions.fPresence,
  weights_version: impressions.weightsVersion,
  s1_model_version: impressions.s1ModelVersion,
  s2_model_version: impressions.s2ModelVersion,
  s3_model_version: impressions.s3ModelVersion,
  s4_model_version: impressions.s4ModelVersion,
  s5_model_version: impressions.s5ModelVersion,
  s6_model_version: impressions.s6ModelVersion,
  s7_model_version: impressions.s7ModelVersion,
  no_events: impressions.noEvents,
  tab_mostly_hidden: impressions.tabMostlyHidden,
  anomaly_duration: impressions.anomalyDuration,
  created_at: impressions.createdAt,
};

// Владелец показа, подтягивается join'ом для административного контракта. leftJoin, не innerJoin — устойчиво к переходному окну до миграции NOT NULL
const OWNER_JOIN_COLUMNS = {
  tag_uuid: tags.uuid,
  tag_label: tags.label,
  user_uuid: users.uuid,
  user_login: users.login,
  tag_constants_version: impressions.tagConstantsVersion,
};

// Отображаемые названия из справочников. В показе хранятся ключи — неизменяемые
// идентификаторы, поэтому переименование кампании отражается на всей истории.
// Для показов legacy-тега ссылок нет и названия остаются null
const REFERENCE_JOIN_COLUMNS = {
  campaign_name: campaigns.name,
  creative_name: creatives.name,
};

const ADMIN_LIST_COLUMNS = {
  ...USER_VISIBLE_COLUMNS,
  ...ADMIN_ONLY_COLUMNS,
  ...OWNER_JOIN_COLUMNS,
  ...REFERENCE_JOIN_COLUMNS,
};

export const ADMIN_DETAIL_COLUMNS = {
  ...ADMIN_LIST_COLUMNS,
  signals_raw: impressions.signalsRaw,
  signals_normalized: impressions.signalsNormalized,
  ivt_signals: impressions.ivtSignals,
};

export interface JoinedImpressionRow {
  id: string;
  impression_id: string;
  session_group_id: string;
  segment_index: number;
  tag_uuid: string | null;
  tag_label: string | null;
  user_uuid: string | null;
  user_login: string | null;
  tag_constants_version: string | null;
  campaign_id: string;
  creative_id: string;
  campaign_name: string | null;
  creative_name: string | null;
  creative_type: string;
  format: string | null;
  subtype: string | null;
  video_show_index: number | null;
  sdk_runtime_version: string | null;
  measurement_mode: MeasurementMode;
  omid_access_mode: string | null;
  vast_delivery_kind: string | null;
  device_type: string;
  skippable: boolean | null;
  publisher_domain: string | null;
  timestamp_start: number;
  timestamp_end: number;
  created_at: Date;
  s1_raw_time_in_view: number | null;
  s2_raw_share_of_screen: number | null;
  s3_raw_scroll_speed: number | null;
  s4_raw_active_time_pct: number | null;
  s5_raw_top_event: string;
  s6_raw_completion_rate: number | null;
  s6_audible_time_sec: number | null;
  s6_duration_sec: number | null;
  s6_skippable: boolean | null;
  s7_raw_persistence: number | null;
  s1_normalized: number | null;
  s2_normalized: number | null;
  s3_normalized: number | null;
  s4_normalized: number | null;
  s5_normalized: number | null;
  s6_normalized: number | null;
  s7_normalized: number | null;
  f_presence: number | null;
  score_final: number | null;
  weights_version: string;
  s1_model_version: string | null;
  s2_model_version: string | null;
  s3_model_version: string | null;
  s4_model_version: string | null;
  s5_model_version: string | null;
  s6_model_version: string | null;
  s7_model_version: string | null;
  no_events: boolean;
  tab_mostly_hidden: boolean;
  anomaly_duration: boolean;
  is_suspicious: boolean;
  ivt_verdict: string;
  ivt_category: string | null;
  ivt_confidence: number;
  score_reliable: boolean;
}

export interface JoinedImpressionDetailRow extends JoinedImpressionRow {
  signals_raw: unknown;
  signals_normalized: unknown;
  ivt_signals: unknown;
}

export interface UserVisibleRow {
  impression_id: string;
  campaign_id: string;
  creative_id: string;
  campaign_name: string | null;
  creative_name: string | null;
  creative_type: string;
  format: string | null;
  subtype: string | null;
  device_type: string;
  publisher_domain: string | null;
  timestamp_start: number;
  timestamp_end: number;
  s1_normalized: number | null;
  s2_normalized: number | null;
  s3_normalized: number | null;
  s4_normalized: number | null;
  s5_normalized: number | null;
  s6_normalized: number | null;
  s7_normalized: number | null;
  score_final: number | null;
  is_suspicious: boolean;
  ivt_verdict: string;
  ivt_category: string | null;
  ivt_confidence: number;
  score_reliable: boolean;
}

// Подтверждение, что данные владельца подгружены корректно. Null означает незавершенный backfill — не должно происходить после миграции NOT NULL, явная ошибка лучше тихой отдачи неполных данных
export function requireOwnerJoined(
  row: JoinedImpressionRow,
): { tagUuid: TagUuid; userUuid: UserUuid; userLogin: string } {
  if (row.tag_uuid === null || row.user_uuid === null || row.user_login === null) {
    throw new Error(`Impression ${row.id} is missing owner data — backfill incomplete`);
  }

  return {
    tagUuid: row.tag_uuid as TagUuid,
    userUuid: row.user_uuid as UserUuid,
    userLogin: row.user_login,
  };
}

function toAdminImpressionRow(row: JoinedImpressionRow): ImpressionRow {
  const owner = requireOwnerJoined(row);

  return {
    id: row.id,
    impression_id: row.impression_id,
    session_group_id: row.session_group_id,
    segment_index: row.segment_index,
    tag_uuid: owner.tagUuid,
    tag_label: row.tag_label,
    user_uuid: owner.userUuid,
    user_login: owner.userLogin,
    tag_constants_version: row.tag_constants_version,
    campaign_id: row.campaign_id,
    creative_id: row.creative_id,
    campaign_name: row.campaign_name,
    creative_name: row.creative_name,
    creative_type: row.creative_type,
    format: row.format,
    subtype: row.subtype,
    video_show_index: row.video_show_index,
    sdk_runtime_version: row.sdk_runtime_version,
    measurement_mode: row.measurement_mode,
    omid_access_mode: row.omid_access_mode,
    vast_delivery_kind: row.vast_delivery_kind,
    device_type: row.device_type,
    skippable: row.skippable ?? false,
    publisher_domain: row.publisher_domain ?? 'unknown',
    timestamp_start: row.timestamp_start,
    timestamp_end: row.timestamp_end,
    created_at: row.created_at.toISOString(),

    s1_raw_time_in_view: row.s1_raw_time_in_view,
    s2_raw_share_of_screen: row.s2_raw_share_of_screen,
    s3_raw_scroll_speed: row.s3_raw_scroll_speed,
    s4_raw_active_time_pct: row.s4_raw_active_time_pct,
    s5_raw_top_event: row.s5_raw_top_event,
    s6_raw_completion_rate: row.s6_raw_completion_rate,
    s6_audible_time_sec: row.s6_audible_time_sec,
    s6_duration_sec: row.s6_duration_sec,
    s6_skippable: row.s6_skippable,
    s7_raw_persistence: row.s7_raw_persistence,

    s1_normalized: row.s1_normalized,
    s2_normalized: row.s2_normalized,
    s3_normalized: row.s3_normalized,
    s4_normalized: row.s4_normalized,
    s5_normalized: row.s5_normalized,
    s6_normalized: row.s6_normalized,
    s7_normalized: row.s7_normalized,

    f_presence: row.f_presence,
    score_final: row.score_final,
    weights_version: row.weights_version,
    s1_model_version: row.s1_model_version,
    s2_model_version: row.s2_model_version,
    s3_model_version: row.s3_model_version,
    s4_model_version: row.s4_model_version,
    s5_model_version: row.s5_model_version,
    s6_model_version: row.s6_model_version,
    s7_model_version: row.s7_model_version,

    no_events: row.no_events,
    tab_mostly_hidden: row.tab_mostly_hidden,
    anomaly_duration: row.anomaly_duration,
    is_suspicious: row.is_suspicious,

    ivt_verdict: row.ivt_verdict as IvtVerdict,
    ivt_category: row.ivt_category,
    ivt_confidence: row.ivt_confidence,
    score_reliable: row.score_reliable,
  };
}

function toAdminImpressionDetail(row: JoinedImpressionDetailRow): ImpressionDetail {
  return {
    ...toAdminImpressionRow(row),
    signals_raw: row.signals_raw,
    signals_normalized: row.signals_normalized,
    ivt_signals: row.ivt_signals,
  };
}

function toUserImpressionRow(row: UserVisibleRow): UserImpressionRow {
  const { publisher_domain, ivt_verdict, ...rest } = row;
  return {
    ...rest,
    publisher_domain: publisher_domain ?? 'unknown',
    ivt_verdict: ivt_verdict as IvtVerdict,
  };
}

const SORT_COLUMN_MAP = {
  createdAt: impressions.createdAt,
  scoreFinal: impressions.scoreFinal,
  s1Normalized: impressions.s1Normalized,
  s2Normalized: impressions.s2Normalized,
  s3Normalized: impressions.s3Normalized,
  s4Normalized: impressions.s4Normalized,
  s5Normalized: impressions.s5Normalized,
  s6Normalized: impressions.s6Normalized,
  s7Normalized: impressions.s7Normalized,
} as const;

export type SortField = keyof typeof SORT_COLUMN_MAP;

function buildOrderAndPage(params: ListParams): { orderExpr: SQL; offset: number } {
  const orderColumn = SORT_COLUMN_MAP[params.sortBy];
  const orderExpr = params.sortDir === 'asc' ? asc(orderColumn) : desc(orderColumn);
  const offset = (params.page - 1) * params.limit;
  return { orderExpr, offset };
}

// Полный список для администратора, join на tags/users для отображения владельца. targetUserId — опциональный скоуп на конкретного пользователя (страница /users_panel), без него поведение не отличается от текущего — все пользователи без ограничения
export async function listImpressionsForAdmin(
  params: ListParams,
  targetUserId?: number,
): Promise<ImpressionListResponse> {
  const where = targetUserId !== undefined
    ? and(buildWhereFromFilters(params), buildOwnerFilter(targetUserId))
    : buildWhereFromFilters(params);
  const { orderExpr, offset } = buildOrderAndPage(params);

  const [rows, [countResult]] = await Promise.all([
    db.select(ADMIN_LIST_COLUMNS)
      .from(impressions)
      .leftJoin(tags, eq(impressions.tagId, tags.id))
      .leftJoin(users, eq(impressions.userId, users.id))
      .leftJoin(campaigns, eq(impressions.campaignRefId, campaigns.id))
      .leftJoin(creatives, eq(impressions.creativeRefId, creatives.id))
      .where(where)
      .orderBy(orderExpr)
      .limit(params.limit)
      .offset(offset),

    db.select({ total: count() })
      .from(impressions)
      .leftJoin(campaigns, eq(impressions.campaignRefId, campaigns.id))
      .where(where),
  ]);

  const total = countResult?.total ?? 0;
  const pages = params.limit > 0 ? Math.ceil(total / params.limit) : 0;
  const items = rows.map((row) => toAdminImpressionRow(row));

  return { items, total, pages, page: params.page, limit: params.limit };
}

// Список для роли user, принудительно ограничен ownerId. Без join — прямой индексный запрос по idx_impressions_user_id_created_at
export async function listImpressionsForUser(
  params: ListParams,
  ownerId: number,
): Promise<UserImpressionListResponse> {
  const where = and(buildWhereFromFilters(params), buildOwnerFilter(ownerId));
  const { orderExpr, offset } = buildOrderAndPage(params);

  const [rows, [countResult]] = await Promise.all([
    db.select(USER_VISIBLE_COLUMNS)
      .from(impressions)
      .leftJoin(campaigns, eq(impressions.campaignRefId, campaigns.id))
      .leftJoin(creatives, eq(impressions.creativeRefId, creatives.id))
      .where(where)
      .orderBy(orderExpr)
      .limit(params.limit)
      .offset(offset),

    db.select({ total: count() })
      .from(impressions)
      .leftJoin(campaigns, eq(impressions.campaignRefId, campaigns.id))
      .where(where),
  ]);

  const total = countResult?.total ?? 0;
  const pages = params.limit > 0 ? Math.ceil(total / params.limit) : 0;
  const items = rows.map(toUserImpressionRow);

  return { items, total, pages, page: params.page, limit: params.limit };
}

// Детальный вид, только для администратора — роль user не имеет доступа к этому маршруту вообще
export async function getImpressionForAdmin(id: string): Promise<ImpressionDetail | null> {
  const [row] = await db.select(ADMIN_DETAIL_COLUMNS)
    .from(impressions)
    .leftJoin(tags, eq(impressions.tagId, tags.id))
    .leftJoin(users, eq(impressions.userId, users.id))
    .leftJoin(campaigns, eq(impressions.campaignRefId, campaigns.id))
    .leftJoin(creatives, eq(impressions.creativeRefId, creatives.id))
    .where(eq(impressions.id, id))
    .limit(1);

  if (row === undefined) return null;

  const latestCalibration = await getLatestApprovedCalibrationForImpression(id);

  return {
    ...toAdminImpressionDetail(row),
    ...(latestCalibration !== null && {
      lastRecalibratedAt: latestCalibration.approvedAt,
      lastRecalibratedWeightsVersion: latestCalibration.weightsVersion,
    }),
  };
}

// Агрегат по creativeId + publisherDomain для сводной строки режима площадки
export interface PublisherDomainAggregate {
  impressions_count: number;
  campaigns_count: number;
  avg_score: number | null;
  avg_s1: number | null;
  avg_s2: number | null;
  avg_s3: number | null;
  avg_s4: number | null;
  avg_s5: number | null;
  avg_s6: number | null;
  avg_s7: number | null;
}

export async function getPublisherDomainAggregate(
  creativeId: string,
  publisherDomain?: string,
  targetUserId?: number,
): Promise<PublisherDomainAggregate> {
  const where = and(
    eq(impressions.creativeId, creativeId),
    publisherDomain !== undefined ? eq(impressions.publisherDomain, publisherDomain) : undefined,
    targetUserId !== undefined ? buildOwnerFilter(targetUserId) : undefined,
  );

  const [row] = await db.select({
    impressions_count: count(),
    campaigns_count: countDistinct(impressions.campaignId),
    avg_score: avg(impressions.scoreFinal),
    avg_s1: avg(impressions.s1Normalized),
    avg_s2: avg(impressions.s2Normalized),
    avg_s3: avg(impressions.s3Normalized),
    avg_s4: avg(impressions.s4Normalized),
    avg_s5: avg(impressions.s5Normalized),
    avg_s6: avg(impressions.s6Normalized),
    avg_s7: avg(impressions.s7Normalized),
  })
    .from(impressions)
    .where(where);

  const toNum = (v: string | null | undefined): number | null =>
    v !== null && v !== undefined ? Number(v) : null;

  return {
    impressions_count: row?.impressions_count ?? 0,
    campaigns_count: Number(row?.campaigns_count ?? 0),
    avg_score: toNum(row?.avg_score),
    avg_s1: toNum(row?.avg_s1),
    avg_s2: toNum(row?.avg_s2),
    avg_s3: toNum(row?.avg_s3),
    avg_s4: toNum(row?.avg_s4),
    avg_s5: toNum(row?.avg_s5),
    avg_s6: toNum(row?.avg_s6),
    avg_s7: toNum(row?.avg_s7),
  };
}