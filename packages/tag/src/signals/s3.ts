/**
 * S3 — Scroll Velocity
 *
 * Если cross-domain iframe -> session.s3 = null, backend перераспределяет веса §6.2.
 *
 * Сбор через rAF-throttling: один вызов обработчика за анимационный фрейм (~16мс).
 * Отслеживает только события в зоне ±300px от центра баннера.
 *
 * Накапливает:
 *   - scroll_speed_avg_px_s / max / std_dev  (Welford's algorithm)
 *   - pause_count / pause_duration_total_ms  (паузы > 500мс)
 *   - scroll_streaks                         (≥3 событий за 2 сек)
 *   - direction_changes                      (разворот down->up в зоне)
 *   - reading_pattern_detected               (медленный скролл > 2 сек)
 *   - is_momentum_scroll                     (iOS инерционный скролл)
 */

import type { Session, TagConfig } from '../types.js';
import {
  SCROLL_ZONE_PX,
  PAUSE_THRESHOLD_MS,
  STREAK_WINDOW_MS,
  STREAK_MIN_EVENTS,
  STREAK_MIN_SPEED,
  READING_SPEED_MAX,
  READING_TIME_MIN,
} from '../constants.js';

const resetters = new WeakMap<HTMLElement, () => void>();

interface RunningStats {
  count: number;
  mean: number;
  m2: number;  // сумма квадратов отклонений
}

function updateStats(stats: RunningStats, value: number): void {
  stats.count++;
  const delta = value - stats.mean;
  stats.mean += delta / stats.count;
  stats.m2 += delta * (value - stats.mean);
}

function getStdDev(stats: RunningStats): number {
  if (stats.count < 2) return 0;
  return Math.sqrt(stats.m2 / (stats.count - 1));
}

function isInsideCrossDomainIframe(): boolean {
  try {
    if (window.self === window.top) return false;
    void window.top?.document;
    return false;
  } catch {
    return true;
  }
}

function isInScrollZone(creativeEl: HTMLElement): boolean {
  const rect = creativeEl.getBoundingClientRect();
  const bannerCenterY = rect.top + rect.height / 2;
  const viewportCenterY = window.innerHeight / 2;
  return Math.abs(bannerCenterY - viewportCenterY) <= SCROLL_ZONE_PX;
}

export function initS3(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  if (isInsideCrossDomainIframe()) {
    session.s3 = null;
    if (cfg.debug) {
      console.log('[CPMind S3] Cross-domain iframe detected — S3 = null');
    }
    return;
  }

  const speedStats: RunningStats = { count: 0, mean: 0, m2: 0 };

  let lastScrollY = window.scrollY;
  let lastScrollTime = performance.now();
  let lastDirection = 0; // +1 = вниз, -1 = вверх
  let rafScheduled = false;

  // Паузы
  let pauseTimeout: ReturnType<typeof setTimeout> | null = null;
  let pauseCheckInterval: ReturnType<typeof setInterval> | null = null;
  let pauseStart: number | null = null;

  // Серии скроллов
  const recentEventTimes: number[] = [];

  // Reading pattern
  let slowScrollStart: number | null = null;

  // Momentum scroll (iOS): scroll после touchend без нового touchstart = инерция
  let isTouchActive = false;
  let touchEndTime = 0;

  // Touch-обработчики для is_momentum_scroll
  window.addEventListener('touchstart', () => {
    isTouchActive = true;
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isTouchActive = false;
    touchEndTime = performance.now();
  }, { passive: true });

  // Основной обработчик (rAF-throttled)
  function processScrollFrame(): void {
    rafScheduled = false;

    // Обрабатываем только если баннер в зоне +/- 300px
    if (!isInScrollZone(creativeEl)) {
      lastScrollY = window.scrollY;
      lastScrollTime = performance.now();
      return;
    }

    const now = performance.now();
    const currentY = window.scrollY;
    const dy = Math.abs(currentY - lastScrollY);
    const dt = (now - lastScrollTime) / 1000;

    if (dt > 0 && dy >= 0) {
      const speed = dy / dt; // px/s

      updateStats(speedStats, speed);

      if (session.s3 !== null) {
        const currentMax = session.s3.scroll_speed_max_px_s ?? 0;
        session.s3.scroll_speed_max_px_s = Math.max(currentMax, speed);
        session.s3.scroll_speed_avg_px_s = speedStats.mean;
        session.s3.scroll_speed_std_dev = getStdDev(speedStats);
      }

      // is_momentum_scroll: iOS инерционный скролл. Вычисляем до streaks — инерция пальца не должна засчитываться как "пролистал не глядя" (P-02)
      const isMomentum = !isTouchActive && (now - touchEndTime) < 3000 && touchEndTime > 0;
      if (isMomentum && session.s3 !== null) {
        session.s3.is_momentum_scroll = true;
      }

      // direction_changes: разворот down->up в зоне баннера
      const direction = currentY > lastScrollY ? 1 : currentY < lastScrollY ? -1 : 0;
      if (direction !== 0) {
        if (lastDirection === 1 && direction === -1) {
          // Разворот вниз->вверх: пользователь возвращается к баннеру
          if (session.s3 !== null) {
            session.s3.direction_changes = (session.s3.direction_changes ?? 0) + 1;
          }
        }
        lastDirection = direction;
      }

      // scroll_streaks: >=3 БЫСТРЫХ не-momentum событий за 2 сек (P-01, P-02).
      // Раньше streak считался по частоте независимо от скорости — ложные срабатывания на медленном чтении и на инерционном скролле mobile
      if (speed > STREAK_MIN_SPEED && !isMomentum) {
        const cutoff = now - STREAK_WINDOW_MS;
        while (recentEventTimes.length > 0 && (recentEventTimes[0] ?? 0) < cutoff) {
          recentEventTimes.shift();
        }
        recentEventTimes.push(now);
        if (recentEventTimes.length >= STREAK_MIN_EVENTS) {
          if (session.s3 !== null) {
            session.s3.scroll_streaks = (session.s3.scroll_streaks ?? 0) + 1;
          }
          recentEventTimes.length = 0;
        }
      }

      // reading_pattern_detected: медленный скролл > 2 сек
      if (speed <= READING_SPEED_MAX) {
        if (slowScrollStart === null) {
          slowScrollStart = now;
        } else if ((now - slowScrollStart) >= READING_TIME_MIN) {
          if (session.s3 !== null) {
            session.s3.reading_pattern_detected = true;
          }
        }
      } else {
        slowScrollStart = null;
      }

      if (cfg.debug) {
        console.log('[CPMind S3] Scroll frame:', {
          speed: speed.toFixed(1) + ' px/s',
          avg: speedStats.mean.toFixed(1) + ' px/s',
          direction: direction === 1 ? 'down' : direction === -1 ? 'up' : 'none',
          isMomentum,
        });
      }
    }

    // Пауза скролла: таймер > 500 мс
    if (pauseTimeout !== null) clearTimeout(pauseTimeout);
    if (pauseStart !== null) {
      pauseStart = null;
    }

    pauseTimeout = setTimeout(() => {
      // 500 мс без скролла в зоне = пауза
      if (!isInScrollZone(creativeEl)) return;

      pauseStart = performance.now();
      if (session.s3 !== null) {
        session.s3.pause_count = (session.s3.pause_count ?? 0) + 1;
      }

      if (cfg.debug) {
        console.log('[CPMind S3] Pause detected:', {
          pauseCount: session.s3?.pause_count,
        });
      }

      // Измеряем длительность паузы — завершается при следующем скролл-событии
      pauseCheckInterval = setInterval(() => {
        if (pauseStart === null) {
          if (pauseCheckInterval !== null) clearInterval(pauseCheckInterval);
          pauseCheckInterval = null;
          return;
        }
        if (!isInScrollZone(creativeEl)) {
          pauseStart = null;
          if (pauseCheckInterval !== null) clearInterval(pauseCheckInterval);
          pauseCheckInterval = null;
          return;
        }
        const pauseDuration = performance.now() - pauseStart;
        if (session.s3 !== null) {
          session.s3.pause_duration_total_ms = (session.s3.pause_duration_total_ms ?? 0) + 100;
        }
        if (pauseDuration > 30_000) {
          // Защита: пауза не может быть бесконечной
          if (pauseCheckInterval !== null) clearInterval(pauseCheckInterval);
          pauseCheckInterval = null;
        }
      }, 100);

    }, PAUSE_THRESHOLD_MS);

    lastScrollY = currentY;
    lastScrollTime = now;
  }

  // Scroll listener: один rAF за событие
  function onScroll(): void {
    if (pauseStart !== null && session.s3 !== null) {
      const pauseDuration = performance.now() - pauseStart;
      session.s3.pause_duration_total_ms =
        (session.s3.pause_duration_total_ms ?? 0) + pauseDuration;
      pauseStart = null;
    }

    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(processScrollFrame);
  }

  // passive: true — не блокируем scroll, не влияем на производительность страницы
  window.addEventListener('scroll', onScroll, { passive: true });

  window.addEventListener('pagehide', () => {
    window.removeEventListener('scroll', onScroll);
    if (pauseTimeout !== null) {
      clearTimeout(pauseTimeout);
      pauseTimeout = null;
    }
    if (pauseCheckInterval !== null) {
      clearInterval(pauseCheckInterval);
      pauseCheckInterval = null;
    }
  }, { once: true });

  function resetState(): void {
    speedStats.count = 0;
    speedStats.mean = 0;
    speedStats.m2 = 0;
    lastScrollY = window.scrollY;
    lastScrollTime = performance.now();
    lastDirection = 0;
    recentEventTimes.length = 0;
    slowScrollStart = null;

    if (pauseTimeout !== null) {
      clearTimeout(pauseTimeout);
      pauseTimeout = null;
    }
    if (pauseCheckInterval !== null) {
      clearInterval(pauseCheckInterval);
      pauseCheckInterval = null;
    }
    pauseStart = null;

    if (session.s3 !== null) {
      session.s3.scroll_speed_avg_px_s = 0;
      session.s3.scroll_speed_max_px_s = 0;
      session.s3.scroll_speed_std_dev = 0;
      session.s3.pause_count = 0;
      session.s3.pause_duration_total_ms = 0;
      session.s3.scroll_streaks = 0;
      session.s3.direction_changes = 0;
      session.s3.reading_pattern_detected = false;
      session.s3.is_momentum_scroll = false;
    }
  }

  resetters.set(creativeEl, resetState);
  resetState();
}

export function resetSegmentS3(creativeEl: HTMLElement): void {
  resetters.get(creativeEl)?.();
}