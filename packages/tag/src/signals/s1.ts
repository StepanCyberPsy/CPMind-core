/**
 * S1 — Time-in-View
 *
 * Использует IntersectionObserver с threshold 0.5 (≥50% пикселей в viewport).
 * Аккумулирует:
 *   - timeInViewSec:        суммарное время видимости
 *   - maxContinuousViewSec: максимальный непрерывный отрезок
 *   - visiblePixelsPct:     % пикселей в viewport на момент последней фиксации
 *   - timestampStart:       UTC ms первого входа в viewport
 *
 * Не блокирует рендеринг — IntersectionObserver асинхронен.
 */

import type { Session, TagConfig } from '../types.js';

export function initS1(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  if (typeof IntersectionObserver === 'undefined') return;

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;

      const now = Date.now();
      const inView = entry.intersectionRatio >= 0.5;
      const pixelsPct = Math.round(entry.intersectionRatio * 100);

      session.visiblePixelsPct = pixelsPct;

      if (inView) {
        if (session.timestampStart === 0) {
          session.timestampStart = now;

          if (cfg.debug) {
            console.log('[CPMind S1] First viewport entry:', {
              timestamp: now,
              intersectionRatio: entry.intersectionRatio,
            });
          }
        }

        if (session.viewStart === null) {
          session.viewStart = now;
        }
      } else {
        if (session.viewStart !== null) {
          const segmentSec = (now - session.viewStart) / 1000;

          session.timeInViewSec += segmentSec;

          if (segmentSec > session.maxContinuousViewSec) {
            session.maxContinuousViewSec = segmentSec;
          }

          session.viewStart = null;

          if (cfg.debug) {
            console.log('[CPMind S1] Exited viewport:', {
              segmentSec: segmentSec.toFixed(3),
              totalTimeInViewSec: session.timeInViewSec.toFixed(3),
              maxContinuousViewSec: session.maxContinuousViewSec.toFixed(3),
            });
          }
        }
      }

      if (cfg.debug) {
        console.log('[CPMind S1] State:', {
          inView,
          visiblePixelsPct: pixelsPct,
          timeInViewSec: session.timeInViewSec.toFixed(3),
          maxContinuousViewSec: session.maxContinuousViewSec.toFixed(3),
        });
      }
    },
    {
      // 0 — фиксируем выход из viewport
      // 0.5 — стандарт MRC: ≥50% пикселей в viewport
      // 1.0 — дополнительная точность для share of screen
      threshold: [0, 0.5, 1.0],
    },
  );

  observer.observe(creativeEl);
}