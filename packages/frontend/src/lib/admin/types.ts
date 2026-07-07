import type { SortParams, PaginationProps } from '@/lib/shared/types';

export type {
  ImpressionRow,
  ImpressionDetail,
  ImpressionListResponse,
  WeightConfigRow,
  UserStatsRow,
  UserStatsListResponse,
  TagConstantsConfig,
  CreateTagConstantsPayload,
  IvtVerdict,
} from '@cpmind/shared';
export type { ListParams } from './api.js';
export type { SortParams, PaginationProps };

export interface FilterValues {
  campaignId?: string;
  creativeId?: string;
  tagConstantsVersion?: string;
  weightsVersion?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | '';
  isSuspicious?: 'all' | 'true' | 'false';
  ivtVerdict?: import('@cpmind/shared').IvtVerdict | '';
  dateFrom?: string;
  dateTo?: string;
}

export interface ImpressionsTableProps {
  initialData: import('@cpmind/shared').ImpressionRow[];
  pageCount: number;
  currentPage: number;
  currentSort: SortParams;
  currentParams: import('./api.js').ListParams;
}

export interface FiltersProps {
  current: import('./api.js').ListParams;
  tagConstantsVersions: string[];
  weightsVersions: string[];
  campaignOptions: string[];
  creativeOptions: string[];
}

export interface ExportButtonProps {
  params: import('./api.js').ListParams;
}

export interface ImpressionDetailProps {
  impression: import('@cpmind/shared').ImpressionDetail;
  siblingSegments?: import('@cpmind/shared').ImpressionRow[];
}

export interface WeightsConfigPanelProps {
  initialConfigs: import('@cpmind/shared').WeightConfigRow[];
}

export interface UsersPanelTableProps {
  initialUsers: import('@cpmind/shared').UserStatsRow[];
  currentUserUuid: string;
}

export type {
  CalibrationSelection,
  CalibrationBatch,
  CalibrationBatchStatus,
  CalibrationItem,
  CalibrationItemListResponse,
  ApproveCalibrationResult,
} from '@cpmind/shared';

export interface TagConstantsPanelProps {
  initialConfigs: import('@cpmind/shared').TagConstantsConfig[];
}