import type {
  Tag,
  UserCampaignStatsListResponse,
  UserImpressionListResponse,
  PublisherDomainAggregate,
  IvtVerdict,
} from '@cpmind/shared';
import { getBackendUrl, getPublicBackendUrl } from '@/lib/shared/env';
import type { SortField } from '@/lib/shared/types';

const CLIENT_BACKEND = getPublicBackendUrl();

export interface UserListParams {
  page?: number;
  limit?: number;
  campaignId?: string;
  creativeId?: string;
  publisherDomain?: string;
  deviceType?: string;
  isSuspicious?: boolean;
  dateFrom?: string;
  dateTo?: string;
  scoreMin?: number;
  scoreMax?: number;
  s1Min?: number;
  s1Max?: number;
  s2Min?: number;
  s2Max?: number;
  s3Min?: number;
  s3Max?: number;
  s4Min?: number;
  s4Max?: number;
  s5Min?: number;
  s5Max?: number;
  s6Min?: number;
  s6Max?: number;
  s7Min?: number;
  s7Max?: number;
  ivtVerdict?: IvtVerdict;
  sortBy?: SortField;
  sortDir?: 'asc' | 'desc';
}

function toBackendDateTime(
  value: string,
  boundary: 'from' | 'to',
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  const date = boundary === 'from'
    ? new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
    : new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  return date.toISOString();
}

function buildQuery(params: UserListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.campaignId) q.set('campaignId', params.campaignId);
  if (params.creativeId) q.set('creativeId', params.creativeId);
  if (params.publisherDomain) q.set('publisherDomain', params.publisherDomain);
  if (params.scoreMin !== undefined) q.set('scoreMin', String(params.scoreMin));
  if (params.scoreMax !== undefined) q.set('scoreMax', String(params.scoreMax));
  if (params.s1Min !== undefined) q.set('s1Min', String(params.s1Min));
  if (params.s1Max !== undefined) q.set('s1Max', String(params.s1Max));
  if (params.s2Min !== undefined) q.set('s2Min', String(params.s2Min));
  if (params.s2Max !== undefined) q.set('s2Max', String(params.s2Max));
  if (params.s3Min !== undefined) q.set('s3Min', String(params.s3Min));
  if (params.s3Max !== undefined) q.set('s3Max', String(params.s3Max));
  if (params.s4Min !== undefined) q.set('s4Min', String(params.s4Min));
  if (params.s4Max !== undefined) q.set('s4Max', String(params.s4Max));
  if (params.s5Min !== undefined) q.set('s5Min', String(params.s5Min));
  if (params.s5Max !== undefined) q.set('s5Max', String(params.s5Max));
  if (params.s6Min !== undefined) q.set('s6Min', String(params.s6Min));
  if (params.s6Max !== undefined) q.set('s6Max', String(params.s6Max));
  if (params.s7Min !== undefined) q.set('s7Min', String(params.s7Min));
  if (params.s7Max !== undefined) q.set('s7Max', String(params.s7Max));
  if (params.deviceType) q.set('deviceType', params.deviceType);
  if (params.isSuspicious !== undefined) q.set('isSuspicious', String(params.isSuspicious));
  if (params.ivtVerdict !== undefined) q.set('ivtVerdict', params.ivtVerdict);
  if (params.dateFrom) q.set('dateFrom', toBackendDateTime(params.dateFrom, 'from'));
  if (params.dateTo) q.set('dateTo', toBackendDateTime(params.dateTo, 'to'));
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortDir) q.set('sortDir', params.sortDir);
  return q.toString();
}

export async function fetchUserCampaigns(
  cookie?: string,
): Promise<UserCampaignStatsListResponse> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/user/campaigns`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchUserImpressions(
  params: UserListParams,
  cookie?: string,
): Promise<UserImpressionListResponse> {
  const backend = getBackendUrl();
  const query = buildQuery(params);
  const res = await fetch(`${backend}/api/impressions?${query}`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function buildUserCsvUrl(params: UserListParams): string {
  return `${CLIENT_BACKEND}/api/impressions/export/csv?${buildQuery(params)}`;
}

export async function fetchMyTags(): Promise<Tag[]> {
  const res = await fetch(`${CLIENT_BACKEND}/api/tags/mine`, {
    credentials: 'include',
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const tags = await res.json() as Tag[];
  return tags.filter((tag) => tag.isActive);
}

export async function fetchUserPublisherDomainAggregate(
  creativeId: string,
  publisherDomain?: string,
  cookie?: string,
): Promise<PublisherDomainAggregate> {
  const q = new URLSearchParams({ creativeId });
  if (publisherDomain !== undefined) q.set('publisherDomain', publisherDomain);
  const backend = cookie !== undefined ? getBackendUrl() : CLIENT_BACKEND;
  const res = await fetch(`${backend}/api/impressions/domain_aggregate?${q.toString()}`, {
    cache: 'no-store',
    ...(cookie !== undefined
      ? { headers: { Cookie: cookie } }
      : { credentials: 'include' }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}