import { randomUUID } from 'node:crypto';
import {
    and,
    eq,
    gt,
    sql,
} from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adSessions } from '../../db/schema.js';
import { getAdSessionTtlMs } from '../../lib/env.js';
import type {
    CreativeType,
    DeliveryMode,
    MeasurementMode,
    PlacementFormat,
    PlacementSubtype,
} from '@cpmind/shared';

export interface CreateAdSessionInput {
    placementId: string;
    creativeVersionId: string | null;
    userId: number;
    tagId: number | null;
    creativeType: CreativeType;
    deliveryMode: DeliveryMode;
    format: PlacementFormat;
    subtype: PlacementSubtype | null;
    measurementMode: MeasurementMode;
    tagConstantsVersion: string;
    publisherDomain: string | null;
    autoplayRequested: boolean | null;
    initialMuted: boolean | null;
    playerRuntimeVersion: string | null;
    sdkRuntimeVersion: string | null;
    vastRequested: boolean;

    // Порядковый номер показа ролика в рекламной сессии. In-stream получает
    // один ролик на возможность, out-stream проигрывает набор по кругу
    videoShowIndex: number | null;
}

// Создаёт запись ad_session и возвращает сгенерированный adSessionId.
// Вызывается при выдаче embed-скрипта (display, outstream), при выдаче сессии
// для in-stream вставки и при запросе VAST без sid (внешний плеер)
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
        format: input.format,
        subtype: input.subtype,
        videoShowIndex: input.videoShowIndex,
        measurementMode: input.measurementMode,
        tagConstantsVersion: input.tagConstantsVersion,
        publisherDomain: input.publisherDomain,
        autoplayRequested: input.autoplayRequested,
        initialMuted: input.initialMuted,
        playerRuntimeVersion: input.playerRuntimeVersion,
        sdkRuntimeVersion: input.sdkRuntimeVersion,
        ...(input.vastRequested && { vastRequestedAt: new Date() }),
    });

    return adSessionId;
}

// Привязывает запрос VAST плеера CPMind к уже выданной сессии вместо создания новой
// и возвращает зафиксированную в ней версию креатива. Сессия должна принадлежать
// placement токена, измеряться плеером CPMind и находиться в окне приёма.
// Версия креатива не сверяется с текущей ready-версией плейсмента: публикация новой
// версии между выдачей сессии и запросом VAST отменяла бы рекламную возможность.
// Версия сессии авторитетна — по ней же выполняется атрибуция показа.
// Повторный запрос VAST в той же сессии допустим (цикл outstream) — первая отметка
// времени авторитетна
export async function attachVastRequestToAdSession(
    adSessionId: string,
    placementId: string,
): Promise<string | null> {
    const cutoff = new Date(Date.now() - getAdSessionTtlMs());

    const rows = await db
        .update(adSessions)
        .set({
            vastRequestedAt: sql`COALESCE(${adSessions.vastRequestedAt}, NOW())`,
            lastSeenAt: new Date(),
        })
        .where(and(
            eq(adSessions.adSessionId, adSessionId),
            eq(adSessions.placementId, placementId),
            eq(adSessions.measurementMode, 'full_cpmind_player'),
            gt(adSessions.createdAt, cutoff),
        ))
        .returning({ creativeVersionId: adSessions.creativeVersionId });

    return rows[0]?.creativeVersionId ?? null;
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