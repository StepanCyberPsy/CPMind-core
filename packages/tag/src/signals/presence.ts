/**
 * F_Presence — мультипликатор присутствия пользователя
 *
 * Отслеживает любые пользовательские события на странице:
 *   mouse: mousemove, mousedown, mouseup
 *   touch: touchstart, touchend, touchmove
 *   key: keydown, keyup
 *   scroll: scroll
 *   click: click
 *
 * Накапливает:
 *   - lastUserEventTimestamp: UTC ms последнего события
 *   - eventsDuringImpression: счетчик всех событий за показ
 *
 * F_Presence = 0 если:
 *   time_since_last_event_ms > 60 000 AND events_count_during_impression = 0
 *   -> пользователь физически не у экрана -> импрешен невалиден
 *
 * Логика расчета F_Presence — в shared/scoring/score.ts.
 * Здесь только сбор raw-полей.
 */

import type { Session, TagConfig } from '../types.js';
import { PRESENCE_IDLE_TIMEOUT_MS } from '../constants.js';

export interface PresenceHandle {
  cleanup: () => void;
  resetSegment: () => void;
}

export function initPresence(
  session: Session,
  cfg: TagConfig,
  onIdle: () => void,
): PresenceHandle {
  const EVENT_TYPES = [
    'mousemove',
    'mousedown',
    'mouseup',
    'touchstart',
    'touchend',
    'touchmove',
    'keydown',
    'keyup',
    'scroll',
    'click',
  ] as const;

  let lastUpdateTime = 0;
  const THROTTLE_MS = 100;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function armIdleTimer(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(onIdle, PRESENCE_IDLE_TIMEOUT_MS);
  }

  function onUserEvent(): void {
    const now = Date.now();

    armIdleTimer();
    session.eventsDuringImpression++;

    if (now - lastUpdateTime >= THROTTLE_MS) {
      if (session.lastThrottledEventTimestamp !== null) {
        const interval = now - session.lastThrottledEventTimestamp;
        session.eventIntervals.push(interval);
        if (session.eventIntervals.length > 50) {
          session.eventIntervals.shift();
        }
      }
      session.lastUserEventTimestamp = now;
      session.lastThrottledEventTimestamp = now;
      lastUpdateTime = now;

      if (cfg.debug) {
        console.log('[CPMind Presence] User event:', {
          eventsCount: session.eventsDuringImpression,
          lastUserEventTimestamp: now,
        });
      }
    }
  }

  for (const eventType of EVENT_TYPES) {
    document.addEventListener(eventType, onUserEvent, {
      passive: true,
      capture: false,
    });
  }

  armIdleTimer();

  if (cfg.debug) {
    console.log('[CPMind Presence] Initialized, tracking:', EVENT_TYPES.join(', '));
  }

  function cleanup(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    for (const eventType of EVENT_TYPES) {
      document.removeEventListener(eventType, onUserEvent, { capture: false });
    }
  }

  function resetSegment(): void {
    lastUpdateTime = 0;
    session.lastUserEventTimestamp = null;
    session.lastThrottledEventTimestamp = null;
    session.eventsDuringImpression = 0;
    session.eventIntervals = [];
    armIdleTimer();
  }

  return { cleanup, resetSegment };
}