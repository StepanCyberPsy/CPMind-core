import { randomBytes } from 'node:crypto';
import {
    eq,
    and,
    desc,
    asc,
    inArray,
    sql,
} from 'drizzle-orm';
import { pino } from 'pino';
import { db } from '../db/index.js';
import {
    placements,
    placementCreativeSet,
    creatives,
    campaigns,
    creativeVersions,
    tagConstantsConfigs,
    tags,
} from '../db/schema.js';
import { getDeliveryBaseUrl } from '../lib/env.js';
import {
    VIDEO_DELIVERY_MODES,
    resolveDefaultInitialMuted,
    resolvePlcmt,
    toFormatSubtype,
    isValidFormatSubtype,
} from '@cpmind/shared';
import type {
    CreatePlacementPayload,
    DeliveryMode,
    PlacementCreativeSetItem,
    PlacementFormat,
    PlacementSubtype,
    UpdatePlacementPayload,
} from '@cpmind/shared';

const logger = pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    name: 'placements',
});

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Ошибка сервиса плейсментов с HTTP-статусом и кодом для ответа маршрута
export class PlacementServiceError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly code: string,
    ) {
        super(message);
        this.name = 'PlacementServiceError';
    }
}

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

export interface PlacementCreativeSetView {
    creativeUuid: string;
    creativeName: string;
    weightPct: number;
    displayOrder: number;
}

export interface PlacementDetail {
    uuid: string;
    campaignUuid: string;
    creativeUuid: string;
    creativeName: string;
    creativeType: string;
    rotationMode: string;
    creativeSet: PlacementCreativeSetView[];
    mode: string;
    format: string | null;
    subtype: string | null;
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
    initialMutedOverridden: boolean;
    skippable: boolean;
    skipOffsetSec: number | null;
    allowedDomains: string[] | null;
    domainEnforcement: string;
    publisherDomain: string | null;
    slotId: string | null;
    videoSelector: string | null;
    clickUrl: string | null;
    // Закреплённая версия констант сбора — null означает версию по умолчанию
    tagConstantsConfigId: string | null;
    tagConstantsVersion: string | null;
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

// Закреплять можно только активную версию. FOR SHARE удерживает версию до конца транзакции:
// параллельная деактивация (FOR UPDATE) дождётся коммита и увидит закрепление
async function lockPinnableTagConstants(
    tx: Transaction,
    configId: string,
): Promise<void> {
    const [config] = await tx
        .select({
            id: tagConstantsConfigs.id,
            isActive: tagConstantsConfigs.isActive,
        })
        .from(tagConstantsConfigs)
        .where(eq(tagConstantsConfigs.id, configId))
        .for('share')
        .limit(1);

    if (!config) {
        throw new PlacementServiceError(
            'Версия констант не найдена',
            404,
            'TAG_CONSTANTS_NOT_FOUND',
        );
    }

    if (!config.isActive) {
        throw new PlacementServiceError(
            'Нельзя закрепить неактивную версию констант',
            409,
            'TAG_CONSTANTS_INACTIVE',
        );
    }
}

function generateDeliveryToken(): string {
    return randomBytes(24).toString('base64url');
}

// Набор роликов допустим только для видео и только из креативов той же кампании,
// принадлежащих владельцу плейсмента: иначе атрибуция показа сослалась бы
// на чужой креатив. Возвращает элементы набора в порядке показа
async function resolveCreativeSetItems(
    tx: Transaction,
    userId: number,
    campaignId: string,
    creativeType: string,
    items: readonly PlacementCreativeSetItem[],
): Promise<Array<{ creativeId: string; weightPct: number; displayOrder: number }>> {
    if (items.length === 0) return [];

    if (creativeType !== 'video_creative') {
        throw new PlacementServiceError(
            'Набор роликов допустим только для видеокреативов',
            422,
            'CREATIVE_SET_NOT_VIDEO',
        );
    }

    const uuids = items.map((item) => item.creativeUuid);

    const rows = await tx
        .select({
            id: creatives.id,
            uuid: creatives.uuid,
        })
        .from(creatives)
        .where(and(
            inArray(creatives.uuid, uuids),
            eq(creatives.userId, userId),
            eq(creatives.campaignId, campaignId),
            eq(creatives.creativeType, 'video_creative'),
        ));

    const idByUuid = new Map(rows.map((row) => [row.uuid, row.id]));

    return items
        .map((item) => {
            const creativeId = idByUuid.get(item.creativeUuid);

            if (creativeId === undefined) {
                throw new PlacementServiceError(
                    'Креатив набора не найден в кампании плейсмента',
                    422,
                    'CREATIVE_SET_ITEM_NOT_FOUND',
                );
            }

            return {
                creativeId,
                weightPct: item.weightPct,
                displayOrder: item.displayOrder,
            };
        })
        .sort((a, b) => a.displayOrder - b.displayOrder);
}

// Набор заменяется целиком: частичное редактирование давало бы промежуточные
// состояния с суммой весов, отличной от 100
async function replaceCreativeSet(
    tx: Transaction,
    placementId: string,
    resolved: ReadonlyArray<{ creativeId: string; weightPct: number; displayOrder: number }>,
): Promise<void> {
    await tx
        .delete(placementCreativeSet)
        .where(eq(placementCreativeSet.placementId, placementId));

    if (resolved.length === 0) return;

    await tx
        .insert(placementCreativeSet)
        .values(resolved.map((item) => ({
            placementId,
            creativeId: item.creativeId,
            weightPct: item.weightPct,
            displayOrder: item.displayOrder,
        })));
}

async function loadCreativeSet(
    placementId: string,
): Promise<PlacementCreativeSetView[]> {
    const rows = await db
        .select({
            creativeUuid: creatives.uuid,
            creativeName: creatives.name,
            weightPct: placementCreativeSet.weightPct,
            displayOrder: placementCreativeSet.displayOrder,
        })
        .from(placementCreativeSet)
        .innerJoin(creatives, eq(placementCreativeSet.creativeId, creatives.id))
        .where(eq(placementCreativeSet.placementId, placementId))
        .orderBy(asc(placementCreativeSet.displayOrder));

    return rows;
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
    const tagConstantsConfigId = payload.tagConstantsConfigId ?? null;

    const initialMutedOverridden = payload.initialMuted !== undefined;
    const initialMuted = initialMutedOverridden
        ? payload.initialMuted!
        : resolveDefaultInitialMuted(payload.mode);

    // Формат задаётся явно либо выводится из прежней модели. Подтип проверяется
    // на допустимость для формата до вставки: CHECK в БД вернул бы отказ без причины
    const derived = toFormatSubtype(payload.mode);
    const format = payload.format ?? derived.format;
    const subtype = payload.format !== undefined
        ? payload.subtype ?? null
        : derived.subtype;

    if (!isValidFormatSubtype(format, subtype)) {
        throw new PlacementServiceError(
            'Подтип размещения не соответствует формату',
            422,
            'PLACEMENT_SUBTYPE_INVALID',
        );
    }

    const row = await db.transaction(async (tx) => {
        if (tagConstantsConfigId !== null) {
            await lockPinnableTagConstants(tx, tagConstantsConfigId);
        }

        const resolvedSet = await resolveCreativeSetItems(
            tx,
            userId,
            campaign.id,
            creative.creativeType,
            payload.creativeSet ?? [],
        );

        // Основной креатив плейсмента — первый ролик набора: доставка использует
        // его, пока ротация не выбрала другой, и сверка контекста показа не считает
        // набор сменой креатива
        const primaryCreativeId = resolvedSet[0]?.creativeId ?? creative.id;

        const [inserted] = await tx
            .insert(placements)
            .values({
                userId,
                campaignId: campaign.id,
                creativeId: primaryCreativeId,
                creativeVersionId: latestVersion?.status === 'ready' ? latestVersion.id : null,
                tagId,
                deliveryToken,
                mode: payload.mode,
                format,
                subtype,
                plcmt: payload.plcmt ?? resolvePlcmt(format),
                width: payload.width ?? null,
                height: payload.height ?? null,
                stickyCorner: payload.stickyCorner ?? null,
                stickyOffsetX: payload.stickyOffsetX ?? null,
                stickyOffsetY: payload.stickyOffsetY ?? null,
                stickyWidth: payload.stickyWidth ?? null,
                stickyHeight: payload.stickyHeight ?? null,
                autoplayMode: payload.autoplayMode ?? null,
                initialMuted,
                initialMutedOverridden,
                skippable: payload.skippable ?? false,
                skipOffsetSec: payload.skipOffsetSec ?? null,
                allowedDomains: payload.allowedDomains ?? null,
                domainEnforcement: payload.domainEnforcement ?? 'monitor',
                publisherDomain: payload.publisherDomain ?? null,
                slotId: payload.slotId ?? null,
                videoSelector: payload.videoSelector ?? null,
                clickUrl,
                tagConstantsConfigId,
                rotationMode: payload.rotationMode ?? 'weighted_random',
                isActive: true,
            })
            .returning({
                id: placements.id,
                uuid: placements.uuid,
            });

        if (!inserted) {
            throw new Error('Placement insert returned no row');
        }

        await replaceCreativeSet(tx, inserted.id, resolvedSet);

        return inserted;
    });

    if (!row) throw new Error('Placement insert returned no row');

    if (tagConstantsConfigId !== null) {
        logger.info(
            {
                placementUuid: row.uuid,
                tagConstantsConfigId,
                userId,
            },
            'Tag constants version pinned to placement',
        );
    }

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
            id: placements.id,
            uuid: placements.uuid,
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
            initialMutedOverridden: placements.initialMutedOverridden,
            skippable: placements.skippable,
            skipOffsetSec: placements.skipOffsetSec,
            allowedDomains: placements.allowedDomains,
            domainEnforcement: placements.domainEnforcement,
            publisherDomain: placements.publisherDomain,
            slotId: placements.slotId,
            videoSelector: placements.videoSelector,
            clickUrl: placements.clickUrl,
            tagConstantsConfigId: placements.tagConstantsConfigId,
            tagConstantsVersion: tagConstantsConfigs.version,
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
        .leftJoin(tagConstantsConfigs, eq(placements.tagConstantsConfigId, tagConstantsConfigs.id))
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

    const creativeSet = await loadCreativeSet(row.id);
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
        rotationMode: row.rotationMode,
        creativeSet,
        mode: row.mode,
        format: row.format,
        subtype: row.subtype,
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
        initialMutedOverridden: row.initialMutedOverridden,
        skippable: row.skippable,
        skipOffsetSec: row.skipOffsetSec,
        allowedDomains: row.allowedDomains,
        domainEnforcement: row.domainEnforcement,
        publisherDomain: row.publisherDomain,
        slotId: row.slotId,
        videoSelector: row.videoSelector,
        clickUrl: row.clickUrl,
        tagConstantsConfigId: row.tagConstantsConfigId,
        tagConstantsVersion: row.tagConstantsVersion,
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

    if (payload.mode !== undefined) {
        updateData['mode'] = payload.mode;

        // Смена прежней модели переносится на новую, если формат не задан явно
        if (payload.format === undefined) {
            const derived = toFormatSubtype(payload.mode);
            updateData['format'] = derived.format;
            updateData['subtype'] = derived.subtype;
        }
    }

    if (payload.format !== undefined) {
        const subtype = payload.subtype ?? null;

        if (!isValidFormatSubtype(payload.format, subtype)) {
            throw new PlacementServiceError(
                'Подтип размещения не соответствует формату',
                422,
                'PLACEMENT_SUBTYPE_INVALID',
            );
        }

        updateData['format'] = payload.format;
        updateData['subtype'] = subtype;
    }

    if (payload.stickyCorner !== undefined) updateData['stickyCorner'] = payload.stickyCorner;
    if (payload.stickyOffsetX !== undefined) updateData['stickyOffsetX'] = payload.stickyOffsetX;
    if (payload.stickyOffsetY !== undefined) updateData['stickyOffsetY'] = payload.stickyOffsetY;
    if (payload.stickyWidth !== undefined) updateData['stickyWidth'] = payload.stickyWidth;
    if (payload.stickyHeight !== undefined) updateData['stickyHeight'] = payload.stickyHeight;
    if (payload.plcmt !== undefined) updateData['plcmt'] = payload.plcmt;
    if (payload.width !== undefined) updateData['width'] = payload.width;
    if (payload.height !== undefined) updateData['height'] = payload.height;
    if (payload.autoplayMode !== undefined) updateData['autoplayMode'] = payload.autoplayMode;

    // Явное значение закрепляет выбор пользователя. Смена формата без такого
    // значения пересчитывает умолчание, но не отменяет ранее сделанный выбор
    if (payload.initialMuted !== undefined) {
        updateData['initialMuted'] = payload.initialMuted;
        updateData['initialMutedOverridden'] = true;
    } else if (payload.mode !== undefined) {
        updateData['initialMuted'] = sql`CASE WHEN ${placements.initialMutedOverridden} THEN ${placements.initialMuted} ELSE ${resolveDefaultInitialMuted(payload.mode)} END`;
    }

    if (payload.skippable !== undefined) updateData['skippable'] = payload.skippable;
    if (payload.skipOffsetSec !== undefined) updateData['skipOffsetSec'] = payload.skipOffsetSec;
    if (payload.allowedDomains !== undefined) updateData['allowedDomains'] = payload.allowedDomains;
    if (payload.domainEnforcement !== undefined) updateData['domainEnforcement'] = payload.domainEnforcement;
    if (payload.publisherDomain !== undefined) updateData['publisherDomain'] = payload.publisherDomain;
    if (payload.slotId !== undefined) updateData['slotId'] = payload.slotId;
    if (payload.videoSelector !== undefined) updateData['videoSelector'] = payload.videoSelector;
    if (payload.clickUrl !== undefined) updateData['clickUrl'] = payload.clickUrl;
    if (payload.tagConstantsConfigId !== undefined) updateData['tagConstantsConfigId'] = payload.tagConstantsConfigId;

    if (payload.rotationMode !== undefined) updateData['rotationMode'] = payload.rotationMode;

    const pinnedConfigId = payload.tagConstantsConfigId;

    const result = await db.transaction(async (tx) => {
        if (typeof pinnedConfigId === 'string') {
            await lockPinnableTagConstants(tx, pinnedConfigId);
        }

        const [target] = await tx
            .select({
                id: placements.id,
                campaignId: placements.campaignId,
                creativeType: creatives.creativeType,
            })
            .from(placements)
            .innerJoin(creatives, eq(placements.creativeId, creatives.id))
            .where(and(
                eq(placements.uuid, uuid),
                eq(placements.userId, userId),
            ))
            .limit(1);

        if (!target) return [];

        if (payload.creativeSet !== undefined) {
            const resolvedSet = await resolveCreativeSetItems(
                tx,
                userId,
                target.campaignId,
                target.creativeType,
                payload.creativeSet,
            );

            await replaceCreativeSet(tx, target.id, resolvedSet);

            const primaryCreativeId = resolvedSet[0]?.creativeId;
            if (primaryCreativeId !== undefined) {
                updateData['creativeId'] = primaryCreativeId;
            }
        }

        return tx
            .update(placements)
            .set(updateData)
            .where(
                and(
                    eq(placements.uuid, uuid),
                    eq(placements.userId, userId),
                ),
            )
            .returning({ uuid: placements.uuid });
    });

    if (!result[0]) return null;

    if (pinnedConfigId !== undefined) {
        logger.info(
            {
                placementUuid: uuid,
                tagConstantsConfigId: pinnedConfigId,
                userId,
            },
            pinnedConfigId === null
                ? 'Tag constants version unpinned from placement'
                : 'Tag constants version pinned to placement',
        );
    }

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