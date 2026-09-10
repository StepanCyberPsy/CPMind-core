import { randomBytes } from 'node:crypto';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    placements,
    creatives,
    campaigns,
    creativeVersions,
    tags,
} from '../db/schema.js';
import { getDeliveryBaseUrl } from '../lib/env.js';
import { VIDEO_DELIVERY_MODES } from '@cpmind/shared';
import type {
    CreatePlacementPayload,
    DeliveryMode,
    UpdatePlacementPayload,
} from '@cpmind/shared';

// Типы ответа

export interface PlacementListItem {
    uuid: string;
    mode: string;
    isActive: boolean;
    creativeUuid: string;
    creativeName: string;
    creativeType: string;
    deliveryToken: string;
    createdAt: string;
    updatedAt: string;
}

export interface PlacementDetail {
    uuid: string;
    campaignUuid: string;
    creativeUuid: string;
    creativeName: string;
    creativeType: string;
    mode: string;
    plcmt: number | null;
    width: number | null;
    height: number | null;
    autoplayMode: string | null;
    initialMuted: boolean;
    skippable: boolean;
    skipOffsetSec: number | null;
    allowedDomains: string[] | null;
    slotId: string | null;
    videoSelector: string | null;
    clickUrl: string | null;
    isActive: boolean;
    deliveryToken: string;
    createdAt: string;
    updatedAt: string;
    // Delivery artifacts — null если creative_version не ready
    embedCode: string | null;
    vastUrl: string | null;
    currentVersionStatus: string | null;
    currentVersionError: string | null;
}

// Synthetic tag — создаётся автоматически при первом placement пользователя.
// Используется scoring pipeline для resolution tag → owner.
// При наличии нескольких тегов берётся наиболее ранний по id — детерминированный выбор.
async function ensureTagForUser(userId: number): Promise<number> {
    const existing = await db
        .select({ id: tags.id })
        .from(tags)
        .where(
            and(
                eq(tags.userId, userId),
                eq(tags.isActive, true),
            ),
        )
        .orderBy(asc(tags.id))
        .limit(1);

    if (existing[0]) return existing[0].id;

    const [created] = await db
        .insert(tags)
        .values({
            userId,
            label: 'cpmind-hosted',
            isActive: true,
        })
        .returning({ id: tags.id });

    if (!created) {
        throw new Error('Failed to create synthetic tag for user');
    }

    return created.id;
}

function generateDeliveryToken(): string {
    return randomBytes(24).toString('base64url');
}

function buildEmbedCode(
    token: string,
    slotId: string | null,
): string {
    const base = getDeliveryBaseUrl();
    const script = `<script async src="${base}/e/${token}.js"></script>`;

    if (slotId === null) return script;

    return `<div id="${slotId}"></div>\n${script}`;
}

function buildVastUrl(token: string): string {
    return `${getDeliveryBaseUrl()}/vast/${token}`;
}

export async function createPlacement(
    payload: CreatePlacementPayload,
    userId: number,
): Promise<PlacementDetail | null> {
    // Проверяем что campaign принадлежит пользователю
    const [campaign] = await db
        .select({ id: campaigns.id, uuid: campaigns.uuid })
        .from(campaigns)
        .where(
            and(
                eq(campaigns.uuid, payload.campaignUuid),
                eq(campaigns.userId, userId),
                eq(campaigns.status, 'active'),
            ),
        )
        .limit(1);

    if (!campaign) return null;

    // Проверяем что creative принадлежит пользователю и кампании
    const [creative] = await db
        .select({
            id: creatives.id,
            uuid: creatives.uuid,
            clickUrl: creatives.clickUrl,
            creativeType: creatives.creativeType,
            name: creatives.name,
        })
        .from(creatives)
        .where(
            and(
                eq(creatives.uuid, payload.creativeUuid),
                eq(creatives.userId, userId),
                eq(creatives.campaignId, campaign.id),
            ),
        )
        .limit(1);

    if (!creative) return null;

    // Получаем последнюю ready версию если есть
    const [latestVersion] = await db
        .select({
            id: creativeVersions.id,
            uuid: creativeVersions.uuid,
            status: creativeVersions.status,
            processingError: creativeVersions.processingError,
        })
        .from(creativeVersions)
        .where(eq(creativeVersions.creativeId, creative.id))
        .orderBy(desc(creativeVersions.version))
        .limit(1);

    const tagId = await ensureTagForUser(userId);
    const deliveryToken = generateDeliveryToken();

    // click_url: payload override → creative default
    const clickUrl = payload.clickUrl ?? creative.clickUrl ?? null;

    const [row] = await db
        .insert(placements)
        .values({
            userId,
            campaignId: campaign.id,
            creativeId: creative.id,
            creativeVersionId: latestVersion?.status === 'ready' ? latestVersion.id : null,
            tagId,
            deliveryToken,
            mode: payload.mode,
            plcmt: payload.plcmt ?? null,
            width: payload.width ?? null,
            height: payload.height ?? null,
            autoplayMode: payload.autoplayMode ?? null,
            initialMuted: payload.initialMuted ?? true,
            skippable: payload.skippable ?? false,
            skipOffsetSec: payload.skipOffsetSec ?? null,
            allowedDomains: payload.allowedDomains ?? null,
            slotId: payload.slotId ?? null,
            videoSelector: payload.videoSelector ?? null,
            clickUrl,
            isActive: true,
        })
        .returning({ uuid: placements.uuid });

    if (!row) throw new Error('Placement insert returned no row');

    return getPlacementDetail(row.uuid, userId);
}

export async function listPlacements(
    userId: number,
): Promise<PlacementListItem[]> {
    const rows = await db
        .select({
            uuid: placements.uuid,
            mode: placements.mode,
            isActive: placements.isActive,
            deliveryToken: placements.deliveryToken,
            createdAt: placements.createdAt,
            updatedAt: placements.updatedAt,
            creativeUuid: creatives.uuid,
            creativeName: creatives.name,
            creativeType: creatives.creativeType,
        })
        .from(placements)
        .innerJoin(creatives, eq(placements.creativeId, creatives.id))
        .where(eq(placements.userId, userId))
        .orderBy(desc(placements.createdAt));

    return rows.map((row) => ({
        uuid: row.uuid,
        mode: row.mode,
        isActive: row.isActive,
        deliveryToken: row.deliveryToken,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        creativeUuid: row.creativeUuid,
        creativeName: row.creativeName,
        creativeType: row.creativeType,
    }));
}

export async function getPlacementDetail(
    uuid: string,
    userId: number,
): Promise<PlacementDetail | null> {
    const [row] = await db
        .select({
            uuid: placements.uuid,
            mode: placements.mode,
            plcmt: placements.plcmt,
            width: placements.width,
            height: placements.height,
            autoplayMode: placements.autoplayMode,
            initialMuted: placements.initialMuted,
            skippable: placements.skippable,
            skipOffsetSec: placements.skipOffsetSec,
            allowedDomains: placements.allowedDomains,
            slotId: placements.slotId,
            videoSelector: placements.videoSelector,
            clickUrl: placements.clickUrl,
            isActive: placements.isActive,
            deliveryToken: placements.deliveryToken,
            createdAt: placements.createdAt,
            updatedAt: placements.updatedAt,
            creativeId: placements.creativeId,
            campaignId: placements.campaignId,
            creativeUuid: creatives.uuid,
            creativeName: creatives.name,
            creativeType: creatives.creativeType,
        })
        .from(placements)
        .innerJoin(creatives, eq(placements.creativeId, creatives.id))
        .where(
            and(
                eq(placements.uuid, uuid),
                eq(placements.userId, userId),
            ),
        )
        .limit(1);

    if (!row) return null;

    const [campaign] = await db
        .select({ uuid: campaigns.uuid })
        .from(campaigns)
        .where(eq(campaigns.id, row.campaignId))
        .limit(1);

    // Всегда берём актуальный статус последней версии — не из pinned creative_version_id
    const [latestVersion] = await db
        .select({
            uuid: creativeVersions.uuid,
            status: creativeVersions.status,
            processingError: creativeVersions.processingError,
        })
        .from(creativeVersions)
        .where(eq(creativeVersions.creativeId, row.creativeId))
        .orderBy(desc(creativeVersions.version))
        .limit(1);

    const isVersionReady = latestVersion?.status === 'ready';

    const embedCode = isVersionReady
        ? buildEmbedCode(row.deliveryToken, row.slotId)
        : null;
    const vastUrl = isVersionReady && VIDEO_DELIVERY_MODES.has(row.mode as DeliveryMode)
        ? buildVastUrl(row.deliveryToken)
        : null;

    return {
        uuid: row.uuid,
        campaignUuid: campaign?.uuid ?? '',
        creativeUuid: row.creativeUuid,
        creativeName: row.creativeName,
        creativeType: row.creativeType,
        mode: row.mode,
        plcmt: row.plcmt,
        width: row.width,
        height: row.height,
        autoplayMode: row.autoplayMode,
        initialMuted: row.initialMuted,
        skippable: row.skippable,
        skipOffsetSec: row.skipOffsetSec,
        allowedDomains: row.allowedDomains,
        slotId: row.slotId,
        videoSelector: row.videoSelector,
        clickUrl: row.clickUrl,
        isActive: row.isActive,
        deliveryToken: row.deliveryToken,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        embedCode,
        vastUrl,
        currentVersionStatus: latestVersion?.status ?? null,
        currentVersionError: latestVersion?.processingError ?? null,
    };
}

export async function updatePlacement(
    uuid: string,
    userId: number,
    payload: UpdatePlacementPayload,
): Promise<PlacementDetail | null> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (payload.mode !== undefined) updateData['mode'] = payload.mode;
    if (payload.plcmt !== undefined) updateData['plcmt'] = payload.plcmt;
    if (payload.width !== undefined) updateData['width'] = payload.width;
    if (payload.height !== undefined) updateData['height'] = payload.height;
    if (payload.autoplayMode !== undefined) updateData['autoplayMode'] = payload.autoplayMode;
    if (payload.initialMuted !== undefined) updateData['initialMuted'] = payload.initialMuted;
    if (payload.skippable !== undefined) updateData['skippable'] = payload.skippable;
    if (payload.skipOffsetSec !== undefined) updateData['skipOffsetSec'] = payload.skipOffsetSec;
    if (payload.allowedDomains !== undefined) updateData['allowedDomains'] = payload.allowedDomains;
    if (payload.slotId !== undefined) updateData['slotId'] = payload.slotId;
    if (payload.videoSelector !== undefined) updateData['videoSelector'] = payload.videoSelector;
    if (payload.clickUrl !== undefined) updateData['clickUrl'] = payload.clickUrl;

    const result = await db
        .update(placements)
        .set(updateData)
        .where(
            and(
                eq(placements.uuid, uuid),
                eq(placements.userId, userId),
            ),
        )
        .returning({ uuid: placements.uuid });

    if (!result[0]) return null;

    return getPlacementDetail(uuid, userId);
}

export async function setPlacementActive(
    uuid: string,
    userId: number,
    isActive: boolean,
): Promise<boolean> {
    const result = await db
        .update(placements)
        .set({ isActive, updatedAt: new Date() })
        .where(
            and(
                eq(placements.uuid, uuid),
                eq(placements.userId, userId),
            ),
        )
        .returning({ id: placements.id });

    return result.length > 0;
}