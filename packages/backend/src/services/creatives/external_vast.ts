import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { CreateExternalVastCreative } from '@cpmind/shared';
import { db } from '../../db/index.js';
import { campaigns, creatives, creativeVersions } from '../../db/schema.js';
import {
    validateExternalVastTagUrl,
    type VastTagUrlRejection,
} from '../vast/url_policy.js';

const CREATIVE_KEY_CONSTRAINT = 'uidx_creatives_campaign_creative_key';

export type CreateExternalVastRejection =
    | 'CAMPAIGN_NOT_FOUND'
    | 'CREATIVE_KEY_TAKEN'
    | VastTagUrlRejection;

export type CreateExternalVastResult =
    | { ok: true; creativeUuid: string; versionUuid: string }
    | { ok: false; reason: CreateExternalVastRejection };

function generateCreativeKey(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
    return typeof err === 'object'
        && err !== null
        && 'constraint' in err
        && (err as { constraint?: string }).constraint === constraint;
}

/**
 * Видеокреатив, заданный сторонним VAST-тегом.
 *
 * Отличия от загрузки файла: ассетов нет, обработки нет, версия создаётся сразу
 * со статусом ready. Всё остальное — та же цепочка кампания → креатив → версия,
 * поэтому ротация, атрибуция показов и аналитика работают без изменений.
 */
export async function createExternalVastCreative(
    payload: CreateExternalVastCreative,
    userId: number,
): Promise<CreateExternalVastResult> {
    const urlCheck = validateExternalVastTagUrl(payload.vastTagUrl);
    if (!urlCheck.ok) {
        return { ok: false, reason: urlCheck.reason };
    }

    const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(
            eq(campaigns.uuid, payload.campaignUuid),
            eq(campaigns.userId, userId),
            eq(campaigns.status, 'active'),
        ))
        .limit(1);

    if (!campaign) {
        return { ok: false, reason: 'CAMPAIGN_NOT_FOUND' };
    }

    // Ключ, заданный пользователем, при коллизии возвращается ошибкой: повтор
    // с тем же значением результата не даст. Системный перегенерируется
    const attempts = payload.creativeKey !== undefined ? 1 : 3;
    let creativeId: string | null = null;
    let creativeUuid: string | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const [created] = await db
                .insert(creatives)
                .values({
                    userId,
                    campaignId: campaign.id,
                    creativeKey: payload.creativeKey ?? generateCreativeKey(),
                    creativeType: 'video_creative',
                    name: payload.name,
                    clickUrl: payload.clickUrl ?? null,
                    status: 'ready',
                })
                .returning({ id: creatives.id, uuid: creatives.uuid });

            if (created) {
                creativeId = created.id;
                creativeUuid = created.uuid;
                break;
            }
        } catch (err) {
            if (!isUniqueViolation(err, CREATIVE_KEY_CONSTRAINT)) throw err;
            if (payload.creativeKey !== undefined) {
                return { ok: false, reason: 'CREATIVE_KEY_TAKEN' };
            }
        }
    }

    if (creativeId === null || creativeUuid === null) {
        return { ok: false, reason: 'CREATIVE_KEY_TAKEN' };
    }

    const [version] = await db
        .insert(creativeVersions)
        .values({
            creativeId,
            version: 1,
            externalVastUrl: urlCheck.url,
            status: 'ready',
            readyAt: new Date(),
        })
        .returning({ uuid: creativeVersions.uuid });

    if (!version) {
        throw new Error('Failed to create external VAST creative version');
    }

    return { ok: true, creativeUuid, versionUuid: version.uuid };
}
