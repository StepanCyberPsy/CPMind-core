import type { UserListParams } from './api';
import type { IvtVerdict } from '@cpmind/shared';

export interface UserImpressionsSearchParams {
  page?: string;
  campaignId?: string;
  creativeId?: string;
  deviceType?: string;
  isSuspicious?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
  scoreMin?: string;
  scoreMax?: string;
  s1Min?: string;
  s1Max?: string;
  s2Min?: string;
  s2Max?: string;
  s3Min?: string;
  s3Max?: string;
  s4Min?: string;
  s4Max?: string;
  s5Min?: string;
  s5Max?: string;
  s6Min?: string;
  s6Max?: string;
  s7Min?: string;
  s7Max?: string;
  ivtVerdict?: string;
}

function numericParam(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export interface ParsedUserListParams {
  params: UserListParams;
  sortBy: NonNullable<UserListParams['sortBy']>;
  sortDir: 'asc' | 'desc';
}

export function parseUserListSearchParams(
  searchParams: UserImpressionsSearchParams,
  forcedCampaignId?: string,
): ParsedUserListParams {
  const sortBy = (searchParams.sortBy as UserListParams['sortBy']) ?? 'createdAt';
  const sortDir = (searchParams.sortDir as 'asc' | 'desc' | undefined) ?? 'desc';

  const scoreMin = numericParam(searchParams.scoreMin);
  const scoreMax = numericParam(searchParams.scoreMax);
  const s1Min = numericParam(searchParams.s1Min);
  const s1Max = numericParam(searchParams.s1Max);
  const s2Min = numericParam(searchParams.s2Min);
  const s2Max = numericParam(searchParams.s2Max);
  const s3Min = numericParam(searchParams.s3Min);
  const s3Max = numericParam(searchParams.s3Max);
  const s4Min = numericParam(searchParams.s4Min);
  const s4Max = numericParam(searchParams.s4Max);
  const s5Min = numericParam(searchParams.s5Min);
  const s5Max = numericParam(searchParams.s5Max);
  const s6Min = numericParam(searchParams.s6Min);
  const s6Max = numericParam(searchParams.s6Max);
  const s7Min = numericParam(searchParams.s7Min);
  const s7Max = numericParam(searchParams.s7Max);

  const campaignId = forcedCampaignId ?? searchParams.campaignId;

  const params: UserListParams = {
    page: Number(searchParams.page ?? 1),
    limit: 50,
    sortBy,
    sortDir,
    ...(campaignId && { campaignId }),
    ...(searchParams.creativeId && { creativeId: searchParams.creativeId }),
    ...(searchParams.deviceType && { deviceType: searchParams.deviceType }),
    ...(searchParams.dateFrom && { dateFrom: searchParams.dateFrom }),
    ...(searchParams.dateTo && { dateTo: searchParams.dateTo }),
    ...(searchParams.isSuspicious !== undefined && {
      isSuspicious: searchParams.isSuspicious === 'true',
    }),
    ...(scoreMin !== undefined && { scoreMin }),
    ...(scoreMax !== undefined && { scoreMax }),
    ...(s1Min !== undefined && { s1Min }),
    ...(s1Max !== undefined && { s1Max }),
    ...(s2Min !== undefined && { s2Min }),
    ...(s2Max !== undefined && { s2Max }),
    ...(s3Min !== undefined && { s3Min }),
    ...(s3Max !== undefined && { s3Max }),
    ...(s4Min !== undefined && { s4Min }),
    ...(s4Max !== undefined && { s4Max }),
    ...(s5Min !== undefined && { s5Min }),
    ...(s5Max !== undefined && { s5Max }),
    ...(s6Min !== undefined && { s6Min }),
    ...(s6Max !== undefined && { s6Max }),
    ...(s7Min !== undefined && { s7Min }),
    ...(s7Max !== undefined && { s7Max }),
    ...(searchParams.ivtVerdict !== undefined && {
      ivtVerdict: searchParams.ivtVerdict as IvtVerdict,
    }),
  };

  return { params, sortBy, sortDir };
}