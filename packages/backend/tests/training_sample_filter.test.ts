import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    and,
    eq,
    inArray,
} from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { impressions, tags, users } from '../src/db/schema.js';
import {
    buildTrainableImpressionFilter,
    countSampleExclusions,
} from '../src/jobs/recalibration_sample.js';

/**
 * Проверяется предикат пригодности показа к обучению моделей, не доставка.
 * Все фикстуры создаются в режиме legacy_tag: он единственный не требует
 * ad_session (ограничение chk_impressions_hosted_ad_session), а отбор по уровню
 * доступа OMID от режима измерения не зависит. Исключение legacy при sdkOnly
 * проверяется отдельным случаем.
 */
const ACCESS_MODES: readonly (string | null)[] = [
    null,
    'full_page',
    'creative',
    'limited',
    'not_executed',
];

const TRAINABLE_ACCESS_MODES = [null, 'full_page'];

let ownerUserId: number;
let ownerTagId: number;
const createdIds: string[] = [];
const campaignId = `train-${randomUUID()}`;

beforeAll(async () => {
    const [owner] = await db
        .select({ tagId: tags.id, userId: tags.userId })
        .from(tags)
        .innerJoin(users, eq(tags.userId, users.id))
        .where(and(eq(tags.isActive, true), eq(users.isActive, true)))
        .limit(1);

    if (!owner) {
        throw new Error('Не найден активный тег активного пользователя — фикстуры построить невозможно');
    }

    ownerUserId = owner.userId;
    ownerTagId = owner.tagId;

    for (const accessMode of ACCESS_MODES) {
        const [row] = await db
            .insert(impressions)
            .values({
                impressionId: randomUUID(),
                tagId: ownerTagId,
                userId: ownerUserId,
                campaignId,
                creativeId: 'creative-train',
                creativeType: 'video_creative',
                deviceType: 'desktop',
                timestampStart: 1,
                timestampEnd: 2,
                signalsRaw: {},
                signalsNormalized: {},
                s5RawTopEvent: 'none',
                fPresence: 1,
                scoreFinal: 50,
                weightsVersion: 'test',
                measurementMode: 'legacy_tag',
                omidAccessMode: accessMode,
                scoreReliable: true,
            })
            .returning({ id: impressions.id });

        if (row) createdIds.push(row.id);
    }
});

afterAll(async () => {
    if (createdIds.length > 0) {
        await db.delete(impressions).where(inArray(impressions.id, createdIds));
    }
    await pool.end();
});

describe('buildTrainableImpressionFilter', () => {

    it('оставляет только показы без OMID и с полным доступом к странице', async () => {
        const rows = await db
            .select({ omidAccessMode: impressions.omidAccessMode })
            .from(impressions)
            .where(and(
                eq(impressions.campaignId, campaignId),
                buildTrainableImpressionFilter({ sdkOnly: false }),
            ));

        expect(rows.map((r) => r.omidAccessMode).sort()).toEqual(
            [...TRAINABLE_ACCESS_MODES].sort(),
        );
    });

    it('исключает ограниченные уровни доступа независимо от sdkOnly', async () => {
        const exclusions = await countSampleExclusions(
            eq(impressions.campaignId, campaignId),
            { sdkOnly: false },
        );

        expect(exclusions.candidates).toBe(ACCESS_MODES.length);
        expect(exclusions.restrictedAccess).toBe(
            ACCESS_MODES.length - TRAINABLE_ACCESS_MODES.length,
        );
    });

    it('сохраняет прежнее исключение показов legacy-тега при sdkOnly', async () => {
        const rows = await db
            .select({ id: impressions.id })
            .from(impressions)
            .where(and(
                eq(impressions.campaignId, campaignId),
                buildTrainableImpressionFilter({ sdkOnly: true }),
            ));

        expect(rows).toHaveLength(0);
    });
});
