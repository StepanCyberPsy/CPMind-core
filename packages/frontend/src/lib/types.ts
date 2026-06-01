export type {
  ImpressionRow,
  ImpressionDetail,
  ImpressionListResponse,
} from '@cpmind/shared';
export type { ListParams } from './api.js';

export interface SortParams {
  sortBy: 'createdAt' | 'scoreFinal';
  sortDir: 'asc' | 'desc';
}

export interface FilterValues {
  campaignId?: string;
  creativeId?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | '';
  isSuspicious?: 'all' | 'true' | 'false';
  dateFrom?: string;
  dateTo?: string;
}

export interface ImpressionsTableProps {
  initialData: import('@cpmind/shared').ImpressionRow[];
  pageCount: number;
  currentPage: number;
  currentSort: SortParams;
}

export interface FiltersProps {
  current: import('./api.js').ListParams;
}

export interface ExportButtonProps {
  params: import('./api.js').ListParams;
}

export interface PaginationProps {
  currentPage: number;
  pageCount: number;
}

export interface ImpressionDetailProps {
  impression: import('@cpmind/shared').ImpressionDetail;
}