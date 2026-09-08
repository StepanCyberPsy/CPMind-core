import { randomUUID } from 'node:crypto';
import { sql, eq, and, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { campaigns, creatives } from '../db/schema.js';

export interface CampaignRow {
    uuid: string;
    campaignKey: string;
    name: string;
    status: 'active' | 'archived';
    createdAt: string;
    updatedAt: string;
}

export interface CampaignCreativeCounts {
    banner_static: number;
    banner_gif: number;
    banner_html5: number;
    video_creative: number;
    total: number;
}

export interface CampaignListRow extends CampaignRow {
    creativeCounts: CampaignCreativeCounts;
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

export async function listCampaigns(userId: number): Promise<CampaignListRow[]> {
    const rows = await db
        .select({
            uuid: campaigns.uuid,
            campaignKey: campaigns.campaignKey,
            name: campaigns.name,
            status: campaigns.status,
            createdAt: campaigns.createdAt,
            updatedAt: campaigns.updatedAt,
            bannerStatic: sql<number>`COALESCE(COUNT(${creatives.id}) FILTER (WHERE ${creatives.creativeType} = 'banner_static' AND ${creatives.status} NOT IN ('draft', 'archived')), 0)::int`,
            bannerGif: sql<number>`COALESCE(COUNT(${creatives.id}) FILTER (WHERE ${creatives.creativeType} = 'banner_gif' AND ${creatives.status} NOT IN ('draft', 'archived')), 0)::int`,
            bannerHtml5: sql<number>`COALESCE(COUNT(${creatives.id}) FILTER (WHERE ${creatives.creativeType} = 'banner_html5' AND ${creatives.status} NOT IN ('draft', 'archived')), 0)::int`,
            videoCreative: sql<number>`COALESCE(COUNT(${creatives.id}) FILTER (WHERE ${creatives.creativeType} = 'video_creative' AND ${creatives.status} NOT IN ('draft', 'archived')), 0)::int`,
        })
        .from(campaigns)
        .leftJoin(creatives, eq(creatives.campaignId, campaigns.id))
        .where(
            and(
                eq(campaigns.userId, userId),
                eq(campaigns.status, 'active'),
            ),
        )
        .groupBy(
            campaigns.id,
            campaigns.uuid,
            campaigns.campaignKey,
            campaigns.name,
            campaigns.status,
            campaigns.createdAt,
            campaigns.updatedAt,
        )
        .orderBy(asc(campaigns.createdAt));

    return rows.map((row) => {
        const bannerStatic = row.bannerStatic;
        const bannerGif = row.bannerGif;
        const bannerHtml5 = row.bannerHtml5;
        const videoCreative = row.videoCreative;

        return {
            uuid: row.uuid,
            campaignKey: row.campaignKey,
            name: row.name,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            creativeCounts: {
                banner_static: bannerStatic,
                banner_gif: bannerGif,
                banner_html5: bannerHtml5,
                video_creative: videoCreative,
                total: bannerStatic + bannerGif + bannerHtml5 + videoCreative,
            },
        };
    });
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