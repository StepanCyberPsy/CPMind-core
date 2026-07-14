import type { SortParams, PaginationProps } from '@/lib/shared/types';

export type {
  Tag,
  UserCampaignStatsRow,
  UserCampaignStatsListResponse,
  UserImpressionRow,
  UserImpressionListResponse,
  PublisherDomainAggregate,
  IvtVerdict,
} from '@cpmind/shared';
export type { UserListParams } from './api.js';
export type { SortParams, PaginationProps };
export type {
  TagBuilderCopyTarget,
  TagBuilderFormat,
  TagBuilderFormErrors,
  TagBuilderGeneratedCode,
  TagBuilderPlatform,
  TagBuilderPlatformOption,
  TagBuilderStep,
} from '@/lib/shared/tag-builder';

export interface UserCampaignsTableProps {
  initialCampaigns: import('@cpmind/shared').UserCampaignStatsRow[];
}

export type TagBuilderCreativeType = 'banner_static' | 'banner_gif' | 'banner_html5' | 'video_creative';

export interface TagBuilderFormState {
  campaignId: string;
  creativeId: string;
  creativeType: TagBuilderCreativeType;
  publisherDomain: string;
  width: string;
  height: string;
}

export interface TagBuilderModalProps {
  open: boolean;
  onClose: () => void;
  initialCampaignId?: string;
}

export interface UserImpressionsTableProps {
  initialData: import('@cpmind/shared').UserImpressionRow[];
  pageCount: number;
  currentPage: number;
  currentSort: SortParams;
  currentParams: import('./api.js').UserListParams;
  campaignId?: string;
  isDomainView?: boolean;
  aggregate?: import('@cpmind/shared').PublisherDomainAggregate;
}

export interface UserFiltersProps {
  current: import('./api.js').UserListParams;
  campaignOptions: string[];
  creativeOptions: string[];
  lockCampaignId?: boolean;
  domainView?: boolean;
  domainOptions?: string[];
}

export interface UserExportButtonProps {
  params: import('./api.js').UserListParams;
}