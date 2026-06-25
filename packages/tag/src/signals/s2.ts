/**
 * S2 — Share of Screen
 *
 * Измеряет какую долю видимой области экрана занимал креатив.
 * Сэмплирует каждые 500 мс пока баннер в viewport (viewStart !== null).
 *
 * Формула сэмпла:
 *   visibleArea = видимая область креатива (пересечение с viewport)
 *   viewportArea = window.innerWidth × window.innerHeight
 *   shareOfScreen = (visibleArea / viewportArea) × 100
 *
 * Накапливает:
 *   shareOfScreenSamples -> для avg в buildPayload()
 *   shareOfScreenMax -> пиковое значение
 */

import type { Session, TagConfig } from '../types.js';
import { S2_SAMPLE_INTERVAL_MS } from '../constants.js';

export function initS2(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function sample(): void {
    if (session.sent) return;
    if (session.viewStart === null) return;

    const rect = creativeEl.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const viewportArea = viewportW * viewportH;

    if (viewportArea === 0) return;

    const visibleLeft = Math.max(0, rect.left);
    const visibleTop = Math.max(0, rect.top);
    const visibleRight = Math.min(rect.right, viewportW);
    const visibleBottom = Math.min(rect.bottom, viewportH);
    const visibleW = Math.max(0, visibleRight - visibleLeft);
    const visibleH = Math.max(0, visibleBottom - visibleTop);
    const visibleArea = visibleW * visibleH;

    const shareOfScreen = Math.min(100, (visibleArea / viewportArea) * 100);

    session.shareOfScreenSamples.push(shareOfScreen);

    if (shareOfScreen > session.shareOfScreenMax) {
      session.shareOfScreenMax = shareOfScreen;
    }

    if (cfg.debug) {
      const avg = session.shareOfScreenSamples.reduce((a, b) => a + b, 0)
        / session.shareOfScreenSamples.length;
      console.log('[CPMind S2] Sample:', {
        shareOfScreen: shareOfScreen.toFixed(2) + '%',
        shareOfScreenMax: session.shareOfScreenMax.toFixed(2) + '%',
        avgSoFar: avg.toFixed(2) + '%',
        samples: session.shareOfScreenSamples.length,
      });
    }
  }

  intervalId = setInterval(sample, S2_SAMPLE_INTERVAL_MS);
  sample();

  window.addEventListener('pagehide', () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }, { once: true });
}

export function resetSegmentS2(session: Session): void {
  session.shareOfScreenSamples = [];
  session.shareOfScreenMax = 0;
}