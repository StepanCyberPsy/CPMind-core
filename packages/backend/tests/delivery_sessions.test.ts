import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import {
    and,
    desc,
    eq,
    inArray,
} from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import {
    adSessions,
    assets,
    campaigns,
    creatives,
    creativeVersionAssets,
    creativeVersions,
    placementCreativeSet,
    placements,
    tags,
    users,
} from '../src/db/schema.js';
import { deliveryRoute } from '../src/routes/delivery.js';
import { vastRoute } from '../src/routes/vast.js';

const VAST_EMPTY_MARKER = '<VAST version="4.3" />';

interface CreativeFixture {
    creativeId: string;
    versionId: string;
    assetId: string;
}

interface PlacementFixture {
    placementId: string;
    deliveryToken: string;
}

const createdPlacementIds: string[] = [];
const createdVersionIds: string[] = [];
const createdCreativeIds: string[] = [];
const createdAssetIds: string[] = [];
const createdCampaignIds: string[] = [];

let app: FastifyInstance;
let ownerUserId: number;
let ownerTagId: number;
let campaignId: string;

let displayPlacement: PlacementFixture;
let outstreamPlacement: PlacementFixture;
let instreamPlacement: PlacementFixture;
let racePlacement: PlacementFixture;
let raceCreative: CreativeFixture;

let rotationPlacement: PlacementFixture;
let rotationFirst: CreativeFixture;
let rotationSecond: CreativeFixture;

// Владелец берётся из существующих данных: bootstrapAdmin гарантирует активного
// администратора с тегом, создавать второго пользователя в тесте нельзя —
// уникальность login и backfill legacy-показов затронут реальные строки
async function resolveOwner(): Promise<void> {
    const [row] = await db
        .select({
            tagId: tags.id,
            userId: tags.userId,
        })
        .from(tags)
        .innerJoin(users, eq(tags.userId, users.id))
        .where(and(
            eq(tags.isActive, true),
            eq(users.isActive, true),
        ))
        .limit(1);

    if (!row) {
        throw new Error('Не найден активный тег активного пользователя — фикстуры построить невозможно');
    }

    ownerUserId = row.userId;
    ownerTagId = row.tagId;
}

async function createCampaign(): Promise<string> {
    const [row] = await db
        .insert(campaigns)
        .values({
            userId: ownerUserId,
            campaignKey: randomBytes(8).toString('hex'),
            name: `test_campaign_${randomBytes(4).toString('hex')}`,
            status: 'active',
        })
        .returning({ id: campaigns.id });

    if (!row) {
        throw new Error('Не удалось создать кампанию-фикстуру');
    }

    createdCampaignIds.push(row.id);
    return row.id;
}

// Ассеты не выгружаются в хранилище: backend строит URL конкатенацией storageKey
// и никогда не обращается к файлу, поэтому ключ произвольный
async function createCreativeWithVersion(
    creativeType: 'banner_static' | 'video_creative',
    versionNumber: number,
    creativeId?: string,
): Promise<CreativeFixture> {
    const isVideo = creativeType === 'video_creative';

    const [asset] = await db
        .insert(assets)
        .values({
            sha256: randomBytes(32).toString('hex'),
            mimeType: isVideo ? 'video/mp4' : 'image/png',
            extension: isVideo ? 'mp4' : 'png',
            sizeBytes: 1024,
            storageKey: `test/${randomUUID()}.${isVideo ? 'mp4' : 'png'}`,
            assetClass: isVideo ? 'video' : 'image',
            width: isVideo ? 1280 : 300,
            height: isVideo ? 720 : 250,
            durationSec: isVideo ? 30 : null,
            codec: isVideo ? 'avc1.64001f' : null,
            bitrateBps: isVideo ? 1_500_000 : null,
            status: 'ready',
        })
        .returning({ id: assets.id });

    if (!asset) {
        throw new Error('Не удалось создать ассет-фикстуру');
    }

    createdAssetIds.push(asset.id);

    let resolvedCreativeId = creativeId;

    if (resolvedCreativeId === undefined) {
        const [creative] = await db
            .insert(creatives)
            .values({
                userId: ownerUserId,
                campaignId,
                creativeKey: randomBytes(8).toString('hex'),
                creativeType,
                name: `test_creative_${randomBytes(4).toString('hex')}`,
                status: 'active',
            })
            .returning({ id: creatives.id });

        if (!creative) {
            throw new Error('Не удалось создать креатив-фикстуру');
        }

        createdCreativeIds.push(creative.id);
        resolvedCreativeId = creative.id;
    }

    const [version] = await db
        .insert(creativeVersions)
        .values({
            creativeId: resolvedCreativeId,
            version: versionNumber,
            status: 'ready',
            readyAt: new Date(),
        })
        .returning({ id: creativeVersions.id });

    if (!version) {
        throw new Error('Не удалось создать версию креатива-фикстуру');
    }

    createdVersionIds.push(version.id);

    await db
        .insert(creativeVersionAssets)
        .values({
            creativeVersionId: version.id,
            assetId: asset.id,
            role: 'source',
            priority: 0,
        });

    return {
        creativeId: resolvedCreativeId,
        versionId: version.id,
        assetId: asset.id,
    };
}

const MODE_TAXONOMY: Readonly<Record<string, { format: string; subtype: string | null }>> = {
    display: { format: 'banner', subtype: null },
    outstream: { format: 'outstream', subtype: 'inpage' },
    instream_preroll: { format: 'instream', subtype: 'preroll' },
};

async function createPlacement(
    mode: 'display' | 'outstream' | 'instream_preroll',
    creativeId: string,
    rotationMode: 'weighted_random' | 'sequential' = 'weighted_random',
): Promise<PlacementFixture> {
    const deliveryToken = randomBytes(24).toString('base64url');
    const taxonomy = MODE_TAXONOMY[mode]!;

    const [row] = await db
        .insert(placements)
        .values({
            userId: ownerUserId,
            campaignId,
            creativeId,
            tagId: ownerTagId,
            deliveryToken,
            mode,
            format: taxonomy.format,
            subtype: taxonomy.subtype,
            rotationMode,
            initialMuted: true,
            skippable: false,
            isActive: true,
        })
        .returning({ id: placements.id });

    if (!row) {
        throw new Error('Не удалось создать плейсмент-фикстуру');
    }

    createdPlacementIds.push(row.id);

    return {
        placementId: row.id,
        deliveryToken,
    };
}

// Набор роликов вставляется напрямую: сервис плейсментов работает с uuid
// креативов, а фикстуры оперируют внутренними идентификаторами
async function attachCreativeSet(
    placementId: string,
    items: ReadonlyArray<{ creativeId: string; weightPct: number; displayOrder: number }>,
): Promise<void> {
    await db
        .insert(placementCreativeSet)
        .values(items.map((item) => ({
            placementId,
            creativeId: item.creativeId,
            weightPct: item.weightPct,
            displayOrder: item.displayOrder,
        })));
}

async function loadSessionById(
    adSessionId: string,
): Promise<typeof adSessions.$inferSelect> {
    const [row] = await db
        .select()
        .from(adSessions)
        .where(eq(adSessions.adSessionId, adSessionId))
        .limit(1);

    if (!row) {
        throw new Error('Ожидалась созданная ad_session, строка не найдена');
    }

    return row;
}

async function countSessions(placementId: string): Promise<number> {
    const rows = await db
        .select({ id: adSessions.adSessionId })
        .from(adSessions)
        .where(eq(adSessions.placementId, placementId));

    return rows.length;
}

async function loadLatestSession(
    placementId: string,
): Promise<typeof adSessions.$inferSelect> {
    const [latest] = await db
        .select()
        .from(adSessions)
        .where(eq(adSessions.placementId, placementId))
        .orderBy(desc(adSessions.createdAt))
        .limit(1);

    if (!latest) {
        throw new Error('Ожидалась созданная ad_session, строк не найдено');
    }

    return latest;
}

// Обработка delivery-события асинхронна: маршрут отвечает 204 до записи в БД
async function waitForMeasurementStart(
    adSessionId: string,
): Promise<Date | null> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const [row] = await db
            .select({ measurementStartedAt: adSessions.measurementStartedAt })
            .from(adSessions)
            .where(eq(adSessions.adSessionId, adSessionId))
            .limit(1);

        if (row?.measurementStartedAt != null) {
            return row.measurementStartedAt;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return null;
}

beforeAll(async () => {
    await resolveOwner();
    campaignId = await createCampaign();

    const displayCreative = await createCreativeWithVersion('banner_static', 1);
    const outstreamCreative = await createCreativeWithVersion('video_creative', 1);
    const instreamCreative = await createCreativeWithVersion('video_creative', 1);
    raceCreative = await createCreativeWithVersion('video_creative', 1);

    displayPlacement = await createPlacement('display', displayCreative.creativeId);
    outstreamPlacement = await createPlacement('outstream', outstreamCreative.creativeId);
    instreamPlacement = await createPlacement('instream_preroll', instreamCreative.creativeId);
    racePlacement = await createPlacement('instream_preroll', raceCreative.creativeId);

    rotationFirst = await createCreativeWithVersion('video_creative', 1);
    rotationSecond = await createCreativeWithVersion('video_creative', 1);

    // Основной креатив плейсмента совпадает с первым роликом набора:
    // так его задаёт сервис плейсментов при сохранении набора
    rotationPlacement = await createPlacement(
        'outstream',
        rotationFirst.creativeId,
        'sequential',
    );

    await attachCreativeSet(rotationPlacement.placementId, [
        {
            creativeId: rotationFirst.creativeId,
            weightPct: 50,
            displayOrder: 0,
        },
        {
            creativeId: rotationSecond.creativeId,
            weightPct: 50,
            displayOrder: 1,
        },
    ]);

    app = Fastify({ logger: false });
    app.register(deliveryRoute);
    app.register(vastRoute);
    await app.ready();
});

afterAll(async () => {
    if (createdPlacementIds.length > 0) {
        await db.delete(adSessions).where(inArray(adSessions.placementId, createdPlacementIds));
        await db
            .delete(placementCreativeSet)
            .where(inArray(placementCreativeSet.placementId, createdPlacementIds));
        await db.delete(placements).where(inArray(placements.id, createdPlacementIds));
    }

    if (createdVersionIds.length > 0) {
        await db
            .delete(creativeVersionAssets)
            .where(inArray(creativeVersionAssets.creativeVersionId, createdVersionIds));
        await db.delete(creativeVersions).where(inArray(creativeVersions.id, createdVersionIds));
    }

    if (createdCreativeIds.length > 0) {
        await db.delete(creatives).where(inArray(creatives.id, createdCreativeIds));
    }

    if (createdAssetIds.length > 0) {
        await db.delete(assets).where(inArray(assets.id, createdAssetIds));
    }

    if (createdCampaignIds.length > 0) {
        await db.delete(campaigns).where(inArray(campaigns.id, createdCampaignIds));
    }

    await app.close();
    await pool.end();
});

describe('Создание ad_session при доставке', () => {

    it('embed display создаёт ровно одну сессию в режиме full_direct_display', async () => {
        const before = await countSessions(displayPlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/e/${displayPlacement.deliveryToken}.js`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.body.length).toBeGreaterThan(0);

        const after = await countSessions(displayPlacement.placementId);
        expect(after - before).toBe(1);

        const session = await loadLatestSession(displayPlacement.placementId);
        expect(session.measurementMode).toBe('full_direct_display');
        expect(session.creativeVersionId).not.toBeNull();
        expect(session.tagConstantsVersion).not.toBeNull();
        expect(session.vastRequestedAt).toBeNull();
    });

    it('embed out-stream создаёт ровно одну сессию в режиме full_cpmind_player', async () => {
        const before = await countSessions(outstreamPlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/e/${outstreamPlacement.deliveryToken}.js`,
        });

        expect(response.statusCode).toBe(200);

        const after = await countSessions(outstreamPlacement.placementId);
        expect(after - before).toBe(1);

        const session = await loadLatestSession(outstreamPlacement.placementId);
        expect(session.measurementMode).toBe('full_cpmind_player');
    });

    it('embed in-stream не создаёт сессию и отдаёт adSessionId = null', async () => {
        const before = await countSessions(instreamPlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/e/${instreamPlacement.deliveryToken}.js`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('"adSessionId":null');

        const after = await countSessions(instreamPlacement.placementId);
        expect(after - before).toBe(0);
    });

    it('POST /api/delivery/session выдаёт сессию только для in-stream', async () => {
        const beforeInstream = await countSessions(instreamPlacement.placementId);

        const granted = await app.inject({
            method: 'POST',
            url: '/api/delivery/session',
            payload: { deliveryToken: instreamPlacement.deliveryToken },
        });

        expect(granted.statusCode).toBe(200);
        expect(granted.json<{ adSessionId: string }>().adSessionId).toMatch(
            /^[0-9a-f-]{36}$/,
        );
        expect(await countSessions(instreamPlacement.placementId) - beforeInstream).toBe(1);

        const beforeDisplay = await countSessions(displayPlacement.placementId);

        const refused = await app.inject({
            method: 'POST',
            url: '/api/delivery/session',
            payload: { deliveryToken: displayPlacement.deliveryToken },
        });

        expect(refused.statusCode).toBe(404);
        expect(await countSessions(displayPlacement.placementId) - beforeDisplay).toBe(0);
    });
});

describe('Привязка VAST к сессии', () => {

    it('VAST с валидным sid не создаёт вторую сессию', async () => {
        const granted = await app.inject({
            method: 'POST',
            url: '/api/delivery/session',
            payload: { deliveryToken: instreamPlacement.deliveryToken },
        });

        const { adSessionId } = granted.json<{ adSessionId: string }>();
        const before = await countSessions(instreamPlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/vast/${instreamPlacement.deliveryToken}?sid=${adSessionId}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('<InLine>');
        expect(response.body).not.toContain(VAST_EMPTY_MARKER);

        expect(await countSessions(instreamPlacement.placementId) - before).toBe(0);

        const [session] = await db
            .select({ vastRequestedAt: adSessions.vastRequestedAt })
            .from(adSessions)
            .where(eq(adSessions.adSessionId, adSessionId))
            .limit(1);

        expect(session?.vastRequestedAt).not.toBeNull();
    });

    it('VAST без sid создаёт отдельную сессию vast_only', async () => {
        const before = await countSessions(outstreamPlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/vast/${outstreamPlacement.deliveryToken}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('<InLine>');

        expect(await countSessions(outstreamPlacement.placementId) - before).toBe(1);

        const session = await loadLatestSession(outstreamPlacement.placementId);
        expect(session.measurementMode).toBe('vast_only');
        expect(session.vastRequestedAt).not.toBeNull();
    });

    it('VAST с sid чужого плейсмента отклоняется и не создаёт сессию', async () => {
        const granted = await app.inject({
            method: 'POST',
            url: '/api/delivery/session',
            payload: { deliveryToken: instreamPlacement.deliveryToken },
        });

        const { adSessionId } = granted.json<{ adSessionId: string }>();
        const before = await countSessions(outstreamPlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/vast/${outstreamPlacement.deliveryToken}?sid=${adSessionId}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain(VAST_EMPTY_MARKER);

        expect(await countSessions(outstreamPlacement.placementId) - before).toBe(0);
    });

    // Публикация новой ready-версии между выдачей сессии и запросом VAST не отменяет
    // рекламную возможность: версия, зафиксированная в сессии, авторитетна, по ней же
    // выполняется атрибуция показа
    it('новая ready-версия между выдачей сессии и VAST не отменяет показ', async () => {
        const granted = await app.inject({
            method: 'POST',
            url: '/api/delivery/session',
            payload: { deliveryToken: racePlacement.deliveryToken },
        });

        const { adSessionId } = granted.json<{ adSessionId: string }>();

        const sessionBeforeRace = await db
            .select({ creativeVersionId: adSessions.creativeVersionId })
            .from(adSessions)
            .where(eq(adSessions.adSessionId, adSessionId))
            .limit(1);

        expect(sessionBeforeRace[0]?.creativeVersionId).toBe(raceCreative.versionId);

        const [sessionVersion] = await db
            .select({ uuid: creativeVersions.uuid })
            .from(creativeVersions)
            .where(eq(creativeVersions.id, raceCreative.versionId))
            .limit(1);

        const newerVersion = await createCreativeWithVersion(
            'video_creative',
            2,
            raceCreative.creativeId,
        );

        expect(newerVersion.versionId).not.toBe(raceCreative.versionId);

        const before = await countSessions(racePlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/vast/${racePlacement.deliveryToken}?sid=${adSessionId}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('<InLine>');
        expect(response.body).not.toContain(VAST_EMPTY_MARKER);

        // Выдана версия сессии, а не опубликованная после её создания
        expect(response.body).toContain(sessionVersion!.uuid);

        expect(await countSessions(racePlacement.placementId) - before).toBe(0);

        const [session] = await db
            .select({
                vastRequestedAt: adSessions.vastRequestedAt,
                creativeVersionId: adSessions.creativeVersionId,
            })
            .from(adSessions)
            .where(eq(adSessions.adSessionId, adSessionId))
            .limit(1);

        expect(session?.vastRequestedAt).not.toBeNull();
        expect(session?.creativeVersionId).toBe(raceCreative.versionId);
    });
});

describe('Фиксация начала измерения', () => {

    it('measurement_started заполняет measurement_started_at и не перезаписывается', async () => {
        const granted = await app.inject({
            method: 'POST',
            url: '/api/delivery/session',
            payload: { deliveryToken: instreamPlacement.deliveryToken },
        });

        const { adSessionId } = granted.json<{ adSessionId: string }>();

        const first = await app.inject({
            method: 'POST',
            url: '/api/delivery/event',
            payload: {
                adSessionId,
                eventType: 'measurement_started',
                timestampMs: Date.now(),
            },
        });

        expect(first.statusCode).toBe(204);

        const startedAt = await waitForMeasurementStart(adSessionId);
        expect(startedAt).not.toBeNull();

        await app.inject({
            method: 'POST',
            url: '/api/delivery/event',
            payload: {
                adSessionId,
                eventType: 'measurement_started',
                timestampMs: Date.now() + 60_000,
            },
        });

        await new Promise((resolve) => setTimeout(resolve, 300));

        const [row] = await db
            .select({ measurementStartedAt: adSessions.measurementStartedAt })
            .from(adSessions)
            .where(eq(adSessions.adSessionId, adSessionId))
            .limit(1);

        expect(row?.measurementStartedAt?.getTime()).toBe(startedAt!.getTime());
    });

    it('delivery-событие несуществующей сессии не приводит к ошибке', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/delivery/event',
            payload: {
                adSessionId: randomUUID(),
                eventType: 'measurement_started',
                timestampMs: Date.now(),
            },
        });

        expect(response.statusCode).toBe(204);
    });
});

describe('Набор роликов и переход между ними', () => {

    async function issueRotationSession(): Promise<string> {
        const response = await app.inject({
            method: 'GET',
            url: `/e/${rotationPlacement.deliveryToken}.js`,
        });

        expect(response.statusCode).toBe(200);

        const session = await loadLatestSession(rotationPlacement.placementId);
        return session.adSessionId;
    }

    async function advance(
        deliveryToken: string,
        adSessionId: string,
    ): Promise<{ statusCode: number; videoShowIndex?: number }> {
        const response = await app.inject({
            method: 'POST',
            url: '/api/delivery/advance',
            payload: {
                deliveryToken,
                adSessionId,
            },
        });

        if (response.statusCode !== 200) {
            return { statusCode: response.statusCode };
        }

        return {
            statusCode: 200,
            videoShowIndex: response.json<{ videoShowIndex: number }>().videoShowIndex,
        };
    }

    it('первый ролик набора фиксируется в сессии с нулевым номером показа', async () => {
        const adSessionId = await issueRotationSession();
        const session = await loadSessionById(adSessionId);

        expect(session.videoShowIndex).toBe(0);
        expect(session.creativeVersionId).toBe(rotationFirst.versionId);
    });

    it('переход продвигает номер показа и подменяет версию креатива', async () => {
        const adSessionId = await issueRotationSession();

        const result = await advance(rotationPlacement.deliveryToken, adSessionId);

        expect(result.statusCode).toBe(200);
        expect(result.videoShowIndex).toBe(1);

        const session = await loadSessionById(adSessionId);
        expect(session.videoShowIndex).toBe(1);
        expect(session.creativeVersionId).toBe(rotationSecond.versionId);
    });

    it('последовательный набор зацикливается после последнего ролика', async () => {
        const adSessionId = await issueRotationSession();

        await advance(rotationPlacement.deliveryToken, adSessionId);
        const second = await advance(rotationPlacement.deliveryToken, adSessionId);

        expect(second.videoShowIndex).toBe(2);

        const session = await loadSessionById(adSessionId);
        expect(session.creativeVersionId).toBe(rotationFirst.versionId);
    });

    it('переход по чужому плейсменту отклоняется', async () => {
        const adSessionId = await issueRotationSession();

        const result = await advance(outstreamPlacement.deliveryToken, adSessionId);

        expect(result.statusCode).toBe(404);

        const session = await loadSessionById(adSessionId);
        expect(session.videoShowIndex).toBe(0);
    });

    it('переход для баннерного плейсмента отклоняется', async () => {
        const embed = await app.inject({
            method: 'GET',
            url: `/e/${displayPlacement.deliveryToken}.js`,
        });

        expect(embed.statusCode).toBe(200);

        const session = await loadLatestSession(displayPlacement.placementId);
        const result = await advance(displayPlacement.deliveryToken, session.adSessionId);

        expect(result.statusCode).toBe(404);
    });

    it('плейсмент без набора продолжает работать с основным креативом', async () => {
        const before = await countSessions(outstreamPlacement.placementId);

        const response = await app.inject({
            method: 'GET',
            url: `/e/${outstreamPlacement.deliveryToken}.js`,
        });

        expect(response.statusCode).toBe(200);
        expect(await countSessions(outstreamPlacement.placementId) - before).toBe(1);

        const session = await loadLatestSession(outstreamPlacement.placementId);
        expect(session.videoShowIndex).toBe(0);
        expect(session.creativeVersionId).not.toBeNull();
    });
});