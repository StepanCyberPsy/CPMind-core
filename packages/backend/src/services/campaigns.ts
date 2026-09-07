import { randomUUID } from 'node:crypto';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { campaigns } from '../db/schema.js';

export interface CampaignRow {
    uuid: string;
    campaignKey: string;
    name: string;
    status: 'active' | 'archived';
    createdAt: string;
    updatedAt: string;
}

function generateCampaignKey(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
}

function toCampaignRow(row: {
    uuid: string;
    campaignKey: string;
    name: string;
    status: 'active' | 'archived';
    createdAt: Date;
    updatedAt: Date;
}): CampaignRow {
    return {
        uuid: row.uuid,
        campaignKey: row.campaignKey,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export async function createCampaign(
    userId: number,
    name: string,
): Promise<CampaignRow> {
    for (let attempt = 0; attempt < 2; attempt++) {
        const campaignKey = generateCampaignKey();

        const [row] = await db
            .insert(campaigns)
            .values({
                userId,
                campaignKey,
                name,
                status: 'active',
            })
            .onConflictDoNothing()
            .returning({
                uuid: campaigns.uuid,
                campaignKey: campaigns.campaignKey,
                name: campaigns.name,
                status: campaigns.status,
                createdAt: campaigns.createdAt,
                updatedAt: campaigns.updatedAt,
            });

        if (row) return toCampaignRow(row);
    }

    throw new Error('Failed to generate unique campaign key after retries');
}

export async function listCampaigns(userId: number): Promise<CampaignRow[]> {
    const rows = await db
        .select({
            uuid: campaigns.uuid,
            campaignKey: campaigns.campaignKey,
            name: campaigns.name,
            status: campaigns.status,
            createdAt: campaigns.createdAt,
            updatedAt: campaigns.updatedAt,
        })
        .from(campaigns)
        .where(
            and(
                eq(campaigns.userId, userId),
                eq(campaigns.status, 'active'),
            ),
        )
        .orderBy(asc(campaigns.createdAt));

    return rows.map(toCampaignRow);
}

export async function getCampaignByUuid(
    uuid: string,
    userId: number,
): Promise<CampaignRow | null> {
    const [row] = await db
        .select({
            uuid: campaigns.uuid,
            campaignKey: campaigns.campaignKey,
            name: campaigns.name,
            status: campaigns.status,
            createdAt: campaigns.createdAt,
            updatedAt: campaigns.updatedAt,
        })
        .from(campaigns)
        .where(
            and(
                eq(campaigns.uuid, uuid),
                eq(campaigns.userId, userId),
            ),
        )
        .limit(1);

    return row ? toCampaignRow(row) : null;
}