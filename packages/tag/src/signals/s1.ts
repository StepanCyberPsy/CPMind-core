/**
 * S1 — Time-in-View
 *
 * Использует IntersectionObserver с порогами из S1_VIEWPORT_THRESHOLDS.
 * Impression начинается при первом фактическом входе креатива в viewport.
 * Время S1 накапливается только при видимости ≥75%.
 * Аккумулирует:
 *   - timeInViewSec:        суммарное время видимости ≥75%
 *   - maxContinuousViewSec: максимальный непрерывный отрезок видимости ≥75%
 *   - visiblePixelsPct:     % пикселей в viewport на момент последней фиксации
 *   - timestampStart:       UTC ms первого входа в viewport
 *
 * Не блокирует рендеринг — IntersectionObserver асинхронен.
 */

import type { Session, TagConfig } from '../types.js';
import { S1_VIEWPORT_THRESHOLDS } from '../constants.js';

const resetters = new WeakMap<HTMLElement, IntersectionObserver>();

function createObserver(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): IntersectionObserver {
  return new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;

      const now = Date.now();
      const hasEnteredViewport = entry.isIntersecting && entry.intersectionRatio > 0;
      const inView = entry.intersectionRatio >= 0.75;
      const pixelsPct = Math.round(entry.intersectionRatio * 100);

      if (hasEnteredViewport && session.timestampStart === 0) {
        session.timestampStart = now;

        if (cfg.debug) {
          console.log('[CPMind S1] First viewport entry:', {
            timestamp: now,
            intersectionRatio: entry.intersectionRatio,
          });
        }
      }

      if (inView) {
        session.visiblePixelsPct = pixelsPct;

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

          // mrc_compliant: ≥50% пикселей непрерывно ≥1 сек (стандарт MRC). Устанавливается один раз, не сбрасывается до конца сегмента
          if (!session.mrcCompliant && segmentSec >= 2.0 && session.visiblePixelsPct >= 75) {
            session.mrcCompliant = true;
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
      // 0 — фиксируем вход и выход из viewport
      // 0.75 — порог накопления Time-in-View
      // 1.0 — полная видимость креатива
      threshold: S1_VIEWPORT_THRESHOLDS,
    },
  );
}

export function initS1(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  if (typeof IntersectionObserver === 'undefined') return;

  const observer = createObserver(creativeEl, session, cfg);
  resetters.set(creativeEl, observer);
  observer.observe(creativeEl);

  window.addEventListener('pagehide', () => {
    resetters.get(creativeEl)?.disconnect();
  }, { once: true });
}

export function resetSegmentS1(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  session.timeInViewSec = 0;
  session.maxContinuousViewSec = 0;
  session.visiblePixelsPct = 0;
  session.mrcCompliant = false;
  session.viewStart = null;
  session.timestampStart = 0;

  resetters.get(creativeEl)?.disconnect();

  if (typeof IntersectionObserver === 'undefined') return;

  const observer = createObserver(creativeEl, session, cfg);
  resetters.set(creativeEl, observer);
  observer.observe(creativeEl);
}