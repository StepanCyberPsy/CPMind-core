import { sql, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adSessions } from '../../db/schema.js';
import type { DeliveryEventPayload } from '@cpmind/shared';

// Записывает lifecycle-событие в ad_sessions.
// COALESCE — первое событие каждого типа авторитетно, повторные игнорируются.
// Метки времени — серверные: часам клиента не доверяем.
// Best-effort: если сессия не найдена — завершается без ошибки.
export async function processDeliveryEvent(
    payload: DeliveryEventPayload,
): Promise<void> {
    const {
        adSessionId,
        eventType,
        errorCode,
        finalizationReason,
        autoplayOutcome,
        startMuted,
        mutedByBrowser,
    } = payload;

    const updateFields: Record<string, unknown> = {
        lastSeenAt: new Date(),
    };

    switch (eventType) {
        case 'requested': {
            break;
        }
        case 'asset_load_started': {
            updateFields['assetLoadStartedAt'] =
                sql`COALESCE(${adSessions.assetLoadStartedAt}, NOW())`;
            break;
        }
        case 'creative_ready': {
            updateFields['creativeReadyAt'] =
                sql`COALESCE(${adSessions.creativeReadyAt}, NOW())`;
            break;
        }
        case 'render_confirmed': {
            updateFields['renderConfirmedAt'] =
                sql`COALESCE(${adSessions.renderConfirmedAt}, NOW())`;
            break;
        }
        case 'autoplay_resolved': {
            if (autoplayOutcome !== undefined) {
                updateFields['autoplayOutcome'] =
                    sql`COALESCE(${adSessions.autoplayOutcome}, ${autoplayOutcome}::autoplay_outcome)`;
            }
            if (startMuted !== undefined) {
                updateFields['startMuted'] =
                    sql`COALESCE(${adSessions.startMuted}, ${startMuted})`;
            }
            if (mutedByBrowser !== undefined) {
                updateFields['mutedByBrowser'] =
                    sql`COALESCE(${adSessions.mutedByBrowser}, ${mutedByBrowser})`;
            }
            break;
        }
        case 'measurement_started': {
            updateFields['measurementStartedAt'] =
                sql`COALESCE(${adSessions.measurementStartedAt}, NOW())`;
            break;
        }
        case 'creative_error':
        case 'player_error': {
            updateFields['errorAt'] =
                sql`COALESCE(${adSessions.errorAt}, NOW())`;
            if (errorCode !== undefined) {
                updateFields['errorCode'] =
                    sql`COALESCE(${adSessions.errorCode}, ${errorCode})`;
            }
            if (finalizationReason !== undefined) {
                updateFields['finalizationReason'] =
                    sql`COALESCE(${adSessions.finalizationReason}, ${finalizationReason})`;
            }
            break;
        }
        case 'closed': {
            updateFields['measurementEndedAt'] =
                sql`COALESCE(${adSessions.measurementEndedAt}, NOW())`;
            if (finalizationReason !== undefined) {
                updateFields['finalizationReason'] =
                    sql`COALESCE(${adSessions.finalizationReason}, ${finalizationReason})`;
            }
            break;
        }
    }

    await db
        .update(adSessions)
        .set(updateFields as Parameters<typeof db.update>[0] extends never ? never : Record<string, unknown>)
        .where(eq(adSessions.adSessionId, adSessionId));
}