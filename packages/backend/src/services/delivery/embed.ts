import {
    and,
    desc,
    eq,
} from 'drizzle-orm';
import { pino } from 'pino';
import { db } from '../../db/index.js';
import {
    assets,
    campaigns,
    creatives,
    creativeVersionAssets,
    creativeVersions,
    deliveryRuntimeConfigs,
    placements,
    tagConstantsConfigs,
    tags,
} from '../../db/schema.js';
import {
    getCdnBaseUrl,
    getCollectEndpoint,
    getCreativeBaseUrl,
    getDeliveryBaseUrl,
    getDisplayRuntimeVersion,
    getLoaderRuntimeVersion,
    getPlayerRuntimeVersion,
} from '../../lib/env.js';
import {
    INSTREAM_DELIVERY_MODES,
    VIDEO_DELIVERY_MODES,
} from '@cpmind/shared';
import type {
    CreativeType,
    DeliveryMode,
    MeasurementMode,
    PlayerTimeouts,
    TagConstantsValues,
} from '@cpmind/shared';
import type { VastInLineInput, VastRendition } from '../vast/inline.js';
import { createAdSession } from './sessions.js';

const logger = pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    name: 'delivery-embed',
});

const DISPLAY_ASSET_ROLES = [
    'primary',
    'html_entry',
    'source'
] as const;

// Роль source присваивается процессором первой rendition для соблюдения инварианта
// assertProcessingResult — ровно один source-ассет на версию креатива. Для VAST это
// такой же полноценный MediaFile, как rendition_*, и должен попадать в выдачу
const VAST_RENDITION_ROLES = new Set([
    'source',
    'primary',
    'rendition_360',
    'rendition_720',
    'rendition_1080',
]);

// Порядок поиска ассета, несущего durationSec и являющегося основным медиафайлом.
// Совпадает по смыслу с DISPLAY_ASSET_ROLES: primary при нескольких rendition,
// source при единственной
const VAST_PRIMARY_ASSET_ROLES = [
    'primary',
    'source'
] as const;

const DEFAULT_TIMEOUTS: PlayerTimeouts = {
    configRequestMs: 5_000,
    vastRequestMs: 8_000,
    mediaStartMs: 15_000,
    firstFrameMs: 10_000,
    contentHandoffMs: 5_000,
    adLoadTotalMs: 30_000,
};

// Оба публичных endpoint отдают пустой ответ при любой проблеме резолва — реклама
// не должна ломать страницу издателя. Причина отказа при этом неразличима ни по
// коду ответа, ни по телу, поэтому фиксируется в логе структурированно
type DeliveryResolutionFailure =
    | 'PLACEMENT_NOT_FOUND_OR_INACTIVE'
    | 'NO_READY_CREATIVE_VERSION'
    | 'NO_ACTIVE_TAG_CONSTANTS'
    | 'NO_PRIMARY_ASSET'
    | 'NOT_VIDEO_CREATIVE'
    | 'NO_VAST_RENDITIONS'
    | 'NO_VAST_DURATION';

function logResolutionFailure(
    endpoint: string,
    deliveryToken: string,
    reason: DeliveryResolutionFailure,
    context?: Record<string, unknown>,
): void {
    logger.warn(
        {
            endpoint,
            deliveryToken,
            reason,
            ...context,
        },
        'Delivery resolution failed',
    );
}

interface VersionAssetRow {
    role: string;
    priority: number;
    storageKey: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    codec: string | null;
    bitrateBps: number | null;
}

interface DeliveryContext {
    placementId: string;
    placementUuid: string;
    deliveryToken: string;
    mode: string;
    plcmt: number | null;
    width: number | null;
    height: number | null;
    autoplayMode: string | null;
    initialMuted: boolean;
    skippable: boolean;
    skipOffsetSec: number | null;
    clickUrl: string | null;
    slotId: string | null;
    videoSelector: string | null;
    userId: number;
    tagId: number;
    tagUuid: string;
    creativeType: string;
    creativeKey: string;
    creativeName: string;
    campaignKey: string;
    versionId: string;
    versionUuid: string;
    versionAssets: VersionAssetRow[];
    tagConstantsVersion: string;
    tagConstants: TagConstantsValues;
    timeouts: PlayerTimeouts;
}

function resolveMeasurementMode(creativeType: string): MeasurementMode {
    if (creativeType === 'video_creative') return 'full_cpmind_player';
    if (creativeType === 'banner_html5') return 'partial_embedded_iframe';
    return 'full_direct_display';
}

function buildCdnUrl(storageKey: string): string {
    return `${getCdnBaseUrl()}/${storageKey}`;
}

function buildCreativeUrl(storageKey: string): string {
    return `${getCreativeBaseUrl()}/${storageKey}`;
}

async function resolveDeliveryContext(
    deliveryToken: string,
    endpoint: string,
): Promise<DeliveryContext | null> {
    const [row] = await db
        .select({
            placementId: placements.id,
            placementUuid: placements.uuid,
            mode: placements.mode,
            plcmt: placements.plcmt,
            width: placements.width,
            height: placements.height,
            autoplayMode: placements.autoplayMode,
            initialMuted: placements.initialMuted,
            skippable: placements.skippable,
            skipOffsetSec: placements.skipOffsetSec,
            clickUrl: placements.clickUrl,
            slotId: placements.slotId,
            videoSelector: placements.videoSelector,
            pinnedVersionId: placements.creativeVersionId,
            userId: placements.userId,
            tagId: placements.tagId,
            tagUuid: tags.uuid,
            creativeId: creatives.id,
            creativeType: creatives.creativeType,
            creativeKey: creatives.creativeKey,
            creativeName: creatives.name,
            creativeClickUrl: creatives.clickUrl,
            campaignKey: campaigns.campaignKey,
        })
        .from(placements)
        .innerJoin(creatives, eq(placements.creativeId, creatives.id))
        .innerJoin(campaigns, eq(placements.campaignId, campaigns.id))
        .innerJoin(tags, eq(placements.tagId, tags.id))
        .where(
            and(
                eq(placements.deliveryToken, deliveryToken),
                eq(placements.isActive, true),
            ),
        )
        .limit(1);

    if (!row) {
        logResolutionFailure(
            endpoint,
            deliveryToken,
            'PLACEMENT_NOT_FOUND_OR_INACTIVE',
        );
        return null;
    }

    // Версия: закреплённая (pinned) если ready, иначе последняя ready
    let versionId: string | null = row.pinnedVersionId;
    let versionUuid: string | null = null;

    if (versionId !== null) {
        const [pinned] = await db
            .select({
                id: creativeVersions.id,
                uuid: creativeVersions.uuid,
                status: creativeVersions.status,
            })
            .from(creativeVersions)
            .where(eq(creativeVersions.id, versionId))
            .limit(1);

        if (pinned?.status === 'ready') {
            versionUuid = pinned.uuid;
        } else {
            versionId = null;
        }
    }

    if (versionId === null) {
        const [latest] = await db
            .select({ id: creativeVersions.id, uuid: creativeVersions.uuid })
            .from(creativeVersions)
            .where(
                and(
                    eq(creativeVersions.creativeId, row.creativeId),
                    eq(creativeVersions.status, 'ready'),
                ),
            )
            .orderBy(desc(creativeVersions.version))
            .limit(1);

        if (!latest) {
            logResolutionFailure(
                endpoint,
                deliveryToken,
                'NO_READY_CREATIVE_VERSION',
                {
                    creativeKey: row.creativeKey,
                    pinnedVersionId: row.pinnedVersionId,
                },
            );
            return null;
        }

        versionId = latest.id;
        versionUuid = latest.uuid;
    }

    const [versionAssets, tagConstantsRow, runtimeRow] = await Promise.all([
        db
            .select({
                role: creativeVersionAssets.role,
                priority: creativeVersionAssets.priority,
                storageKey: assets.storageKey,
                mimeType: assets.mimeType,
                width: assets.width,
                height: assets.height,
                durationSec: assets.durationSec,
                codec: assets.codec,
                bitrateBps: assets.bitrateBps,
            })
            .from(creativeVersionAssets)
            .innerJoin(assets, eq(creativeVersionAssets.assetId, assets.id))
            .where(eq(creativeVersionAssets.creativeVersionId, versionId))
            .orderBy(creativeVersionAssets.priority),

        db
            .select({ version: tagConstantsConfigs.version, constants: tagConstantsConfigs.constants })
            .from(tagConstantsConfigs)
            .where(eq(tagConstantsConfigs.isActive, true))
            .orderBy(desc(tagConstantsConfigs.createdAt))
            .limit(1),

        db
            .select({ timeouts: deliveryRuntimeConfigs.timeouts })
            .from(deliveryRuntimeConfigs)
            .where(eq(deliveryRuntimeConfigs.isActive, true))
            .limit(1),
    ]);

    if (!tagConstantsRow[0]) {
        logResolutionFailure(
            endpoint,
            deliveryToken,
            'NO_ACTIVE_TAG_CONSTANTS',
        );
        return null;
    }

    return {
        placementId: row.placementId,
        placementUuid: row.placementUuid,
        deliveryToken,
        mode: row.mode,
        plcmt: row.plcmt,
        width: row.width,
        height: row.height,
        autoplayMode: row.autoplayMode,
        initialMuted: row.initialMuted,
        skippable: row.skippable,
        skipOffsetSec: row.skipOffsetSec,
        clickUrl: row.clickUrl ?? row.creativeClickUrl,
        slotId: row.slotId,
        videoSelector: row.videoSelector,
        userId: row.userId,
        tagId: row.tagId,
        tagUuid: row.tagUuid,
        creativeType: row.creativeType,
        creativeKey: row.creativeKey,
        creativeName: row.creativeName,
        campaignKey: row.campaignKey,
        versionId,
        versionUuid: versionUuid!,
        versionAssets,
        tagConstantsVersion: tagConstantsRow[0].version,
        tagConstants: tagConstantsRow[0].constants as TagConstantsValues,
        timeouts: (runtimeRow[0]?.timeouts as PlayerTimeouts | undefined) ?? DEFAULT_TIMEOUTS,
    };
}

export async function resolveEmbedScript(
    deliveryToken: string,
    publisherDomain: string | null,
): Promise<string | null> {
    const ctx = await resolveDeliveryContext(deliveryToken, 'embed');
    if (!ctx) return null;

    let primaryAsset: VersionAssetRow | undefined;
    for (const role of DISPLAY_ASSET_ROLES) {
        primaryAsset = ctx.versionAssets.find((a) => a.role === role);
        if (primaryAsset !== undefined) break;
    }

    if (primaryAsset === undefined) {
        logResolutionFailure(
            'embed',
            deliveryToken,
            'NO_PRIMARY_ASSET',
            {
                creativeVersionUuid: ctx.versionUuid,
                creativeType: ctx.creativeType,
                availableRoles: ctx.versionAssets.map((a) => a.role),
            },
        );
        return null;
    }

    const isVideo = VIDEO_DELIVERY_MODES.has(ctx.mode as DeliveryMode);
    const deliveryBase = getDeliveryBaseUrl();
    const cdnBase = getCdnBaseUrl();
    const measurementMode = resolveMeasurementMode(ctx.creativeType);

    const adSessionId = await createAdSession({
        placementId: ctx.placementId,
        creativeVersionId: ctx.versionId,
        userId: ctx.userId,
        tagId: ctx.tagId,
        creativeType: ctx.creativeType as CreativeType,
        deliveryMode: ctx.mode as DeliveryMode,
        measurementMode,
        publisherDomain,
        autoplayRequested: ctx.autoplayMode === 'autoplay',
        initialMuted: ctx.initialMuted,
    });

    const queueEntry = {
        adSessionId,
        placementUuid: ctx.placementUuid,
        displayRuntimeVersion: getDisplayRuntimeVersion(),
        playerRuntimeVersion: getPlayerRuntimeVersion(),
        deliveryToken: ctx.deliveryToken,
        creativeVersionUuid: ctx.versionUuid,
        creativeType: ctx.creativeType,
        deliveryMode: ctx.mode,
        tagUuid: ctx.tagUuid,
        tagConstantsVersion: ctx.tagConstantsVersion,
        tagConstants: ctx.tagConstants,
        collectEndpoint: getCollectEndpoint(),
        deliveryEventEndpoint: `${deliveryBase}/api/delivery/event`,
        sessionEndpoint: `${deliveryBase}/api/delivery/session`,
        vastUrl: isVideo ? `${deliveryBase}/vast/${ctx.deliveryToken}` : null,
        clickUrl: ctx.clickUrl,
        slotId: ctx.slotId,
        videoSelector: ctx.videoSelector,
        width: ctx.width,
        height: ctx.height,
        plcmt: ctx.plcmt,
        autoplay: ctx.autoplayMode === 'autoplay',
        initialMuted: ctx.initialMuted,
        skippable: ctx.skippable,
        skipOffsetSec: ctx.skipOffsetSec,
        timeouts: ctx.timeouts,
        campaignId: ctx.campaignKey,
        creativeId: ctx.creativeKey,
        assetUrl: ctx.creativeType === 'banner_html5'
            ? buildCreativeUrl(primaryAsset.storageKey)
            : buildCdnUrl(primaryAsset.storageKey),
    };

    const loaderUrl = `${cdnBase}/runtime/cpmind-loader_v${getLoaderRuntimeVersion()}.min.js`;
    const widthCss = ctx.width !== null ? `${ctx.width}px` : '100%';
    const heightCss = ctx.height !== null ? `${ctx.height}px` : 'auto';
    const configJson = JSON.stringify(queueEntry);

    const mountLines: string[] = INSTREAM_DELIVERY_MODES.has(ctx.mode as DeliveryMode)
        ? [
            "function mount(){",
            "if(document.body===null)return false;",
            "cfg.container=document.body;",
            "window.__CPMIND_QUEUE__.push(cfg);",
            "return true;",
            "}",
        ]
        : [
            "function mount(){",
            ctx.slotId !== null
                ? `var slot=document.getElementById(${JSON.stringify(ctx.slotId)});`
                : "var slot=document.body;",
            "if(slot===null)return false;",
            "var el=document.createElement('div');",
            `el.style.width=${JSON.stringify(widthCss)};`,
            `el.style.height=${JSON.stringify(heightCss)};`,
            "el.style.overflow='hidden';",
            "slot.appendChild(el);",
            "cfg.container=el;",
            "window.__CPMIND_QUEUE__.push(cfg);",
            "return true;",
            "}",
        ];

    const js = [
        "(function(){",
        "'use strict';",
        "window.__CPMIND_QUEUE__=window.__CPMIND_QUEUE__||[];",
        `var cfg=${configJson};`,
        ...mountLines,
        "if(!mount()){",
        "document.addEventListener('DOMContentLoaded',function(){mount();});",
        "}",
        "if(!window.__CPMIND_LOADER__){",
        "window.__CPMIND_LOADER__=true;",
        "var s=document.createElement('script');",
        `s.src=${JSON.stringify(loaderUrl)};`,
        "s.async=true;",
        "document.head.appendChild(s);",
        "}",
        "})();",
    ].join('\n');

    return js;
}

export async function issueAdSession(
    deliveryToken: string,
    publisherDomain: string | null,
): Promise<string | null> {
    const ctx = await resolveDeliveryContext(deliveryToken, 'session');
    if (!ctx) return null;

    return createAdSession({
        placementId: ctx.placementId,
        creativeVersionId: ctx.versionId,
        userId: ctx.userId,
        tagId: ctx.tagId,
        creativeType: ctx.creativeType as CreativeType,
        deliveryMode: ctx.mode as DeliveryMode,
        measurementMode: resolveMeasurementMode(ctx.creativeType),
        publisherDomain,
        autoplayRequested: ctx.autoplayMode === 'autoplay',
        initialMuted: ctx.initialMuted,
    });
}

export async function resolveVastContext(
    deliveryToken: string,
    publisherDomain: string | null,
): Promise<{ input: VastInLineInput; adSessionId: string } | null> {
    const ctx = await resolveDeliveryContext(deliveryToken, 'vast');
    if (!ctx) return null;

    if (ctx.creativeType !== 'video_creative') {
        logResolutionFailure(
            'vast',
            deliveryToken,
            'NOT_VIDEO_CREATIVE',
            { creativeType: ctx.creativeType },
        );
        return null;
    }

    const renditions: VastRendition[] = ctx.versionAssets
        .filter((a) => VAST_RENDITION_ROLES.has(a.role) && a.mimeType.startsWith('video/'))
        .map((a) => ({
            cdnUrl: buildCdnUrl(a.storageKey),
            mimeType: a.mimeType,
            width: a.width ?? 0,
            height: a.height ?? 0,
            bitrateKbps: a.bitrateBps !== null ? Math.round(a.bitrateBps / 1000) : null,
            codec: a.codec,
        }));

    if (renditions.length === 0) {
        logResolutionFailure(
            'vast',
            deliveryToken,
            'NO_VAST_RENDITIONS',
            {
                creativeVersionUuid: ctx.versionUuid,
                availableRoles: ctx.versionAssets.map((a) => a.role),
            },
        );
        return null;
    }

    let primaryAsset: VersionAssetRow | undefined;
    for (const role of VAST_PRIMARY_ASSET_ROLES) {
        primaryAsset = ctx.versionAssets.find(
            (a) => a.role === role && a.durationSec !== null,
        );
        if (primaryAsset !== undefined) break;
    }

    const durationSec = primaryAsset?.durationSec ?? null;

    if (durationSec === null || durationSec <= 0) {
        logResolutionFailure(
            'vast',
            deliveryToken,
            'NO_VAST_DURATION',
            {
                creativeVersionUuid: ctx.versionUuid,
                hasPrimaryAsset: primaryAsset !== undefined,
                durationSec,
                availableRoles: ctx.versionAssets.map((a) => a.role),
            },
        );
        return null;
    }

    const adSessionId = await createAdSession({
        placementId: ctx.placementId,
        creativeVersionId: ctx.versionId,
        userId: ctx.userId,
        tagId: ctx.tagId,
        creativeType: ctx.creativeType as CreativeType,
        deliveryMode: ctx.mode as DeliveryMode,
        measurementMode: 'full_cpmind_player',
        publisherDomain,
        autoplayRequested: ctx.autoplayMode === 'autoplay',
        initialMuted: ctx.initialMuted,
    });

    return {
        adSessionId,
        input: {
            adSessionId,
            creativeVersionUuid: ctx.versionUuid,
            adTitle: ctx.creativeName,
            clickUrl: ctx.clickUrl,
            skippable: ctx.skippable,
            skipOffsetSec: ctx.skipOffsetSec,
            durationSec,
            renditions,
        },
    };
}