import {
    eq,
    and,
    asc,
    desc,
    notInArray,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    creatives,
    campaigns,
    creativeVersions,
    creativeVersionAssets,
    assets,
} from '../db/schema.js';
import { getCdnBaseUrl } from '../lib/env.js';

export interface AssetView {
    id: string;
    role: string;
    priority: number;
    assetClass: string;
    mimeType: string;
    extension: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    codec: string | null;
    cdnUrl: string;
}

export interface CreativeVersionView {
    uuid: string;
    version: number;
    status: string;
    processingError: string | null;
    createdAt: string;
    readyAt: string | null;
    assets: AssetView[];
}

export interface CreativeListItem {
    uuid: string;
    campaignUuid: string;
    name: string;
    creativeType: string;
    clickUrl: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreativeDetail extends CreativeListItem {
    campaignUuid: string;
    versions: CreativeVersionView[];
}

function buildCdnUrl(storageKey: string): string {
    return `${getCdnBaseUrl()}/${storageKey}`;
}

function toAssetView(row: {
    id: string;
    role: string;
    priority: number;
    assetClass: string;
    mimeType: string;
    extension: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    codec: string | null;
    storageKey: string;
}): AssetView {
    return {
        id: row.id,
        role: row.role,
        priority: row.priority,
        assetClass: row.assetClass,
        mimeType: row.mimeType,
        extension: row.extension,
        sizeBytes: row.sizeBytes,
        width: row.width,
        height: row.height,
        durationSec: row.durationSec,
        codec: row.codec,
        cdnUrl: buildCdnUrl(row.storageKey),
    };
}

export async function listCreatives(userId: number): Promise<CreativeListItem[]> {
    const rows = await db
        .select({
            uuid: creatives.uuid,
            campaignUuid: campaigns.uuid,
            name: creatives.name,
            creativeType: creatives.creativeType,
            clickUrl: creatives.clickUrl,
            status: creatives.status,
            createdAt: creatives.createdAt,
            updatedAt: creatives.updatedAt,
        })
        .from(creatives)
        .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
        .where(
            and(
                eq(creatives.userId, userId),
                notInArray(creatives.status, ['draft', 'archived']),
            ),
        )
        .orderBy(desc(creatives.createdAt));

    return rows.map((row) => ({
        uuid: row.uuid,
        campaignUuid: row.campaignUuid,
        name: row.name,
        creativeType: row.creativeType,
        clickUrl: row.clickUrl,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }));
}

export async function getCreativeDetail(
    uuid: string,
    userId: number,
): Promise<CreativeDetail | null> {
    const [creative] = await db
        .select({
            id: creatives.id,
            uuid: creatives.uuid,
            campaignId: creatives.campaignId,
            name: creatives.name,
            creativeType: creatives.creativeType,
            clickUrl: creatives.clickUrl,
            status: creatives.status,
            createdAt: creatives.createdAt,
            updatedAt: creatives.updatedAt,
        })
        .from(creatives)
        .where(
            and(
                eq(creatives.uuid, uuid),
                eq(creatives.userId, userId),
            ),
        )
        .limit(1);

    if (!creative) return null;

    // campaign uuid: прямой lookup т.к. campaigns.id = uuid PK
    const [campaignRow] = await db
        .select({ uuid: campaigns.uuid })
        .from(campaigns)
        .where(eq(campaigns.id, creative.campaignId))
        .limit(1);

    const versions = await db
        .select({
            id: creativeVersions.id,
            uuid: creativeVersions.uuid,
            version: creativeVersions.version,
            status: creativeVersions.status,
            processingError: creativeVersions.processingError,
            createdAt: creativeVersions.createdAt,
            readyAt: creativeVersions.readyAt,
        })
        .from(creativeVersions)
        .where(eq(creativeVersions.creativeId, creative.id))
        .orderBy(desc(creativeVersions.version));

    const versionViews: CreativeVersionView[] = await Promise.all(
        versions.map(async (version) => {
            const assetRows = await db
                .select({
                    id: assets.id,
                    role: creativeVersionAssets.role,
                    priority: creativeVersionAssets.priority,
                    assetClass: assets.assetClass,
                    mimeType: assets.mimeType,
                    extension: assets.extension,
                    sizeBytes: assets.sizeBytes,
                    width: assets.width,
                    height: assets.height,
                    durationSec: assets.durationSec,
                    codec: assets.codec,
                    storageKey: assets.storageKey,
                })
                .from(creativeVersionAssets)
                .innerJoin(
                    assets,
                    eq(creativeVersionAssets.assetId, assets.id),
                )
                .where(
                    eq(creativeVersionAssets.creativeVersionId, version.id),
                )
                .orderBy(asc(creativeVersionAssets.priority));

            return {
                uuid: version.uuid,
                version: version.version,
                status: version.status,
                processingError: version.processingError,
                createdAt: version.createdAt.toISOString(),
                readyAt: version.readyAt?.toISOString() ?? null,
                assets: assetRows.map(toAssetView),
            };
        }),
    );

    return {
        uuid: creative.uuid,
        campaignUuid: campaignRow?.uuid ?? creative.campaignId,
        name: creative.name,
        creativeType: creative.creativeType,
        clickUrl: creative.clickUrl,
        status: creative.status,
        createdAt: creative.createdAt.toISOString(),
        updatedAt: creative.updatedAt.toISOString(),
        versions: versionViews,
    };
}

export async function archiveCreative(
    uuid: string,
    userId: number,
): Promise<boolean> {
    const result = await db
        .update(creatives)
        .set({
            status: 'archived',
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(creatives.uuid, uuid),
                eq(creatives.userId, userId),
                eq(creatives.status, 'active'),
            ),
        )
        .returning({ id: creatives.id });

    return result.length > 0;
}