import type { Session, TagConfig } from './types.js';
import type { PresenceHandle } from './signals/presence.js';
import { resetSessionForNewSegment } from './session.js';
import { finalizeAndSend } from './transport/send.js';
import { resetSegmentS1 } from './signals/s1.js';
import { resetSegmentS2 } from './signals/s2.js';
import { resetSegmentS3 } from './signals/s3.js';
import { resetSegmentS4 } from './signals/s4.js';
import { resetSegmentS5 } from './signals/s5.js';
import { resetSegmentS6 } from './signals/s6.js';
import { resetSegmentS7 } from './signals/s7.js';

/**
 * Завершает текущий сегмент показа по факту простоя (вызывается из presence.ts через onIdle)
 * и открывает новый сегмент с тем же session_group_id.
 */
export function startNewSegment(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
  presenceHandle: PresenceHandle,
): void {
  finalizeAndSend(session, cfg, false);

  resetSessionForNewSegment(session);
  presenceHandle.resetSegment();
  resetSegmentS1(creativeEl, session, cfg);
  resetSegmentS2(session);
  resetSegmentS3(creativeEl);
  resetSegmentS4(session);
  resetSegmentS5(creativeEl);
  resetSegmentS6(session);
  resetSegmentS7(session);

  if (cfg.debug) {
    console.log('[CPMind Segment] New segment started:', {
      sessionGroupId: session.sessionGroupId,
      segmentIndex: session.segmentIndex,
      impressionId: session.impressionId,
    });
  }
}