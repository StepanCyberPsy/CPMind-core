import { parseConfig } from './config.js';
import { createSession } from './session.js';
import { initS1 } from './signals/s1.js';
import { initS2 } from './signals/s2.js';
import { initS3 } from './signals/s3.js';
import { initS4 } from './signals/s4.js';
import { initS5 } from './signals/s5.js';
import { initS7 } from './signals/s7.js';
import { initPresence } from './signals/presence.js';
import type { PresenceHandle } from './signals/presence.js';
import { attachUnloadHandlers } from './transport/send.js';
import { startNewSegment } from './segment.js';
import { DebugOverlay } from './debug/overlay.js';

(function (win: Window, doc: Document) {
  'use strict';

  try {
    init();
  } catch (e) {
    console.warn('[CPMind] Initialization error:', e);
  }

  function init(): void {
    const containers = doc.querySelectorAll<HTMLElement>('[data-cpmind-creative]');
    if (containers.length === 0) return;

    for (const container of containers) {
      const cfg = parseConfig(container);
      if (!cfg) {
        console.warn('[CPMind] Missing required data attributes on [data-cpmind-creative]:', container);
        continue;
      }

      const session = createSession(cfg);

      initS1(container, session, cfg);
      initS2(container, session, cfg);
      initS3(container, session, cfg);
      initS4(session, cfg);
      initS5(container, session, cfg);
      initS7(container, session, cfg);

      const presenceHandle = initPresence(session, cfg, () => {
        startNewSegment(container, session, cfg, presenceHandle);
      });

      if (cfg.debug) {
        new DebugOverlay(container, session);
      }

      attachUnloadHandlers(container, session, cfg, presenceHandle.cleanup);
    }
  }

})(window, document);