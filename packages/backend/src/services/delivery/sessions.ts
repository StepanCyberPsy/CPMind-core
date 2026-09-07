import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adSessions } from '../../db/schema.js';
import type { CreativeType, DeliveryMode, MeasurementMode } from '@cpmind/shared';

export interface CreateAdSessionInput {
    placementId: string;
    creativeVersionId: string | null;
    userId: number;
    tagId: number | null;
    creativeType: CreativeType;
    deliveryMode: DeliveryMode;
    measurementMode: MeasurementMode;
    publisherDomain: string | null;
    autoplayRequested: boolean | null;
    initialMuted: boolean | null;
    sdkRuntimeVersion?: string;
}

// Создаёт запись ad_session и возвращает сгенерированный adSessionId.
// Вызывается при генерации embed-скрипта и VAST — до первого клиентского события.
export async function createAdSession(
    input: CreateAdSessionInput,
): Promise<string> {
    const adSessionId = randomUUID();

    await db.insert(adSessions).values({
        adSessionId,
        placementId: input.placementId,
        creativeVersionId: input.creativeVersionId,
        userId: input.userId,
        tagId: input.tagId,
        creativeType: input.creativeType,
        deliveryMode: input.deliveryMode,
        measurementMode: input.measurementMode,
        publisherDomain: input.publisherDomain,
        autoplayRequested: input.autoplayRequested,
        initialMuted: input.initialMuted,
        ...(input.sdkRuntimeVersion !== undefined && {
            sdkRuntimeVersion: input.sdkRuntimeVersion,
        }),
    });

    return adSessionId;
}

export async function getAdSessionById(
    adSessionId: string,
): Promise<typeof adSessions.$inferSelect | null> {
    const [row] = await db
        .select()
        .from(adSessions)
        .where(eq(adSessions.adSessionId, adSessionId))
        .limit(1);

    return row ?? null;
}