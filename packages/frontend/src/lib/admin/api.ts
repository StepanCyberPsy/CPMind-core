import type {
  ImpressionListResponse,
  ImpressionDetail,
  WeightConfigRow,
  UserStatsListResponse,
  TagConstantsConfigListResponse,
  TagConstantsConfig,
  CreateTagConstantsPayload,
  User,
  TagUuid,
  CalibrationSelection,
  CalibrationBatch,
  CalibrationBatchId,
  CalibrationItemListResponse,
  ApproveCalibrationResult,
} from '@cpmind/shared';
import { getBackendUrl, getPublicBackendUrl } from '@/lib/shared/env';
import type { SortField } from '@/lib/shared/types';

const CLIENT_BACKEND = getPublicBackendUrl();

export interface ListParams {
  page?: number;
  limit?: number;
  userUuid?: string;
  sessionGroupId?: string;
  campaignId?: string;
  creativeId?: string;
  tagConstantsVersion?: string;
  weightsVersion?: string;
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
  s7Min?: number;
  s7Max?: number;
  sortBy?: SortField;
  sortDir?: 'asc' | 'desc';
}

function buildQuery(params: ListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.userUuid) q.set('userUuid', params.userUuid);
  if (params.sessionGroupId) q.set('sessionGroupId', params.sessionGroupId);
  if (params.campaignId) q.set('campaignId', params.campaignId);
  if (params.creativeId) q.set('creativeId', params.creativeId);
  if (params.tagConstantsVersion) q.set('tagConstantsVersion', params.tagConstantsVersion);
  if (params.weightsVersion) q.set('weightsVersion', params.weightsVersion);
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
  if (params.s7Min !== undefined) q.set('s7Min', String(params.s7Min));
  if (params.s7Max !== undefined) q.set('s7Max', String(params.s7Max));
  if (params.deviceType) q.set('deviceType', params.deviceType);
  if (params.isSuspicious !== undefined) q.set('isSuspicious', String(params.isSuspicious));
  if (params.dateFrom) q.set('dateFrom', params.dateFrom);
  if (params.dateTo) q.set('dateTo', params.dateTo);
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortDir) q.set('sortDir', params.sortDir);
  return q.toString();
}

// Импрешены
export async function fetchImpressions(
  params: ListParams,
  cookie?: string,
): Promise<ImpressionListResponse> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/impressions?${buildQuery(params)}`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchImpressionById(
  id: string,
  cookie?: string,
): Promise<ImpressionDetail | null> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/impressions/${id}`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function buildCsvUrl(params: ListParams): string {
  return `${CLIENT_BACKEND}/api/impressions/export/csv?${buildQuery(params)}`;
}

// Конфигурация весов
export async function fetchWeightsConfigs(
  cookie?: string,
): Promise<WeightConfigRow[]> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/weights-config`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createWeightsConfig(
  body: {
    version: string;
    weights: {
      s1: number;
      s2: number;
      s3: number;
      s4: number;
      s5: number;
      s7: number
    };
    description?: string;
  },
): Promise<WeightConfigRow> {
  const res = await fetch(`${CLIENT_BACKEND}/api/weights-config`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `API error: ${res.status}`);
  }
  return res.json();
}

export async function activateWeightsConfig(id: string): Promise<void> {
  const res = await fetch(`${CLIENT_BACKEND}/api/weights-config/${id}/activate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `API error: ${res.status}`);
  }
}

export async function deleteWeightsConfig(id: string): Promise<void> {
  const res = await fetch(`${CLIENT_BACKEND}/api/weights-config/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `API error: ${res.status}`);
  }
}

// Версии констант тега
export async function fetchTagConstantsConfigs(
  cookie?: string,
): Promise<TagConstantsConfigListResponse> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/tag-constants`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createTagConstantsConfig(payload: CreateTagConstantsPayload): Promise<TagConstantsConfig> {
  const res = await fetch(`${CLIENT_BACKEND}/api/tag-constants`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? err?.message ?? `API error: ${res.status}`);
  }
  return res.json();
}

export async function activateTagConstantsConfig(id: string): Promise<TagConstantsConfig> {
  const res = await fetch(`${CLIENT_BACKEND}/api/tag-constants/${id}/activate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? err?.message ?? `API error: ${res.status}`);
  }
  return res.json();
}

export async function deactivateTagConstantsConfig(id: string): Promise<TagConstantsConfig> {
  const res = await fetch(`${CLIENT_BACKEND}/api/tag-constants/${id}/deactivate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? err?.message ?? `API error: ${res.status}`);
  }
  return res.json();
}

// Пользователи
export async function fetchUsersStats(
  cookie?: string,
): Promise<UserStatsListResponse> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/api/users/stats`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateUserStatus(
  userUuid: string,
  isActive: boolean,
): Promise<void> {
  const res = await fetch(`${CLIENT_BACKEND}/api/users/${userUuid}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `API error: ${res.status}`);
  }
}

export interface CreateUserResult {
  user: User;
  tagUuid: TagUuid;
}

export async function createUser(
  body: { login: string; password: string },
): Promise<CreateUserResult> {
  const res = await fetch(`${CLIENT_BACKEND}/api/users`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

// Калибровка весов
export async function createCalibrationBatch(
  targetWeightsConfigId: string,
  selection: CalibrationSelection,
): Promise<CalibrationBatchId> {
  const res = await fetch(`${CLIENT_BACKEND}/api/calibrations`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetWeightsConfigId, selection }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `API error: ${res.status}`);
  }
  const data = await res.json();
  return data.batchId;
}

export async function fetchCalibrationBatch(batchId: string): Promise<CalibrationBatch> {
  const res = await fetch(`${CLIENT_BACKEND}/api/calibrations/${batchId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

export async function fetchCalibrationBatchItems(
  batchId: string,
  page: number,
  limit: number,
): Promise<CalibrationItemListResponse> {
  const res = await fetch(`${CLIENT_BACKEND}/api/calibrations/${batchId}/items?page=${page}&limit=${limit}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

export async function approveCalibrationBatch(
  batchId: string,
  itemIds?: string[],
): Promise<ApproveCalibrationResult> {
  const res = await fetch(`${CLIENT_BACKEND}/api/calibrations/${batchId}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemIds !== undefined ? { itemIds } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

export async function discardCalibrationBatch(batchId: string): Promise<void> {
  const res = await fetch(`${CLIENT_BACKEND}/api/calibrations/${batchId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `API error: ${res.status}`);
  }
}