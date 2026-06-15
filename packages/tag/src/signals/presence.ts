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

export function initPresence(
  session: Session,
  cfg: TagConfig,
): () => void {
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

  // Throttle: не обновляем чаще раза в 100 мс
  // Для presence нам важен факт события, а не каждое движение курсора
  let lastUpdateTime = 0;
  const THROTTLE_MS = 100;

  function onUserEvent(): void {
    const now = Date.now();

    // Всегда инкрементируем счетчик (без throttle)
    session.eventsDuringImpression++;

    // Throttle для обновления timestamp
    if (now - lastUpdateTime >= THROTTLE_MS) {
      session.lastUserEventTimestamp = now;
      lastUpdateTime = now;

      if (cfg.debug) {
        console.log('[CPMind Presence] User event:', {
          eventsCount: session.eventsDuringImpression,
          lastUserEventTimestamp: now,
        });
      }
    }
  }

  // Регистрируем все обработчики на document
  // passive: true — не блокируем scroll и touch-события
  for (const eventType of EVENT_TYPES) {
    document.addEventListener(eventType, onUserEvent, {
      passive: true,
      capture: false,
    });
  }

  if (cfg.debug) {
    console.log('[CPMind Presence] Initialized, tracking:', EVENT_TYPES.join(', '));
  }

  return () => {
    for (const eventType of EVENT_TYPES) {
      document.removeEventListener(eventType, onUserEvent, { capture: false });
    }
  };
}