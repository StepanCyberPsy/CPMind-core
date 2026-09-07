import type { Session, SdkSignalConfig } from './types.js';
import type { PresenceHandle } from './signals/presence.js';
import { resetSessionForNewSegment } from './session.js';
import { finalizeAndSend } from './transport/send.js';
import type { SessionPayloadMeta } from './session.js';
import { resetSegmentS1 } from './signals/s1.js';
import { resetSegmentS2 } from './signals/s2.js';
import { resetSegmentS3 } from './signals/s3.js';
import { resetSegmentS4 } from './signals/s4.js';
import { resetSegmentS5 } from './signals/s5.js';
import { resetSegmentS7 } from './signals/s7.js';
import { resetS6Accumulator } from './signals/s6.js';

export function startNewSegment(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
    meta: SessionPayloadMeta,
    presenceHandle: PresenceHandle,
): void {
    finalizeAndSend(session, meta, config, false);
    resetSessionForNewSegment(session);
    presenceHandle.resetSegment();
    resetSegmentS1(creativeEl, session, config);
    resetSegmentS2(session);
    resetSegmentS3(creativeEl);
    resetSegmentS4(session, config);
    resetSegmentS5(creativeEl);

    // S6: сбрасываем accumulator если видео есть — DOM state хранит legacy adapter
    if (session.s6 !== null) {
        resetS6Accumulator(
            session.s6,
            0,
            true,
            false,
            true,
            0,
        );
    }

    resetSegmentS7(session);

    if (config.debug) {
        console.log('[CPMind Segment] New segment started:', {
            sessionGroupId: session.sessionGroupId,
            segmentIndex: session.segmentIndex,
            impressionId: session.impressionId,
        });
    }
}