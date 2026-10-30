import { sql, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adSessions } from '../../db/schema.js';
import type { VastTrackingRequest } from '@cpmind/shared';

export async function processVastTrackingEvent(
    request: VastTrackingRequest,
): Promise<void> {
    const updateFields: Record<string, unknown> = {
        lastSeenAt: new Date(),
    };

    switch (request.event) {
        case 'impression': {
            updateFields['vastImpressionAt'] =
                sql`COALESCE(${adSessions.vastImpressionAt}, NOW())`;
            break;
        }
        case 'start': {
            updateFields['videoStartedAt'] =
                sql`COALESCE(${adSessions.videoStartedAt}, NOW())`;
            break;
        }
        case 'firstQuartile': {
            updateFields['firstQuartileAt'] =
                sql`COALESCE(${adSessions.firstQuartileAt}, NOW())`;
            break;
        }
        case 'midpoint': {
            updateFields['midpointAt'] =
                sql`COALESCE(${adSessions.midpointAt}, NOW())`;
            break;
        }
        case 'thirdQuartile': {
            updateFields['thirdQuartileAt'] =
                sql`COALESCE(${adSessions.thirdQuartileAt}, NOW())`;
            break;
        }
        case 'complete': {
            updateFields['completedAt'] =
                sql`COALESCE(${adSessions.completedAt}, NOW())`;
            break;
        }
        case 'skip': {
            updateFields['skippedAt'] =
                sql`COALESCE(${adSessions.skippedAt}, NOW())`;
            break;
        }
        case 'error': {
            updateFields['errorAt'] =
                sql`COALESCE(${adSessions.errorAt}, NOW())`;
            if (request.code !== undefined) {
                updateFields['errorCode'] =
                    sql`COALESCE(${adSessions.errorCode}, ${request.code})`;
            }
            break;
        }
        case 'pause':
        case 'resume':
        case 'mute':
        case 'unmute':
        case 'rewind':
        case 'click':
        case 'creativeView':
        case 'progress':
        case 'closeLinear':
        case 'fullscreen':
        case 'exitFullscreen':
        case 'playerExpand':
        case 'playerCollapse':
        case 'acceptInvitationLinear':
        case 'otherAdInteraction':
        case 'notUsed': {
            break;
        }
        case 'verificationNotExecuted': {
            updateFields['omidVerificationNotExecutedAt'] =
                sql`COALESCE(${adSessions.omidVerificationNotExecutedAt}, NOW())`;
            if (request.reason !== undefined) {
                updateFields['omidNotExecutedReason'] =
                    sql`COALESCE(${adSessions.omidNotExecutedReason}, ${request.reason})`;
            }
            break;
        }
    }

    await db
        .update(adSessions)
        .set(updateFields as Parameters<ReturnType<typeof db.update>['set']>[0])
        .where(eq(adSessions.adSessionId, request.sid));
}