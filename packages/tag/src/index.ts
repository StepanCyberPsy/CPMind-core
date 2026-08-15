import { parseConfig } from './config.js';
import { createSession } from './session.js';
import { collectFpHash } from './signals/headless.js';
import { initS1 } from './signals/s1.js';
import { initS2 } from './signals/s2.js';
import { initS3 } from './signals/s3.js';
import { initS4 } from './signals/s4.js';
import { initS5 } from './signals/s5.js';
import { initS6 } from './signals/s6.js';
import { initS7 } from './signals/s7.js';
import { initPresence } from './signals/presence.js';
import type { PresenceHandle } from './signals/presence.js';
import { attachUnloadHandlers } from './transport/send.js';
import { startNewSegment } from './segment.js';
import { DebugOverlay } from './debug/overlay.js';

(function (win: Window, doc: Document) {
  'use strict';

  const CREATIVE_SELECTOR = '[data-cpmind-creative]';

  const initializedContainers = new WeakSet<HTMLElement>();

  function initializeContainer(container: HTMLElement): void {
    if (initializedContainers.has(container)) return;

    const cfg = parseConfig(container);
    if (!cfg) {
      console.warn('[CPMind] Missing required data attributes on [data-cpmind-creative]:', container);
      return;
    }

    initializedContainers.add(container);

    try {
      const session = createSession(cfg);

      void collectFpHash().then((hash) => {
        session.fpHash = hash;
      });

      initS1(container, session, cfg);
      initS2(container, session, cfg);
      initS3(container, session, cfg);
      initS4(session, cfg);
      initS5(container, session, cfg);
      initS6(container, session);
      initS7(container, session, cfg);

      const presenceHandle = initPresence(session, cfg, () => {
        startNewSegment(container, session, cfg, presenceHandle);
      });

      if (cfg.debug) {
        new DebugOverlay(container, session);
      }

      attachUnloadHandlers(container, session, cfg, presenceHandle.cleanup);
    } catch (e) {
      console.warn('[CPMind] Creative initialization error:', e);
    }
  }

  function initializeFromNode(node: Node): void {
    if (!(node instanceof HTMLElement)) return;

    if (node.matches(CREATIVE_SELECTOR)) {
      initializeContainer(node);
    }

    const containers = node.querySelectorAll<HTMLElement>(CREATIVE_SELECTOR);

    for (const container of containers) {
      initializeContainer(container);
    }
  }

  function init(): void {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (
            mutation.target instanceof HTMLElement &&
            mutation.target.matches(CREATIVE_SELECTOR)
          ) {
            initializeContainer(mutation.target);
          }

          continue;
        }

        for (const node of mutation.addedNodes) {
          initializeFromNode(node);
        }
      }
    });

    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-cpmind-creative',
        'data-tag-uuid',
        'data-campaign-id',
        'data-creative-id',
        'data-creative-type',
        'data-endpoint',
      ],
    });

    const containers = doc.querySelectorAll<HTMLElement>(CREATIVE_SELECTOR);

    for (const container of containers) {
      initializeContainer(container);
    }
  }

  try {
    init();
  } catch (e) {
    console.warn('[CPMind] Initialization error:', e);
  }

})(window, document);