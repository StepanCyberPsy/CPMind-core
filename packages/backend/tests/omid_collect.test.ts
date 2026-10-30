import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import {
    adSessions,
    campaigns,
    creatives,
    creativeVersions,
    impressions,
    placements,
    tags,
    users,
} from '../src/db/schema.js';
import { omidRoute } from '../src/routes/omid.js';

let app: FastifyInstance;
let ownerUserId: number;
let ownerTagId: number;
let tagUuid: string;
let tagConstantsVersion: string;

let campaignId: string;
let campaignKey: string;
let creativeId: string;
let creativeKey: string;
let versionId: string;
let versionUuid: string;
let placementId: string;
let placementUuid: string;

const createdImpressionIds: string[] = [];
const createdSessionIds: string[] = [];

function buildPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        omid_runtime_version: '1',
        access_level: 'limited',
        page_collectors_loaded: false,
        sid: randomUUID(),
        tag_uuid: tagUuid,
        tag_constants_version: tagConstantsVersion,
        campaign_id: campaignKey,
        creative_id: creativeKey,
        creative_type: 'video_creative',
        placement_uuid: placementUuid,
        creative_version_uuid: versionUuid,
        delivery_kind: 'inline',
        device_type: 'desktop',
        timestamp_start: 1_700_000_000_000,
        timestamp_end: 1_700_000_015_000,
        signals: {
            s1: { time_in_view_sec: 12, max_continuous_view_sec: 9, visible_pixels_pct: 90 },
            s2: { share_of_screen_avg_pct: 6.25, share_of_screen_max_pct: 10 },
            s4: { tab_active_time_ms: 9000, tab_total_time_ms: 12000, tab_switches_count: 1 },
            s5: { clicked: false },
            s6: {
                play_initiated: true,
                quartile_25: true,
                quartile_50: true,
                quartile_75: false,
                completion: false,
                pause_initiated: false,
                skipped: false,
                volume_level: 70,
                muted_status: 'unmuted',
                audible_time_sec: 8,
                duration_sec: 30,
                no_output_device: false,
            },
        },
        ...overrides,
    };
}

async function createSession(sid: string): Promise<void> {
    await db.insert(adSessions).values({
        adSessionId: sid,
        placementId,
        creativeVersionId: versionId,
        userId: ownerUserId,
        tagId: ownerTagId,
        creativeType: 'video_creative',
        deliveryMode: 'outstream',
        format: 'outstream',
        subtype: 'inpage',
        measurementMode: 'vast_omid',
        tagConstantsVersion,
        vastRequestedAt: new Date(),
    });
    createdSessionIds.push(sid);
}

async function post(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/collect/omid', payload });
}

beforeAll(async () => {
    const [owner] = await db
        .select({ tagId: tags.id, userId: tags.userId, uuid: tags.uuid })
        .from(tags)
        .innerJoin(users, eq(tags.userId, users.id))
        .where(and(eq(tags.isActive, true), eq(users.isActive, true)))
        .limit(1);

    if (!owner) throw new Error('Не найден активный тег активного пользователя');

    ownerUserId = owner.userId;
    ownerTagId = owner.tagId;
    tagUuid = owner.uuid;

    const [session] = await db
        .select({ version: adSessions.tagConstantsVersion })
        .from(adSessions)
        .limit(1);

    tagConstantsVersion = session?.version ?? 'v0';

    campaignKey = randomBytes(8).toString('hex');
    const [campaign] = await db.insert(campaigns).values({
        userId: ownerUserId,
        campaignKey,
        name: `omid_${campaignKey}`,
        status: 'active',
    }).returning({ id: campaigns.id });
    campaignId = campaign!.id;

    creativeKey = randomBytes(8).toString('hex');
    const [creative] = await db.insert(creatives).values({
        userId: ownerUserId,
        campaignId,
        creativeKey,
        creativeType: 'video_creative',
        name: 'omid creative',
        status: 'ready',
    }).returning({ id: creatives.id });
    creativeId = creative!.id;

    const [version] = await db.insert(creativeVersions).values({
        creativeId,
        version: 1,
        externalVastUrl: 'https://ads.example.com/vast',
        status: 'ready',
        readyAt: new Date(),
    }).returning({ id: creativeVersions.id, uuid: creativeVersions.uuid });
    versionId = version!.id;
    versionUuid = version!.uuid;

    const [placement] = await db.insert(placements).values({
        userId: ownerUserId,
        campaignId,
        creativeId,
        tagId: ownerTagId,
        deliveryToken: randomBytes(24).toString('base64url'),
        mode: 'outstream',
        format: 'outstream',
        subtype: 'inpage',
        rotationMode: 'weighted_random',
        initialMuted: true,
        skippable: false,
        isActive: true,
    }).returning({ id: placements.id, uuid: placements.uuid });
    placementId = placement!.id;
    placementUuid = placement!.uuid;

    app = Fastify({ logger: false });
    await app.register(omidRoute, { prefix: '/api' });
    await app.ready();
});

afterAll(async () => {
    if (createdImpressionIds.length > 0) {
        await db.delete(impressions).where(inArray(impressions.impressionId, createdImpressionIds));
    }
    if (createdSessionIds.length > 0) {
        await db.delete(adSessions).where(inArray(adSessions.adSessionId, createdSessionIds));
    }
    await db.delete(placements).where(eq(placements.id, placementId));
    await db.delete(creativeVersions).where(eq(creativeVersions.id, versionId));
    await db.delete(creatives).where(eq(creatives.id, creativeId));
    await db.delete(campaigns).where(eq(campaigns.id, campaignId));

    await app.close();
    await pool.end();
});

describe('POST /api/collect/omid', () => {

    it('принимает частичный показ и пишет его без композитного Score', async () => {
        const sid = randomUUID();
        await createSession(sid);
        createdImpressionIds.push(sid);

        const response = await post(buildPayload({ sid }));
        expect(response.statusCode).toBe(202);

        const [row] = await db
            .select()
            .from(impressions)
            .where(eq(impressions.impressionId, sid))
            .limit(1);

        expect(row).toBeDefined();

        // Композитный Score и присутствие не рассчитываются: веса предполагают
        // полный набор сигналов, которого в этом режиме нет
        expect(row!.scoreFinal).toBeNull();
        expect(row!.fPresence).toBeNull();

        // Нормализованные значения обязательны: в кабинете пользователю видны
        // только они. Считаются теми же моделями, что для показов со скриптом
        for (const value of [row!.s1Normalized, row!.s2Normalized, row!.s4Normalized, row!.s5Normalized]) {
            expect(typeof value).toBe('number');
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(100);
        }

        expect(row!.s1ModelVersion).not.toBeNull();
        expect(row!.s6ModelVersion).not.toBeNull();

        // Не измеренные сигналы пусты и в сыром, и в нормализованном виде —
        // как S3 у показа в кросс-доменном iframe
        expect(row!.s3Normalized).toBeNull();
        expect(row!.s7Normalized).toBeNull();

        const raw = row!.signalsRaw as Record<string, unknown>;
        expect(raw['s3']).toBeNull();
        expect(raw['s7']).toBeNull();
        expect(raw['s1']).toMatchObject({ time_in_view_sec: 12, mrc_compliant: true });

        expect(row!.measurementMode).toBe('vast_omid');
        expect(row!.omidAccessMode).toBe('limited');
        expect(row!.vastDeliveryKind).toBe('inline');

        // Атрибуция берётся из сессии, а не из присланного показа
        expect(row!.adSessionId).toBe(sid);
        expect(row!.placementId).toBe(placementId);
        expect(row!.creativeVersionId).toBe(versionId);
        expect(row!.deviceType).toBe('desktop');
        expect(row!.s1RawTimeInView).toBe(12);
    });

    it('полный уровень без загруженных коллекторов понижается до creative', async () => {
        const sid = randomUUID();
        await createSession(sid);
        createdImpressionIds.push(sid);

        const response = await post(buildPayload({
            sid,
            access_level: 'full_page',
            page_collectors_loaded: false,
        }));

        expect(response.statusCode).toBe(202);

        const [row] = await db
            .select({ omidAccessMode: impressions.omidAccessMode })
            .from(impressions)
            .where(eq(impressions.impressionId, sid))
            .limit(1);

        // Неполный набор не должен выдаваться за полное измерение:
        // иначе показ попал бы в обучающую выборку моделей
        expect(row!.omidAccessMode).toBe('creative');
    });

    it('повторная отправка не создаёт второй показ', async () => {
        const sid = randomUUID();
        await createSession(sid);
        createdImpressionIds.push(sid);

        expect((await post(buildPayload({ sid }))).statusCode).toBe(202);
        expect((await post(buildPayload({ sid }))).statusCode).toBe(202);

        const rows = await db
            .select({ id: impressions.id })
            .from(impressions)
            .where(eq(impressions.impressionId, sid));

        expect(rows).toHaveLength(1);
    });

    it('отклоняет показ без существующей сессии', async () => {
        const response = await post(buildPayload({ sid: randomUUID() }));

        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({ code: 'AD_SESSION_NOT_FOUND' });
    });

    it('отклоняет показ с неизвестным тегом', async () => {
        const response = await post(buildPayload({ tag_uuid: randomUUID() }));
        expect(response.statusCode).toBe(422);
    });

    it('отклоняет payload с неполным набором сигналов', async () => {
        const sid = randomUUID();
        await createSession(sid);

        const payload = buildPayload({ sid }) as { signals: Record<string, unknown> };
        delete payload.signals['s6'];

        expect((await post(payload)).statusCode).toBe(422);
    });
});
