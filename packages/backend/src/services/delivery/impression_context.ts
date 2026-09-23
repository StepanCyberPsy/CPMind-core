import { eq } from 'drizzle-orm';
import type { ImpressionPayload } from '@cpmind/shared';
import { db } from '../../db/index.js';
import {
    adSessions,
    campaigns,
    creatives,
    creativeVersions,
    placements,
} from '../../db/schema.js';
import { getAdSessionTtlMs } from '../../lib/env.js';
import {
    evaluateImpressionContext,
    type AdSessionContextRow,
    type ImpressionContextResolution,
} from './impression_context_rules.js';
import { toDomainEnforcement } from './domain_policy.js';
import {
    toFormatSubtype,
    type DeliveryMode,
    type PlacementFormat,
    type PlacementSubtype,
} from '@cpmind/shared';

// Контекст ad_session одним запросом. Кампания резолвится через креатив выданной версии —
// атрибуция соответствует тому, что сервер фактически отдал, а не текущему состоянию placement
async function loadAdSessionContextRow(
    adSessionId: string,
): Promise<AdSessionContextRow | null> {
    const [row] = await db
        .select({
            adSessionId: adSessions.adSessionId,
            userId: adSessions.userId,
            createdAt: adSessions.createdAt,
            placementId: placements.id,
            placementUuid: placements.uuid,
            placementIsActive: placements.isActive,
            placementCreativeId: placements.creativeId,
            placementSkippable: placements.skippable,
            placementPublisherDomain: placements.publisherDomain,
            placementAllowedDomains: placements.allowedDomains,
            placementDomainEnforcement: placements.domainEnforcement,
            sessionPublisherDomain: adSessions.publisherDomain,
            creativeVersionId: creativeVersions.id,
            creativeVersionUuid: creativeVersions.uuid,
            creativeId: creatives.id,
            creativeKey: creatives.creativeKey,
            creativeType: adSessions.creativeType,
            campaignId: campaigns.id,
            campaignKey: campaigns.campaignKey,
            deliveryMode: adSessions.deliveryMode,
            format: adSessions.format,
            subtype: adSessions.subtype,
            videoShowIndex: adSessions.videoShowIndex,
            sdkRuntimeVersion: adSessions.sdkRuntimeVersion,
            measurementMode: adSessions.measurementMode,
            tagConstantsVersion: adSessions.tagConstantsVersion,
        })
        .from(adSessions)
        .innerJoin(placements, eq(adSessions.placementId, placements.id))
        .leftJoin(creativeVersions, eq(adSessions.creativeVersionId, creativeVersions.id))
        .leftJoin(creatives, eq(creativeVersions.creativeId, creatives.id))
        .leftJoin(campaigns, eq(creatives.campaignId, campaigns.id))
        .where(eq(adSessions.adSessionId, adSessionId))
        .limit(1);

    if (!row) return null;

    // Формат сессии выводится из прежней модели, пока колонка допускает отсутствие значения
    const fallback = toFormatSubtype(row.deliveryMode as DeliveryMode);

    return {
        ...row,
        format: (row.format as PlacementFormat | null) ?? fallback.format,
        subtype: (row.subtype as PlacementSubtype | null) ?? fallback.subtype,
        placementDomainEnforcement: toDomainEnforcement(row.placementDomainEnforcement),
    };
}

export async function resolveImpressionContext(
    payload: ImpressionPayload,
    ownerUserId: number,
): Promise<ImpressionContextResolution> {
    const row = payload.ad_session_id !== undefined
        ? await loadAdSessionContextRow(payload.ad_session_id)
        : null;

    return evaluateImpressionContext(
        payload,
        row,
        ownerUserId,
        Date.now(),
        getAdSessionTtlMs(),
    );
}