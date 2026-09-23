import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import {
    assets,
    campaigns,
    creatives,
    creativeVersionAssets,
    creativeVersions,
    tags,
    users,
} from '../src/db/schema.js';

// Предикат выборки ассета в collectAsset: строка берётся под FOR UPDATE SKIP LOCKED,
// затем в той же транзакции повторно проверяются ссылки
const GC_LOCK_SQL = `
    SELECT id, storage_key, asset_class
    FROM assets
    WHERE id = $1
    FOR UPDATE SKIP LOCKED
    LIMIT 1`;

const GC_LOCK_WAITING_SQL = `
    SELECT id
    FROM assets
    WHERE id = $1
    FOR UPDATE
    LIMIT 1`;

// Воспроизведение SQL из media-worker/src/db/queries.ts createAsset: пакет
// @cpmind/media-worker не является зависимостью backend и импортирован быть не может
const WORKER_CREATE_ASSET_SQL = `
    INSERT INTO assets (
        sha256,
        mime_type,
        extension,
        size_bytes,
        storage_key,
        asset_class,
        width,
        height,
        duration_sec,
        codec,
        bitrate_bps,
        status,
        processing_profile_version
    )
    VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, 'ready', $7)
    ON CONFLICT (sha256) DO NOTHING
    RETURNING id, storage_key AS "storageKey"`;

const LOCK_TIMEOUT_CODE = '55P03';

const createdAssetIds: string[] = [];
const createdVersionIds: string[] = [];
const createdCreativeIds: string[] = [];
const createdCampaignIds: string[] = [];

let ownerUserId: number;
let campaignId: string;
let creativeVersionId: string;

interface AssetFixture {
    id: string;
    sha256: string;
    storageKey: string;
}

async function resolveOwner(): Promise<number> {
    const [row] = await db
        .select({ userId: tags.userId })
        .from(tags)
        .innerJoin(users, eq(tags.userId, users.id))
        .where(eq(users.isActive, true))
        .limit(1);

    if (!row) {
        throw new Error('Не найден активный пользователь — фикстуры построить невозможно');
    }

    return row.userId;
}

// Ассет создаётся неиспользуемым и старше окна отсрочки GC: ровно то состояние,
// в котором fetchCandidates отбирает его к удалению
async function createUnreferencedAsset(): Promise<AssetFixture> {
    const sha256 = randomBytes(32).toString('hex');
    const storageKey = `assets/sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.png`;

    const [row] = await db
        .insert(assets)
        .values({
            sha256,
            mimeType: 'image/png',
            extension: 'png',
            sizeBytes: 2048,
            storageKey,
            assetClass: 'image',
            status: 'ready',
            processingProfileVersion: 'test',
            createdAt: new Date(Date.now() - 90 * 86_400_000),
        })
        .returning({ id: assets.id });

    if (!row) {
        throw new Error('Не удалось создать ассет-фикстуру');
    }

    createdAssetIds.push(row.id);

    return {
        id: row.id,
        sha256,
        storageKey,
    };
}

beforeAll(async () => {
    ownerUserId = await resolveOwner();

    const [campaign] = await db
        .insert(campaigns)
        .values({
            userId: ownerUserId,
            campaignKey: randomBytes(8).toString('hex'),
            name: `race_campaign_${randomBytes(4).toString('hex')}`,
            status: 'active',
        })
        .returning({ id: campaigns.id });

    if (!campaign) {
        throw new Error('Не удалось создать кампанию-фикстуру');
    }

    createdCampaignIds.push(campaign.id);
    campaignId = campaign.id;

    const [creative] = await db
        .insert(creatives)
        .values({
            userId: ownerUserId,
            campaignId,
            creativeKey: randomBytes(8).toString('hex'),
            creativeType: 'banner_static',
            name: `race_creative_${randomBytes(4).toString('hex')}`,
            status: 'processing',
        })
        .returning({ id: creatives.id });

    if (!creative) {
        throw new Error('Не удалось создать креатив-фикстуру');
    }

    createdCreativeIds.push(creative.id);

    const [version] = await db
        .insert(creativeVersions)
        .values({
            creativeId: creative.id,
            version: 1,
            status: 'processing',
        })
        .returning({ id: creativeVersions.id });

    if (!version) {
        throw new Error('Не удалось создать версию креатива-фикстуру');
    }

    createdVersionIds.push(version.id);
    creativeVersionId = version.id;
});

afterAll(async () => {
    if (createdVersionIds.length > 0) {
        await db
            .delete(creativeVersionAssets)
            .where(inArray(creativeVersionAssets.creativeVersionId, createdVersionIds));
        await db
            .update(creativeVersions)
            .set({ sourceAssetId: null })
            .where(inArray(creativeVersions.id, createdVersionIds));
        await db
            .delete(creativeVersions)
            .where(inArray(creativeVersions.id, createdVersionIds));
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

    await pool.end();
});

describe('Контракт блокировок, на который рассчитывает asset GC', () => {

    it('незанятый ассет берётся под FOR UPDATE SKIP LOCKED', async () => {
        const asset = await createUnreferencedAsset();
        const gc: PoolClient = await pool.connect();

        try {
            await gc.query('BEGIN');
            const locked = await gc.query(GC_LOCK_SQL, [asset.id]);

            expect(locked.rowCount).toBe(1);
            expect(locked.rows[0]?.storage_key).toBe(asset.storageKey);
        } finally {
            await gc.query('ROLLBACK');
            gc.release();
        }
    });

    // Вставка creative_version_assets берёт FOR KEY SHARE на строке assets по внешнему
    // ключу. Это и есть механизм, на который опирается комментарий в collectAsset
    it('незакоммиченная привязка ассета к версии заставляет GC пропустить строку', async () => {
        const asset = await createUnreferencedAsset();
        const worker: PoolClient = await pool.connect();
        const gc: PoolClient = await pool.connect();

        try {
            await worker.query('BEGIN');
            await worker.query(
                `INSERT INTO creative_version_assets (
                    creative_version_id,
                    asset_id,
                    role,
                    priority
                )
                VALUES ($1, $2, 'source', 0)`,
                [creativeVersionId, asset.id],
            );

            await gc.query('BEGIN');
            const locked = await gc.query(GC_LOCK_SQL, [asset.id]);

            expect(locked.rowCount).toBe(0);

            await gc.query('ROLLBACK');
        } finally {
            await worker.query('ROLLBACK');
            worker.release();
            gc.release();
        }
    });

    it('без SKIP LOCKED GC ожидает освобождения строки и упирается в lock_timeout', async () => {
        const asset = await createUnreferencedAsset();
        const worker: PoolClient = await pool.connect();
        const gc: PoolClient = await pool.connect();

        try {
            await worker.query('BEGIN');
            await worker.query(
                `INSERT INTO creative_version_assets (
                    creative_version_id,
                    asset_id,
                    role,
                    priority
                )
                VALUES ($1, $2, 'primary', 1)`,
                [creativeVersionId, asset.id],
            );

            await gc.query("SET lock_timeout = '300ms'");
            await gc.query('BEGIN');

            await expect(
                gc.query(GC_LOCK_WAITING_SQL, [asset.id]),
            ).rejects.toMatchObject({ code: LOCK_TIMEOUT_CODE });

            await gc.query('ROLLBACK');
        } finally {
            await worker.query('ROLLBACK');
            worker.release();
            gc.release();
        }
    });

    // Обратное направление: GC уже держит строку, привязка со стороны media-worker
    // ждёт его завершения вместо немедленной вставки
    it('удержание строки со стороны GC блокирует привязку ассета', async () => {
        const asset = await createUnreferencedAsset();
        const gc: PoolClient = await pool.connect();
        const worker: PoolClient = await pool.connect();

        try {
            await gc.query('BEGIN');
            const locked = await gc.query(GC_LOCK_SQL, [asset.id]);
            expect(locked.rowCount).toBe(1);

            await worker.query("SET lock_timeout = '300ms'");
            await worker.query('BEGIN');

            await expect(
                worker.query(
                    `INSERT INTO creative_version_assets (
                        creative_version_id,
                        asset_id,
                        role,
                        priority
                    )
                    VALUES ($1, $2, 'rendition_360', 2)`,
                    [creativeVersionId, asset.id],
                ),
            ).rejects.toMatchObject({ code: LOCK_TIMEOUT_CODE });

            await worker.query('ROLLBACK');
        } finally {
            await gc.query('ROLLBACK');
            gc.release();
            worker.release();
        }
    });
});

describe('Публикация ассета после его удаления сборщиком мусора', () => {

    // prepareProcessedFiles находит ассет по SHA-256 вне транзакции. Если GC успевает
    // закоммитить удаление до публикации, ON CONFLICT не срабатывает и создаётся новая
    // строка с тем же storage_key — контент-адресованный ключ детерминирован.
    // Объект в хранилище при этом восстановлен: загрузка выполняется всегда,
    // независимо от результата поиска по SHA-256
    it('после закоммиченного удаления создаётся новая строка с прежним storage_key', async () => {
        const asset = await createUnreferencedAsset();

        const worker: PoolClient = await pool.connect();

        try {
            const found = await worker.query(
                'SELECT id, storage_key AS "storageKey" FROM assets WHERE sha256 = $1 LIMIT 1',
                [asset.sha256],
            );

            expect(found.rowCount).toBe(1);
            expect(found.rows[0]?.storageKey).toBe(asset.storageKey);

            await db.delete(assets).where(eq(assets.id, asset.id));

            const republished = await worker.query(
                WORKER_CREATE_ASSET_SQL,
                [
                    asset.sha256,
                    'image/png',
                    'png',
                    2048,
                    asset.storageKey,
                    'image',
                    'test',
                ],
            );

            expect(republished.rowCount).toBe(1);
            expect(republished.rows[0]?.storageKey).toBe(asset.storageKey);
            expect(republished.rows[0]?.id).not.toBe(asset.id);

            createdAssetIds.push(republished.rows[0]!.id);
        } finally {
            worker.release();
        }
    });
});