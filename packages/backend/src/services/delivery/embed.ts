import {
    and,
    desc,
    eq,
    gt,
} from 'drizzle-orm';
import { pino } from 'pino';
import { db } from '../../db/index.js';
import {
    adSessions,
    assets,
    campaigns,
    creatives,
    creativeVersionAssets,
    creativeVersions,
    deliveryRuntimeConfigs,
    placements,
    tags,
} from '../../db/schema.js';
import {
    getAdSessionTtlMs,
    getCdnBaseUrl,
    getCollectEndpoint,
    getCreativeBaseUrl,
    getDeliveryBaseUrl,
    getDisplayRuntimeVersion,
    getLoaderRuntimeVersion,
    getPlayerRuntimeVersion,
} from '../../lib/env.js';
import {
    PlayerTimeoutsSchema,
    isInstreamFormat,
    isVideoFormat,
    toFormatSubtype,
} from '@cpmind/shared';
import type {
    CreativeType,
    DeliveryMode,
    MeasurementMode,
    PlacementFormat,
    PlacementSubtype,
    PlayerTimeouts,
    TagConstantsValues,
} from '@cpmind/shared';
import type { VastInLineInput, VastRendition } from '../vast/inline.js';
import type { VastWrapperInput } from '../vast/wrapper.js';
import type { OmidVerificationParams } from '../vast/verification.js';
import {
    resolveDeliveryTagConstants,
    type DeliveryTagConstantsFailure,
} from '../tag/tag_constants.js';
import {
    attachVastRequestToAdSession,
    createAdSession,
    type CreateAdSessionInput,
} from './sessions.js';
import {
    selectRotationCreative,
    toRotationMode,
    type RotationCandidate,
} from './creative_rotation.js';
import { placementCreativeSet } from '../../db/schema.js';

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

// Оба публичных endpoint отдают пустой ответ при любой проблеме резолва — реклама
// не должна ломать страницу издателя. Причина отказа при этом неразличима ни по
// коду ответа, ни по телу, поэтому фиксируется в логе структурированно
type DeliveryResolutionFailure =
    | 'PLACEMENT_NOT_FOUND_OR_INACTIVE'
    | 'NO_READY_CREATIVE_VERSION'
    | DeliveryTagConstantsFailure
    | 'NO_PRIMARY_ASSET'
    | 'NOT_VIDEO_CREATIVE'
    | 'NO_VAST_RENDITIONS'
    | 'NO_VAST_DURATION'
    | 'SESSION_MODE_NOT_INSTREAM'
    | 'AD_SESSION_NOT_ATTACHABLE'
    | 'SESSION_VERSION_NOT_AVAILABLE'
    | 'ROTATION_VERSION_NOT_READY';

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
    format: PlacementFormat;
    subtype: PlacementSubtype | null;
    rotationMode: string;
    plcmt: number | null;
    width: number | null;
    height: number | null;
    stickyCorner: string | null;
    stickyOffsetX: number | null;
    stickyOffsetY: number | null;
    stickyWidth: number | null;
    stickyHeight: number | null;
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
    creativeId: string;
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

// HTML5 измеряется полностью: S5 и присутствие внутри iframe подтверждаются хостом через creative-bridge
function resolveMeasurementMode(creativeType: string): MeasurementMode {
    if (creativeType === 'video_creative') return 'full_cpmind_player';
    return 'full_direct_display';
}

// SDK инлайнится в runtime-бандл, поэтому версия SDK фиксируется как версия бандла,
// выданного сервером для показа
function resolveRuntimeVersions(creativeType: string): {
    playerRuntimeVersion: string | null;
    sdkRuntimeVersion: string;
} {
    if (creativeType === 'video_creative') {
        const version = getPlayerRuntimeVersion();
        return {
            playerRuntimeVersion: version,
            sdkRuntimeVersion: `player_v${version}`,
        };
    }

    return {
        playerRuntimeVersion: null,
        sdkRuntimeVersion: `display_v${getDisplayRuntimeVersion()}`,
    };
}

function buildAdSessionInput(
    ctx: DeliveryContext,
    publisherDomain: string | null,
    measurementMode: MeasurementMode,
    vastRequested: boolean,
    videoShowIndex: number | null,
): CreateAdSessionInput {
    return {
        placementId: ctx.placementId,
        creativeVersionId: ctx.versionId,
        userId: ctx.userId,
        tagId: ctx.tagId,
        creativeType: ctx.creativeType as CreativeType,
        deliveryMode: ctx.mode as DeliveryMode,
        format: ctx.format,
        subtype: ctx.subtype,
        measurementMode,
        publisherDomain,
        autoplayRequested: ctx.autoplayMode === 'autoplay',
        initialMuted: ctx.initialMuted,
        tagConstantsVersion: ctx.tagConstantsVersion,
        vastRequested,
        videoShowIndex,
        ...resolveRuntimeVersions(ctx.creativeType),
    };
}

// Невалидный JSONB конфигурации не должен останавливать доставку: значения по умолчанию
// PlayerTimeoutsSchema совпадают с seed delivery_runtime_configs v1.0
function resolvePlayerTimeouts(
    raw: unknown,
    deliveryToken: string,
): PlayerTimeouts {
    const parsed = PlayerTimeoutsSchema.safeParse(raw ?? {});
    if (parsed.success) return parsed.data;

    logger.warn(
        {
            deliveryToken,
            issues: parsed.error.issues,
        },
        'Invalid delivery runtime timeouts — defaults applied',
    );

    return PlayerTimeoutsSchema.parse({});
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
            format: placements.format,
            subtype: placements.subtype,
            rotationMode: placements.rotationMode,
            plcmt: placements.plcmt,
            width: placements.width,
            height: placements.height,
            stickyCorner: placements.stickyCorner,
            stickyOffsetX: placements.stickyOffsetX,
            stickyOffsetY: placements.stickyOffsetY,
            stickyWidth: placements.stickyWidth,
            stickyHeight: placements.stickyHeight,
            autoplayMode: placements.autoplayMode,
            initialMuted: placements.initialMuted,
            skippable: placements.skippable,
            skipOffsetSec: placements.skipOffsetSec,
            clickUrl: placements.clickUrl,
            slotId: placements.slotId,
            videoSelector: placements.videoSelector,
            pinnedVersionId: placements.creativeVersionId,
            pinnedTagConstantsConfigId: placements.tagConstantsConfigId,
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

    const [versionAssets, tagConstants, runtimeRow] = await Promise.all([
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

        resolveDeliveryTagConstants(row.pinnedTagConstantsConfigId),

        db
            .select({ timeouts: deliveryRuntimeConfigs.timeouts })
            .from(deliveryRuntimeConfigs)
            .where(eq(deliveryRuntimeConfigs.isActive, true))
            .limit(1),
    ]);

    if (tagConstants.kind === 'unavailable') {
        logResolutionFailure(
            endpoint,
            deliveryToken,
            tagConstants.reason,
            {
                pinnedTagConstantsConfigId: row.pinnedTagConstantsConfigId,
                tagConstantsVersion: tagConstants.version,
            },
        );
        return null;
    }

    // Формат выводится из прежней модели, пока колонка допускает отсутствие значения
    const fallback = toFormatSubtype(row.mode as DeliveryMode);
    const format = (row.format as PlacementFormat | null) ?? fallback.format;
    const subtype = (row.subtype as PlacementSubtype | null) ?? fallback.subtype;

    return {
        placementId: row.placementId,
        placementUuid: row.placementUuid,
        deliveryToken,
        mode: row.mode,
        format,
        subtype,
        rotationMode: row.rotationMode,
        plcmt: row.plcmt,
        width: row.width,
        height: row.height,
        stickyCorner: row.stickyCorner,
        stickyOffsetX: row.stickyOffsetX,
        stickyOffsetY: row.stickyOffsetY,
        stickyWidth: row.stickyWidth,
        stickyHeight: row.stickyHeight,
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
        creativeId: row.creativeId,
        creativeType: row.creativeType,
        creativeKey: row.creativeKey,
        creativeName: row.creativeName,
        campaignKey: row.campaignKey,
        versionId,
        versionUuid: versionUuid!,
        versionAssets,
        tagConstantsVersion: tagConstants.version,
        tagConstants: tagConstants.constants,
        timeouts: resolvePlayerTimeouts(runtimeRow[0]?.timeouts, deliveryToken),
    };
}

// Набор роликов плейсмента. Пустой набор означает работу с одним креативом
async function loadRotationCandidates(
    placementId: string,
): Promise<RotationCandidate[]> {
    return db
        .select({
            creativeId: placementCreativeSet.creativeId,
            weightPct: placementCreativeSet.weightPct,
            displayOrder: placementCreativeSet.displayOrder,
        })
        .from(placementCreativeSet)
        .where(eq(placementCreativeSet.placementId, placementId));
}

// Подменяет креатив контекста выбранным по ротации. Версия перечитывается:
// каждый ролик набора — отдельный креатив со своей последней ready-версией
async function applyRotation(
    ctx: DeliveryContext,
    endpoint: string,
    showIndex: number,
    previousCreativeId: string | null,
): Promise<DeliveryContext | null> {
    const candidates = await loadRotationCandidates(ctx.placementId);

    const selected = selectRotationCreative({
        candidates,
        format: ctx.format,
        mode: toRotationMode(ctx.rotationMode),
        showIndex,
        previousCreativeId,
        random: Math.random,
    });

    if (selected === null) return ctx;
    if (selected.creativeId === ctx.creativeId) return ctx;

    const [creative] = await db
        .select({
            id: creatives.id,
            creativeType: creatives.creativeType,
            creativeKey: creatives.creativeKey,
            creativeName: creatives.name,
            clickUrl: creatives.clickUrl,
        })
        .from(creatives)
        .where(eq(creatives.id, selected.creativeId))
        .limit(1);

    const [version] = await db
        .select({
            id: creativeVersions.id,
            uuid: creativeVersions.uuid,
        })
        .from(creativeVersions)
        .where(and(
            eq(creativeVersions.creativeId, selected.creativeId),
            eq(creativeVersions.status, 'ready'),
        ))
        .orderBy(desc(creativeVersions.version))
        .limit(1);

    // Ролик без готовой версии не отдаётся: выдача продолжается с основным
    // креативом плейсмента вместо отказа во всей рекламной возможности
    if (!creative || !version) {
        logResolutionFailure(
            endpoint,
            ctx.deliveryToken,
            'ROTATION_VERSION_NOT_READY',
            { rotationCreativeId: selected.creativeId },
        );
        return ctx;
    }

    const versionAssets = await db
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
        .where(eq(creativeVersionAssets.creativeVersionId, version.id))
        .orderBy(creativeVersionAssets.priority);

    return {
        ...ctx,
        creativeId: creative.id,
        creativeType: creative.creativeType,
        creativeKey: creative.creativeKey,
        creativeName: creative.creativeName,
        clickUrl: ctx.clickUrl ?? creative.clickUrl,
        versionId: version.id,
        versionUuid: version.uuid,
        versionAssets,
    };
}

export async function resolveEmbedScript(
    deliveryToken: string,
    publisherDomain: string | null,
): Promise<string | null> {
    const baseCtx = await resolveDeliveryContext(deliveryToken, 'embed');
    if (!baseCtx) return null;

    // Первый ролик цикла выбирается при выдаче embed-скрипта
    const ctx = await applyRotation(baseCtx, 'embed', 0, null);
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

    const isVideo = isVideoFormat(ctx.format);
    const isInstream = isInstreamFormat(ctx.format);
    const deliveryBase = getDeliveryBaseUrl();
    const cdnBase = getCdnBaseUrl();
    const measurementMode = resolveMeasurementMode(ctx.creativeType);

    // In-stream: сессия выдаётся плееру в момент рекламной вставки через sessionEndpoint.
    // Создание при загрузке страницы порождало сессии без рекламной возможности
    const adSessionId = isInstream
        ? null
        : await createAdSession(buildAdSessionInput(
            ctx,
            publisherDomain,
            measurementMode,
            false,
            isVideo ? 0 : null,
        ));

    const queueEntry = {
        adSessionId,
        placementUuid: ctx.placementUuid,
        displayRuntimeVersion: getDisplayRuntimeVersion(),
        playerRuntimeVersion: getPlayerRuntimeVersion(),
        deliveryToken: ctx.deliveryToken,
        creativeVersionUuid: ctx.versionUuid,
        creativeType: ctx.creativeType,
        deliveryMode: ctx.mode,
        format: ctx.format,
        subtype: ctx.subtype,
        measurementMode,
        tagUuid: ctx.tagUuid,
        tagConstantsVersion: ctx.tagConstantsVersion,
        tagConstants: ctx.tagConstants,
        collectEndpoint: getCollectEndpoint(),
        deliveryEventEndpoint: `${deliveryBase}/api/delivery/event`,
        sessionEndpoint: `${deliveryBase}/api/delivery/session`,
        advanceEndpoint: `${deliveryBase}/api/delivery/advance`,
        vastUrl: isVideo ? `${deliveryBase}/vast/${ctx.deliveryToken}` : null,
        clickUrl: ctx.clickUrl,
        slotId: ctx.slotId,
        videoSelector: ctx.videoSelector,
        width: ctx.width,
        height: ctx.height,
        stickyCorner: ctx.stickyCorner,
        stickyOffsetX: ctx.stickyOffsetX,
        stickyOffsetY: ctx.stickyOffsetY,
        stickyWidth: ctx.stickyWidth,
        stickyHeight: ctx.stickyHeight,
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

    const mountLines: string[] = isInstream
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

// Выдача сессии для in-stream вставки. Для остальных режимов сессию создаёт embed —
// повторная выдача по публичному токену порождала бы сессии вне рекламной возможности
export async function issueAdSession(
    deliveryToken: string,
    publisherDomain: string | null,
): Promise<string | null> {
    const baseCtx = await resolveDeliveryContext(deliveryToken, 'session');
    if (!baseCtx) return null;

    if (!isInstreamFormat(baseCtx.format)) {
        logResolutionFailure(
            'session',
            deliveryToken,
            'SESSION_MODE_NOT_INSTREAM',
            {
                mode: baseCtx.mode,
                format: baseCtx.format,
            },
        );
        return null;
    }

    // Ролик выбирается в момент рекламной вставки и фиксируется в сессии:
    // запрос VAST с этим sid отдаст именно его
    const ctx = await applyRotation(baseCtx, 'session', 0, null);
    if (!ctx) return null;

    return createAdSession(buildAdSessionInput(
        ctx,
        publisherDomain,
        resolveMeasurementMode(ctx.creativeType),
        false,
        0,
    ));
}

// requestedAdSessionId — сессия, выданная плееру CPMind: VAST привязывается к ней.
// Без sid запрос пришёл от внешнего плеера — создаётся vast_only-сессия
// Ассеты версии, зафиксированной в сессии. Используется, когда версия сессии
// отличается от текущей ready-версии плейсмента: публикация новой версии не должна
// подменять ролик, который сервер уже назначил этой рекламной возможности
async function loadSessionVersion(
    creativeVersionId: string,
): Promise<{ versionId: string; versionUuid: string; versionAssets: VersionAssetRow[] } | null> {
    const [version] = await db
        .select({ uuid: creativeVersions.uuid })
        .from(creativeVersions)
        .where(eq(creativeVersions.id, creativeVersionId))
        .limit(1);

    if (!version) return null;

    const versionAssets = await db
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
        .where(eq(creativeVersionAssets.creativeVersionId, creativeVersionId))
        .orderBy(creativeVersionAssets.priority);

    return {
        versionId: creativeVersionId,
        versionUuid: version.uuid,
        versionAssets,
    };
}

// Продвигает рекламную сессию к следующему ролику набора. Сессия остаётся прежней:
// цикл out-stream — очередной показ внутри той же рекламной возможности.
// Строка берётся под блокировку: параллельные переходы увеличили бы номер дважды
export async function advanceAdSessionCreative(
    deliveryToken: string,
    adSessionId: string,
): Promise<{ videoShowIndex: number; creativeVersionUuid: string } | null> {
    const baseCtx = await resolveDeliveryContext(deliveryToken, 'advance');
    if (!baseCtx) return null;

    if (!isVideoFormat(baseCtx.format)) {
        logResolutionFailure(
            'advance',
            deliveryToken,
            'NOT_VIDEO_CREATIVE',
            { format: baseCtx.format },
        );
        return null;
    }

    const cutoff = new Date(Date.now() - getAdSessionTtlMs());

    return db.transaction(async (tx) => {
        const [session] = await tx
            .select({
                creativeVersionId: adSessions.creativeVersionId,
                videoShowIndex: adSessions.videoShowIndex,
            })
            .from(adSessions)
            .where(and(
                eq(adSessions.adSessionId, adSessionId),
                eq(adSessions.placementId, baseCtx.placementId),
                eq(adSessions.measurementMode, 'full_cpmind_player'),
                gt(adSessions.createdAt, cutoff),
            ))
            .for('update')
            .limit(1);

        if (!session) {
            logResolutionFailure(
                'advance',
                deliveryToken,
                'AD_SESSION_NOT_ATTACHABLE',
                { adSessionId },
            );
            return null;
        }

        // Ролик предыдущего показа исключается из розыгрыша, чтобы набор
        // не повторялся подряд
        let previousCreativeId: string | null = null;

        if (session.creativeVersionId !== null) {
            const [previousVersion] = await tx
                .select({ creativeId: creativeVersions.creativeId })
                .from(creativeVersions)
                .where(eq(creativeVersions.id, session.creativeVersionId))
                .limit(1);

            previousCreativeId = previousVersion?.creativeId ?? null;
        }

        const nextIndex = (session.videoShowIndex ?? 0) + 1;

        const ctx = await applyRotation(
            baseCtx,
            'advance',
            nextIndex,
            previousCreativeId,
        );

        if (!ctx) return null;

        await tx
            .update(adSessions)
            .set({
                creativeVersionId: ctx.versionId,
                videoShowIndex: nextIndex,
                lastSeenAt: new Date(),
            })
            .where(eq(adSessions.adSessionId, adSessionId));

        return {
            videoShowIndex: nextIndex,
            creativeVersionUuid: ctx.versionUuid,
        };
    });
}

// Форма ответа VAST: собственный InLine либо Wrapper поверх стороннего тега
export type VastRenderPlan =
    | { kind: 'inline'; input: VastInLineInput }
    | { kind: 'wrapper'; input: VastWrapperInput };

export async function resolveVastContext(
    deliveryToken: string,
    publisherDomain: string | null,
    requestedAdSessionId: string | null,
): Promise<{ plan: VastRenderPlan; adSessionId: string } | null> {
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

    let adSessionId: string;
    let versionId = ctx.versionId;
    let versionUuid = ctx.versionUuid;
    let versionAssets = ctx.versionAssets;

    if (requestedAdSessionId !== null) {
        const sessionVersionId = await attachVastRequestToAdSession(
            requestedAdSessionId,
            ctx.placementId,
        );

        if (sessionVersionId === null) {
            logResolutionFailure(
                'vast',
                deliveryToken,
                'AD_SESSION_NOT_ATTACHABLE',
                { adSessionId: requestedAdSessionId },
            );
            return null;
        }

        adSessionId = requestedAdSessionId;

        // Версия сессии авторитетна: ассеты перечитываются только при расхождении
        // с версией, выбранной по текущему состоянию плейсмента
        if (sessionVersionId !== ctx.versionId) {
            const sessionVersion = await loadSessionVersion(sessionVersionId);

            if (sessionVersion === null) {
                logResolutionFailure(
                    'vast',
                    deliveryToken,
                    'SESSION_VERSION_NOT_AVAILABLE',
                    {
                        adSessionId: requestedAdSessionId,
                        creativeVersionId: sessionVersionId,
                    },
                );
                return null;
            }

            versionId = sessionVersion.versionId;
            versionUuid = sessionVersion.versionUuid;
            versionAssets = sessionVersion.versionAssets;
        }
    } else {
        // Запрос без sid приходит от стороннего плеера. Ответ содержит блок
        // верификации OMID, поэтому сессия заводится измеряемой, а не vast_only:
        // фактический уровень доступа станет известен из показа
        adSessionId = await createAdSession(buildAdSessionInput(
            ctx,
            publisherDomain,
            'vast_omid',
            true,
            0,
        ));
    }

    const verification: OmidVerificationParams = {
        adSessionId,
        tagUuid: ctx.tagUuid,
        tagConstantsVersion: ctx.tagConstantsVersion,
        campaignKey: ctx.campaignKey,
        creativeKey: ctx.creativeKey,
        creativeType: ctx.creativeType,
        placementUuid: ctx.placementUuid,
        creativeVersionUuid: versionUuid,
        deliveryKind: 'inline',
        collectEndpoint: getCollectEndpoint(),
        deliveryMode: ctx.mode as DeliveryMode,
        tagConstants: ctx.tagConstants,
    };

    // Версия, заданная сторонним тегом, ассетов не имеет: CPMind отдаёт Wrapper
    // с собственным трекингом и блоком верификации поверх ответа адсервера клиента
    const externalVastUrl = await loadExternalVastUrl(versionId);

    if (externalVastUrl !== null) {
        return {
            adSessionId,
            plan: {
                kind: 'wrapper',
                input: {
                    adSessionId,
                    creativeVersionUuid: versionUuid,
                    vastAdTagUri: externalVastUrl,
                    skippable: ctx.skippable,
                    verification: { ...verification, deliveryKind: 'wrapper' },
                },
            },
        };
    }

    const renditions: VastRendition[] = versionAssets
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
                creativeVersionUuid: versionUuid,
                availableRoles: versionAssets.map((a) => a.role),
            },
        );
        return null;
    }

    let primaryAsset: VersionAssetRow | undefined;
    for (const role of VAST_PRIMARY_ASSET_ROLES) {
        primaryAsset = versionAssets.find(
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
                creativeVersionUuid: versionUuid,
                hasPrimaryAsset: primaryAsset !== undefined,
                durationSec,
                availableRoles: versionAssets.map((a) => a.role),
            },
        );
        return null;
    }

    return {
        adSessionId,
        plan: {
            kind: 'inline',
            input: {
                adSessionId,
                creativeVersionUuid: versionUuid,
                adTitle: ctx.creativeName,
                clickUrl: ctx.clickUrl,
                skippable: ctx.skippable,
                skipOffsetSec: ctx.skipOffsetSec,
                durationSec,
                renditions,

                // Скрипт верификации исполняется плеером площадки и о сессии ничего
                // не знает: всё, что ему нужно для показа, передаётся здесь
                verification,
            },
        },
    };
}

// Сторонний VAST-тег версии креатива. Отдельным запросом только на пути VAST:
// общая выборка контекста доставки используется и другими конечными точками,
// расширять её ради одного сценария не нужно
async function loadExternalVastUrl(creativeVersionId: string): Promise<string | null> {
    const [row] = await db
        .select({ externalVastUrl: creativeVersions.externalVastUrl })
        .from(creativeVersions)
        .where(eq(creativeVersions.id, creativeVersionId))
        .limit(1);

    return row?.externalVastUrl ?? null;
}