import {
    describe,
    expect,
    it,
} from 'vitest';
import type { ImpressionPayload } from '@cpmind/shared';
import {
    evaluateImpressionContext,
    type AdSessionContextRow,
} from '../src/services/delivery/impression_context_rules.js';

const NOW_MS = Date.UTC(2026, 8, 17, 12, 0, 0);
const TTL_MS = 24 * 60 * 60 * 1000;
const OWNER_USER_ID = 7;
const AD_SESSION_ID = '5b0f1f7e-3c1a-4f3e-9a51-2f6f1b7c8d90';
const PLACEMENT_UUID = '0c7d6a52-8a3e-4b8b-9d0c-5d2f7e1a3b44';
const CREATIVE_VERSION_UUID = '9e2b4c61-7f0a-4d5e-8b3c-1a6f2e9d0c77';
const PUBLISHER_DOMAIN = 'news.example.com';

function buildRow(
    overrides: Partial<AdSessionContextRow> = {},
): AdSessionContextRow {
    return {
        adSessionId: AD_SESSION_ID,
        userId: OWNER_USER_ID,
        createdAt: new Date(NOW_MS - 60_000),
        placementId: 'placement-internal-id',
        placementUuid: PLACEMENT_UUID,
        placementIsActive: true,
        placementCreativeId: 'creative-internal-id',
        placementSkippable: true,
        placementPublisherDomain: null,
        placementAllowedDomains: null,
        placementDomainEnforcement: 'monitor',
        sessionPublisherDomain: PUBLISHER_DOMAIN,
        creativeVersionId: 'creative-version-internal-id',
        creativeVersionUuid: CREATIVE_VERSION_UUID,
        creativeId: 'creative-internal-id',
        creativeKey: 'spring_video_01',
        creativeType: 'video_creative',
        campaignId: 'campaign-internal-id',
        campaignKey: 'spring_2026',
        deliveryMode: 'outstream',
        format: 'outstream',
        subtype: 'inpage',
        videoShowIndex: 0,
        sdkRuntimeVersion: 'player_v1',
        measurementMode: 'full_cpmind_player',
        tagConstantsVersion: 'v4',
        ...overrides,
    };
}

function buildPayload(
    overrides: Partial<ImpressionPayload> = {},
): ImpressionPayload {
    return {
        creative_type: 'video_creative',
        tag_constants_version: 'v4',
        ad_session_id: AD_SESSION_ID,
        publisher_domain: PUBLISHER_DOMAIN,
        ...overrides,
    } as ImpressionPayload;
}

function evaluate(
    payload: ImpressionPayload,
    row: AdSessionContextRow | null,
): ReturnType<typeof evaluateImpressionContext> {
    return evaluateImpressionContext(
        payload,
        row,
        OWNER_USER_ID,
        NOW_MS,
        TTL_MS,
    );
}

describe('evaluateImpressionContext', () => {
    it('классифицирует payload без ad_session как legacy', () => {
        const result = evaluate(
            buildPayload({ ad_session_id: undefined }),
            null,
        );
        expect(result).toEqual({ kind: 'legacy' });
    });

    it('отклоняет hosted-режим без ad_session', () => {
        const result = evaluate(
            buildPayload({
                ad_session_id: undefined,
                measurement_mode: 'full_cpmind_player',
            }),
            null,
        );
        expect(result).toEqual({ kind: 'rejected', reason: 'HOSTED_WITHOUT_AD_SESSION' });
    });

    it('отклоняет несуществующую ad_session', () => {
        expect(evaluate(buildPayload(), null)).toEqual({
            kind: 'rejected',
            reason: 'AD_SESSION_NOT_FOUND',
        });
    });

    it('отклоняет ad_session другого владельца', () => {
        const result = evaluate(buildPayload(), buildRow({ userId: OWNER_USER_ID + 1 }));
        expect(result).toEqual({ kind: 'rejected', reason: 'AD_SESSION_OWNER_MISMATCH' });
    });

    it('отклоняет показ за пределами окна приёма', () => {
        const result = evaluate(
            buildPayload(),
            buildRow({ createdAt: new Date(NOW_MS - TTL_MS - 1) }),
        );
        expect(result).toEqual({ kind: 'rejected', reason: 'AD_SESSION_EXPIRED' });
    });

    it('отклоняет показ для vast_only-сессии', () => {
        const result = evaluate(
            buildPayload(),
            buildRow({ measurementMode: 'vast_only' }),
        );
        expect(result).toEqual({ kind: 'rejected', reason: 'AD_SESSION_NOT_MEASURABLE' });
    });

    it('отклоняет сессию без версии креатива', () => {
        const result = evaluate(
            buildPayload(),
            buildRow({
                creativeVersionId: null,
                creativeVersionUuid: null,
            }),
        );
        expect(result).toEqual({ kind: 'rejected', reason: 'AD_SESSION_CONTEXT_INCOMPLETE' });
    });

    it('берёт атрибуцию и skippable из ad_session', () => {
        const result = evaluate(
            buildPayload({
                placement_uuid: PLACEMENT_UUID,
                creative_version_uuid: CREATIVE_VERSION_UUID,
                measurement_mode: 'full_cpmind_player',
                delivery_mode: 'outstream',
                skippable: false,
            }),
            buildRow(),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context).toMatchObject({
            campaignLabel: 'spring_2026',
            creativeLabel: 'spring_video_01',
            campaignRefId: 'campaign-internal-id',
            creativeRefId: 'creative-internal-id',
            skippable: true,
            measurementMode: 'full_cpmind_player',
            tagConstantsVersion: 'v4',
            publisherDomain: PUBLISHER_DOMAIN,
            format: 'outstream',
            subtype: 'inpage',
            videoShowIndex: 0,
            sdkRuntimeVersion: 'player_v1',
            contextViolations: [],
        });
    });

    it('сохраняет версию констант сессии при расхождении с заявленной клиентом', () => {
        const result = evaluate(
            buildPayload({ tag_constants_version: 'v0' }),
            buildRow(),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.tagConstantsVersion).toBe('v4');
        expect(result.context.contextViolations).toEqual(['CLIENT_CONTEXT_MISMATCH']);
    });

    it('не сверяет версию констант для сессии без выданной версии', () => {
        const result = evaluate(
            buildPayload({ tag_constants_version: 'v0' }),
            buildRow({ tagConstantsVersion: null }),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.contextViolations).toEqual([]);
    });

    it('принимает показ с мягкими нарушениями в порядке приоритета', () => {
        const result = evaluate(
            buildPayload({ creative_type: 'banner_static' }),
            buildRow({
                placementIsActive: false,
                placementCreativeId: 'another-creative-id',
            }),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.contextViolations).toEqual([
            'PLACEMENT_INACTIVE',
            'PLACEMENT_CREATIVE_CHANGED',
            'CLIENT_CONTEXT_MISMATCH',
        ]);
        expect(result.context.creativeType).toBe('video_creative');
    });

    it('переопределение домена в плейсменте приоритетнее определённого сервером', () => {
        const result = evaluate(
            buildPayload(),
            buildRow({ placementPublisherDomain: 'override.example.com' }),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.publisherDomain).toBe('override.example.com');

        // Домен задан администратором намеренно, расхождение с клиентским
        // значением ожидаемо и нарушением не считается
        expect(result.context.contextViolations).toEqual([]);
    });

    it('домен SDK используется, когда сервер его не определил', () => {
        const result = evaluate(
            buildPayload({ publisher_domain: 'sdk.example.com' }),
            buildRow({ sessionPublisherDomain: null }),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.publisherDomain).toBe('sdk.example.com');
        expect(result.context.contextViolations).toEqual([]);
    });

    it('отмечает расхождение домена сессии с заявленным клиентом', () => {
        const result = evaluate(
            buildPayload({ publisher_domain: 'other.example.com' }),
            buildRow(),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.publisherDomain).toBe(PUBLISHER_DOMAIN);
        expect(result.context.contextViolations).toEqual(['PUBLISHER_DOMAIN_MISMATCH']);
    });

    it('отмечает чужой домен в режиме наблюдения', () => {
        const result = evaluate(
            buildPayload(),
            buildRow({ placementAllowedDomains: ['partner.ru'] }),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.contextViolations).toEqual(['ALLOWED_DOMAIN_MISMATCH']);
    });

    it('отклоняет показ с чужого домена в режиме блокировки', () => {
        const result = evaluate(
            buildPayload(),
            buildRow({
                placementAllowedDomains: ['partner.ru'],
                placementDomainEnforcement: 'block',
            }),
        );

        expect(result).toEqual({
            kind: 'rejected',
            reason: 'PUBLISHER_DOMAIN_NOT_ALLOWED',
        });
    });

    // Referrer-Policy издателя не должна отклонять достоверные показы
    it('принимает показ в режиме блокировки, когда домен не определён', () => {
        const result = evaluate(
            buildPayload({ publisher_domain: undefined }),
            buildRow({
                placementAllowedDomains: ['partner.ru'],
                placementDomainEnforcement: 'block',
                sessionPublisherDomain: null,
            }),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.publisherDomain).toBeNull();
        expect(result.context.contextViolations).toEqual([]);
    });

    it('принимает показ с разрешённого поддомена в режиме блокировки', () => {
        const result = evaluate(
            buildPayload(),
            buildRow({
                placementAllowedDomains: ['example.com'],
                placementDomainEnforcement: 'block',
            }),
        );

        expect(result.kind).toBe('hosted');
        if (result.kind !== 'hosted') return;

        expect(result.context.contextViolations).toEqual([]);
    });
});