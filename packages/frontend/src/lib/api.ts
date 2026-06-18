import type {
  ImpressionListResponse,
  ImpressionDetail,
  WeightConfigRow,
} from '@cpmind/shared';

// BACKEND_URL, CLIENT_BACKEND используется только на сервере (Server Components)
// На клиенте запросы идут через /api proxy в next.config (или через NGINX напрямую)
// Для текущей версии продукта - приемлемо, но для юзеров записали в техдолг
const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:3001';
const CLIENT_BACKEND = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? 'http://localhost:3001';

export interface ListParams {
  page?: number;
  limit?: number;
  campaignId?: string;
  creativeId?: string;
  deviceType?: string;
  isSuspicious?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'scoreFinal';
  sortDir?: 'asc' | 'desc';
}

function buildQuery(params: ListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.campaignId) q.set('campaignId', params.campaignId);
  if (params.creativeId) q.set('creativeId', params.creativeId);
  if (params.deviceType) q.set('deviceType', params.deviceType);
  if (params.isSuspicious !== undefined) q.set('isSuspicious', String(params.isSuspicious));
  if (params.dateFrom) q.set('dateFrom', params.dateFrom);
  if (params.dateTo) q.set('dateTo', params.dateTo);
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortDir) q.set('sortDir', params.sortDir);
  return q.toString();
}

export async function fetchImpressions(
  params: ListParams,
  cookie?: string,
): Promise<ImpressionListResponse> {
  const res = await fetch(`${BACKEND}/api/impressions?${buildQuery(params)}`, {
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
  const res = await fetch(`${BACKEND}/api/impressions/${id}`, {
    cache: 'no-store',
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** Строит URL для CSV-экспорта (используется в ExportButton) */
// export function buildCsvUrl(params: ListParams): string {
// В браузере запрос идет через NGINX (тот же домен), поэтому относительный путь
// return `/api/impressions/export/csv?${buildQuery(params)}`;
//}

export function buildCsvUrl(params: ListParams): string {
  const base = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? '';
  return `${base}/api/impressions/export/csv?${buildQuery(params)}`;
}

export async function fetchWeightsConfigs(
  cookie?: string,
): Promise<WeightConfigRow[]> {
  const res = await fetch(`${BACKEND}/api/weights-config`, {
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