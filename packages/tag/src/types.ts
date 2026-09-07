import type { CreativeType } from '@cpmind/shared';

export interface TagConfig {
    tagUuid: string;
    tagConstantsVersion: string;
    campaignId: string;
    creativeId: string;
    creativeType: CreativeType;
    skippable: boolean;
    publisherDomain?: string;
    endpoint: string;
    debug: boolean;
}