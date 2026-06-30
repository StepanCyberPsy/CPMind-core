import type { SortParams, PaginationProps } from '@/lib/shared/types';

export type {
  UserCampaignStatsRow,
  UserCampaignStatsListResponse,
  UserImpressionRow,
  UserImpressionListResponse,
} from '@cpmind/shared';
export type { UserListParams } from './api.js';
export type { SortParams, PaginationProps };

export interface UserCampaignsTableProps {
  initialCampaigns: import('@cpmind/shared').UserCampaignStatsRow[];
}

export interface UserImpressionsTableProps {
  initialData: import('@cpmind/shared').UserImpressionRow[];
  pageCount: number;
  currentPage: number;
  currentSort: SortParams;
  currentParams: import('./api.js').UserListParams;
  campaignId?: string;
}

export interface UserFiltersProps {
  current: import('./api.js').UserListParams;
  campaignOptions: string[];
  creativeOptions: string[];
  lockCampaignId?: boolean;
}

export interface UserExportButtonProps {
  params: import('./api.js').UserListParams;
}