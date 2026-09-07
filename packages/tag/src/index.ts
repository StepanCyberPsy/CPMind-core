import type {
  SdkSignalConfig,
  SessionPayloadMeta,
  PresenceHandle,
} from '@cpmind/sdk';
import {
  createSession,
  initS1,
  initS2,
  initS3,
  initS4,
  initS5,
  initS7,
  initPresence,
  collectFpHash,
  attachUnloadHandlers,
  startNewSegment,
  DebugOverlay,
} from '@cpmind/sdk';
import {
  initS6Legacy,
  resetSegmentS6Legacy,
} from './signals/s6_legacy.js';
import {
  PRESENCE_IDLE_TIMEOUT_MS,
  S1_VIEWPORT_THRESHOLDS,
  S2_SAMPLE_INTERVAL_MS,
  SCROLL_ZONE_PX,
  PAUSE_THRESHOLD_MS,
  STREAK_WINDOW_MS,
  STREAK_MIN_EVENTS,
  STREAK_MIN_SPEED,
  READING_SPEED_MAX,
  READING_TIME_MIN,
  SWIPE_MIN_DISTANCE_PX,
  ENTROPY_ANGLE_THRESHOLD,
  PROXIMITY_TRACK_ZONE_PX,
  PINCH_DELTA_MIN_PX,
  GESTURE_SCALE_DELTA_MIN,
  TAP_MAX_OFFSET_PX,
  TAP_MAX_DURATION_MS,
  MOUSE_MOVE_DEDUP_PX,
  S7_SAMPLE_INTERVAL_MS,
} from './constants.js';
import { parseConfig } from './config.js';
import type { TagConfig } from './types.js';

(function (doc: Document) {
  'use strict';

  const CREATIVE_SELECTOR = '[data-cpmind-creative]';
  const initializedContainers = new WeakSet<HTMLElement>();

  // Мост между baked-in esbuild-константами и SdkSignalConfig
  function createSdkConfig(debug: boolean): SdkSignalConfig {
    return {
      debug,
      constants: {
        PRESENCE_IDLE_TIMEOUT_MS,
        S1_VIEWPORT_THRESHOLDS,
        S2_SAMPLE_INTERVAL_MS,
        SCROLL_ZONE_PX,
        PAUSE_THRESHOLD_MS,
        STREAK_WINDOW_MS,
        STREAK_MIN_EVENTS,
        STREAK_MIN_SPEED,
        READING_SPEED_MAX,
        READING_TIME_MIN,
        SWIPE_MIN_DISTANCE_PX,
        ENTROPY_ANGLE_THRESHOLD,
        PROXIMITY_TRACK_ZONE_PX,
        PINCH_DELTA_MIN_PX,
        GESTURE_SCALE_DELTA_MIN,
        TAP_MAX_OFFSET_PX,
        TAP_MAX_DURATION_MS,
        MOUSE_MOVE_DEDUP_PX,
        S7_SAMPLE_INTERVAL_MS,
      },
    };
  }

  function createMeta(cfg: TagConfig): SessionPayloadMeta {
    return {
      tagUuid: cfg.tagUuid,
      tagConstantsVersion: cfg.tagConstantsVersion,
      campaignId: cfg.campaignId,
      creativeId: cfg.creativeId,
      creativeType: cfg.creativeType,
      skippable: cfg.skippable,
      endpoint: cfg.endpoint,
    };
  }

  function initializeContainer(container: HTMLElement): void {
    if (initializedContainers.has(container)) return;

    const cfg = parseConfig(container);
    if (!cfg) {
      console.warn(
        '[CPMind] Missing required data attributes on [data-cpmind-creative]:',
        container,
      );
      return;
    }

    initializedContainers.add(container);

    try {
      const sdkConfig = createSdkConfig(cfg.debug);
      const meta = createMeta(cfg);
      const session = createSession(
        cfg.publisherDomain !== undefined
          ? { publisherDomain: cfg.publisherDomain }
          : {},
      );
      void collectFpHash().then((hash) => {
        session.fpHash = hash;
      });

      initS1(container, session, sdkConfig);
      initS2(container, session, sdkConfig);
      initS3(container, session, sdkConfig);
      initS4(session, sdkConfig);
      initS5(container, session, sdkConfig);
      initS6Legacy(container, session);
      initS7(container, session, sdkConfig);

      const presenceHandle: PresenceHandle = initPresence(
        session,
        sdkConfig,
        () => {
          resetSegmentS6Legacy(container);
          startNewSegment(container, session, sdkConfig, meta, presenceHandle);
        },
      );

      if (cfg.debug) {
        new DebugOverlay(container, session);
      }

      attachUnloadHandlers(container, session, meta, sdkConfig, presenceHandle.cleanup);
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

})(document);