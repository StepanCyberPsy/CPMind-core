/**
 * S4 — Tab Activity
 *
 * Отслеживает активность вкладки через document.visibilityState.
 * Накапливает:
 *   - tabActiveTimeMs:        мс когда вкладка была visible
 *   - tabTotalTimeMs:         общее время показа (финализируется в buildPayload)
 *   - tabSwitchesCount:       количество уходов на другую вкладку
 *   - visibilityStateHistory: лог изменений с таймстампами
 *
 * tabSessionStart: timestamp начала текущего visible-сегмента.
 * Обновляется при каждом visibilitychange.
 */

import type { Session, TagConfig } from '../types.js';

export function initS4(
  session: Session,
  cfg: TagConfig,
): void {
  session.tabSessionStart = Date.now();

  session.visibilityStateHistory.push({
    state: document.visibilityState === 'visible' ? 'visible' : 'hidden',
    timestamp: Date.now(),
  });

  function onVisibilityChange(): void {
    const now = Date.now();
    const state = document.visibilityState;

    if (state === 'hidden') {
      const activeSegment = now - session.tabSessionStart;
      session.tabActiveTimeMs += activeSegment;
      session.tabSwitchesCount++;

      session.visibilityStateHistory.push({ state: 'hidden', timestamp: now });

      if (cfg.debug) {
        console.log('[CPMind S4] Tab hidden:', {
          activeSegmentMs: activeSegment,
          totalActiveTimeMs: session.tabActiveTimeMs,
          switchesCount: session.tabSwitchesCount,
        });
      }

    } else {
      session.tabSessionStart = now;
      session.visibilityStateHistory.push({ state: 'visible', timestamp: now });

      if (cfg.debug) {
        console.log('[CPMind S4] Tab visible:', {
          totalActiveTimeMs: session.tabActiveTimeMs,
          switchesCount: session.tabSwitchesCount,
        });
      }
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  if (cfg.debug) {
    console.log('[CPMind S4] Initialized:', {
      initialState: document.visibilityState,
      tabSessionStart: session.tabSessionStart,
    });
  }
}