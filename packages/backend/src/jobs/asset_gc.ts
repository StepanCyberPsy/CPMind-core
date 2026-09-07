import cron from 'node-cron';
import { and, lt, notExists, eq } from 'drizzle-orm';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db } from '../db/index.js';
import { assets, creativeVersionAssets } from '../db/schema.js';
import { createStorageClient } from '../services/storage/client.js';
import {
    getCdnBaseUrl,
    getDeliveryBucket,
    getSignerKeyId,
    getSignerSecret,
    getSourceBucket,
} from '../lib/env.js';

const GC_GRACE_DAYS = 45;
const GC_BATCH_SIZE = 100;

async function runAssetGc(): Promise<void> {
    const client = createStorageClient({
        keyId: getSignerKeyId(),
        secret: getSignerSecret(),
    });

    const sourceBucket = getSourceBucket();
    const deliveryBucket = getDeliveryBucket();

    const cutoff = new Date(Date.now() - GC_GRACE_DAYS * 86_400_000);

    const unreferenced = await db
        .select({
            id: assets.id,
            storageKey: assets.storageKey,
            assetClass: assets.assetClass,
        })
        .from(assets)
        .where(
            and(
                lt(assets.createdAt, cutoff),
                notExists(
                    db
                        .select()
                        .from(creativeVersionAssets)
                        .where(eq(creativeVersionAssets.assetId, assets.id)),
                ),
            ),
        )
        .limit(GC_BATCH_SIZE);

    for (const asset of unreferenced) {
        const bucket = asset.assetClass === 'source' ? sourceBucket : deliveryBucket;

        try {
            await client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: asset.storageKey,
            }));
        } catch (err: unknown) {
            const code = (err as { Code?: string }).Code;
            if (code !== 'NoSuchKey') {
                throw err;
            }
        }

        await db
            .delete(assets)
            .where(eq(assets.id, asset.id));
    }
}

export function startAssetGcJob(): void {
    cron.schedule('30 3 * * *', () => {
        void runAssetGc();
    });
}