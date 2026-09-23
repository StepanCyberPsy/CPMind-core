import type {
    CreativeType,
    DeliveryMode,
    ImpressionPayload,
    MeasurementMode,
    PlacementFormat,
    PlacementSubtype,
} from '@cpmind/shared';
import {
    evaluateDomainPolicy,
    type DomainEnforcement,
    type DomainPolicyOutcome,
} from './domain_policy.js';

// Жёсткие нарушения — показ нельзя привязать к данным или он подделан, запись отклоняется
export type ImpressionContextRejection =
    | 'HOSTED_WITHOUT_AD_SESSION'
    | 'AD_SESSION_NOT_FOUND'
    | 'AD_SESSION_OWNER_MISMATCH'
    | 'AD_SESSION_EXPIRED'
    | 'AD_SESSION_NOT_MEASURABLE'
    | 'AD_SESSION_CONTEXT_INCOMPLETE'
    | 'PUBLISHER_DOMAIN_NOT_ALLOWED';

// Мягкие нарушения — реальный показ с изменившимся или расходящимся контекстом, запись принимается с флагом
export type ImpressionContextViolation =
    | 'PLACEMENT_INACTIVE'
    | 'PLACEMENT_CREATIVE_CHANGED'
    | 'CLIENT_CONTEXT_MISMATCH'
    | 'PUBLISHER_DOMAIN_MISMATCH'
    | 'ALLOWED_DOMAIN_MISMATCH';

export interface AdSessionContextRow {
    adSessionId: string;
    userId: number;
    createdAt: Date;
    placementId: string;
    placementUuid: string;
    placementIsActive: boolean;
    placementCreativeId: string;
    placementSkippable: boolean;
    placementPublisherDomain: string | null;
    placementAllowedDomains: string[] | null;
    placementDomainEnforcement: DomainEnforcement;
    sessionPublisherDomain: string | null;
    creativeVersionId: string | null;
    creativeVersionUuid: string | null;
    creativeId: string | null;
    creativeKey: string | null;
    creativeType: CreativeType;
    campaignId: string | null;
    campaignKey: string | null;
    deliveryMode: DeliveryMode;
    format: PlacementFormat;
    subtype: PlacementSubtype | null;
    videoShowIndex: number | null;
    sdkRuntimeVersion: string | null;
    measurementMode: MeasurementMode;
    tagConstantsVersion: string | null;
}

export interface ImpressionDeliveryContext {
    adSessionId: string;
    placementId: string;
    creativeVersionId: string;
    creativeRefId: string;
    campaignRefId: string;
    campaignLabel: string;
    creativeLabel: string;
    creativeType: CreativeType;
    skippable: boolean;
    deliveryMode: DeliveryMode;
    format: PlacementFormat;
    subtype: PlacementSubtype | null;
    videoShowIndex: number | null;
    sdkRuntimeVersion: string | null;
    measurementMode: MeasurementMode;
    tagConstantsVersion: string | null;
    publisherDomain: string | null;
    contextViolations: ImpressionContextViolation[];
}

export type ImpressionContextResolution =
    | { kind: 'legacy' }
    | { kind: 'hosted'; context: ImpressionDeliveryContext }
    | { kind: 'rejected'; reason: ImpressionContextRejection };

// Режимы, в которых SDK отправляет показы. vast_only — только VAST-трекинг внешнего плеера
const MEASURABLE_MODES: ReadonlySet<MeasurementMode> = new Set([
    'full_direct_display',
    'full_cpmind_player',
    'partial_embedded_iframe',
]);

// Домен площадки: переопределение в плейсменте, затем определённый сервером
// из Referer при выдаче, затем определённый SDK на странице.
// Отсутствующее значение приводится к null — источник домена не найден
function resolvePublisherDomain(
    payload: ImpressionPayload,
    row: AdSessionContextRow,
): string | null {
    if (row.placementPublisherDomain !== null) return row.placementPublisherDomain;
    if (row.sessionPublisherDomain !== null) return row.sessionPublisherDomain;
    return payload.publisher_domain ?? null;
}

// Клиентские значения контекста используются только для сверки с ad_session
function collectContextViolations(
    payload: ImpressionPayload,
    row: AdSessionContextRow,
    creativeId: string,
    creativeVersionUuid: string,
    resolvedDomain: string | null,
    domainOutcome: DomainPolicyOutcome,
): ImpressionContextViolation[] {
    const violations: ImpressionContextViolation[] = [];

    if (!row.placementIsActive) violations.push('PLACEMENT_INACTIVE');
    if (row.placementCreativeId !== creativeId) violations.push('PLACEMENT_CREATIVE_CHANGED');

    const clientMismatch =
        (payload.placement_uuid !== undefined && payload.placement_uuid !== row.placementUuid) ||
        (payload.creative_version_uuid !== undefined && payload.creative_version_uuid !== creativeVersionUuid) ||
        (payload.measurement_mode !== undefined && payload.measurement_mode !== row.measurementMode) ||
        (payload.delivery_mode !== undefined && payload.delivery_mode !== row.deliveryMode) ||
        (row.tagConstantsVersion !== null && payload.tag_constants_version !== row.tagConstantsVersion) ||
        payload.creative_type !== row.creativeType;

    if (clientMismatch) violations.push('CLIENT_CONTEXT_MISMATCH');

    // Расхождение домена, определённого сервером, с заявленным клиентом:
    // переопределение в плейсменте сверке не подлежит, оно задано администратором
    if (
        row.placementPublisherDomain === null &&
        resolvedDomain !== null &&
        resolvedDomain !== payload.publisher_domain
    ) {
        violations.push('PUBLISHER_DOMAIN_MISMATCH');
    }

    if (domainOutcome === 'violation') violations.push('ALLOWED_DOMAIN_MISMATCH');

    return violations;
}

/**
 * Определяет контекст показа для /api/collect. Pure-функция без обращения к БД.
 * Payload без ad_session_id — legacy-показ, если клиент не заявил hosted-режим.
 * Для hosted-показа атрибуция (placement, креатив, кампания, режимы, skippable)
 * берётся исключительно из ad_session и связанных сущностей.
 */
export function evaluateImpressionContext(
    payload: ImpressionPayload,
    row: AdSessionContextRow | null,
    ownerUserId: number,
    nowMs: number,
    ttlMs: number,
): ImpressionContextResolution {
    if (payload.ad_session_id === undefined) {
        if (payload.measurement_mode !== undefined && payload.measurement_mode !== 'legacy_tag') {
            return { kind: 'rejected', reason: 'HOSTED_WITHOUT_AD_SESSION' };
        }
        return { kind: 'legacy' };
    }

    if (row === null) {
        return { kind: 'rejected', reason: 'AD_SESSION_NOT_FOUND' };
    }

    if (row.userId !== ownerUserId) {
        return { kind: 'rejected', reason: 'AD_SESSION_OWNER_MISMATCH' };
    }

    if (nowMs - row.createdAt.getTime() > ttlMs) {
        return { kind: 'rejected', reason: 'AD_SESSION_EXPIRED' };
    }

    if (!MEASURABLE_MODES.has(row.measurementMode)) {
        return { kind: 'rejected', reason: 'AD_SESSION_NOT_MEASURABLE' };
    }

    const {
        creativeVersionId,
        creativeVersionUuid,
        creativeId,
        creativeKey,
        campaignId,
        campaignKey,
    } = row;

    if (
        creativeVersionId === null ||
        creativeVersionUuid === null ||
        creativeId === null ||
        creativeKey === null ||
        campaignId === null ||
        campaignKey === null
    ) {
        return { kind: 'rejected', reason: 'AD_SESSION_CONTEXT_INCOMPLETE' };
    }

    const publisherDomain = resolvePublisherDomain(payload, row);
    const domainOutcome = evaluateDomainPolicy(
        publisherDomain,
        row.placementAllowedDomains,
        row.placementDomainEnforcement,
    );

    if (domainOutcome === 'blocked') {
        return { kind: 'rejected', reason: 'PUBLISHER_DOMAIN_NOT_ALLOWED' };
    }

    return {
        kind: 'hosted',
        context: {
            adSessionId: row.adSessionId,
            placementId: row.placementId,
            creativeVersionId,
            creativeRefId: creativeId,
            campaignRefId: campaignId,
            campaignLabel: campaignKey,
            creativeLabel: creativeKey,
            creativeType: row.creativeType,
            skippable: row.placementSkippable,
            deliveryMode: row.deliveryMode,
            format: row.format,
            subtype: row.subtype,
            videoShowIndex: row.videoShowIndex,
            sdkRuntimeVersion: row.sdkRuntimeVersion,
            measurementMode: row.measurementMode,
            tagConstantsVersion: row.tagConstantsVersion,
            publisherDomain,
            contextViolations: collectContextViolations(
                payload,
                row,
                creativeId,
                creativeVersionUuid,
                publisherDomain,
                domainOutcome,
            ),
        },
    };
}