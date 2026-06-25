/**
 * S5 — Interaction Events
 *
 * Desktop: click, hover (enter/leave/move), cursor proximity, trajectory entropy.
 * Mobile:  tap, swipe, zoom (gesturechange + pinch).
 *
 * Роутинг по device_type — определен в createSession() через detectDeviceType().
 * Tablet трактуется как mobile (touch-события).
 */

import type { Session, TagConfig } from '../types.js';
import {
  SWIPE_MIN_DISTANCE_PX,
  ENTROPY_ANGLE_THRESHOLD,
  PROXIMITY_TRACK_ZONE_PX,
  PINCH_DELTA_MIN_PX,
  GESTURE_SCALE_DELTA_MIN,
  TAP_MAX_OFFSET_PX,
  TAP_MAX_DURATION_MS,
  MOUSE_MOVE_DEDUP_PX,
} from '../constants.js';

/** Расстояние от точки (px, py) до прямоугольника rect */
function distanceToRect(px: number, py: number, rect: DOMRect): number {
  const dx = Math.max(rect.left - px, 0, px - rect.right);
  const dy = Math.max(rect.top - py, 0, py - rect.bottom);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Угол вектора (dx, dy) в градусах [0, 360) */
function vectorAngle(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

/** Разница углов с учетом цикличности [0, 180] */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const resetters = new WeakMap<HTMLElement, () => void>();

function initDesktop(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  let lastMouseX: number | null = null;
  let lastMouseY: number | null = null;
  let lastAngle: number | null = null;
  let totalMoves = 0;
  let significantChanges = 0;

  creativeEl.addEventListener('click', () => {
    session.clicked = true;

    if (session.lastHoverStart !== null) {
      session.hoverToClickLatencyMs = Date.now() - session.lastHoverStart;
    }

    if (cfg.debug) {
      console.log('[CPMind S5] Clicked:', {
        hoverToClickLatencyMs: session.hoverToClickLatencyMs,
      });
    }
  });

  // mouseenter
  creativeEl.addEventListener('mouseenter', () => {
    session.hoverCount++;
    session.lastHoverStart = Date.now();

    if (cfg.debug) {
      console.log('[CPMind S5] Hover enter:', { hoverCount: session.hoverCount });
    }
  });

  // mouseleave
  creativeEl.addEventListener('mouseleave', () => {
    if (session.lastHoverStart !== null) {
      const hoverDuration = Date.now() - session.lastHoverStart;

      session.hoverDurationTotalMs += hoverDuration;

      if (hoverDuration > session.hoverDurationMaxMs) {
        session.hoverDurationMaxMs = hoverDuration;
      }

      session.lastHoverStart = null;

      if (cfg.debug) {
        console.log('[CPMind S5] Hover leave:', {
          hoverDurationMs: hoverDuration,
          hoverDurationMaxMs: session.hoverDurationMaxMs,
          hoverDurationTotalMs: session.hoverDurationTotalMs,
        });
      }
    }
  });

  // mousemove: proximity + trajectory entropy
  let rafScheduled = false;
  let pendingX = 0;
  let pendingY = 0;

  function processMouseFrame(): void {
    rafScheduled = false;

    const rect = creativeEl.getBoundingClientRect();

    // cursor_proximity_min_px
    const dist = distanceToRect(pendingX, pendingY, rect);
    if (dist < session.cursorProximityMinPx) {
      session.cursorProximityMinPx = dist;
    }

    // cursor_trajectory_entropy
    if (dist <= PROXIMITY_TRACK_ZONE_PX) {
      if (lastMouseX !== null && lastMouseY !== null) {
        const dx = pendingX - lastMouseX;
        const dy = pendingY - lastMouseY;

        if (
          Math.abs(dx) > MOUSE_MOVE_DEDUP_PX ||
          Math.abs(dy) > MOUSE_MOVE_DEDUP_PX
        ) {
          const angle = vectorAngle(dx, dy);
          totalMoves++;

          if (lastAngle !== null) {
            const diff = angleDiff(angle, lastAngle);
            if (diff > ENTROPY_ANGLE_THRESHOLD) {
              significantChanges++;
            }
          }

          lastAngle = angle;

          // entropy: доля значимых изменений направления [0..1]
          session.cursorTrajectoryEntropy = totalMoves > 1
            ? Math.min(1, significantChanges / (totalMoves - 1))
            : 0;
        }
      }

      lastMouseX = pendingX;
      lastMouseY = pendingY;
    }
  }

  document.addEventListener('mousemove', (e: MouseEvent) => {
    pendingX = e.clientX;
    pendingY = e.clientY;

    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(processMouseFrame);
    }
  }, { passive: true });

  function resetState(): void {
    lastMouseX = null;
    lastMouseY = null;
    lastAngle = null;
    totalMoves = 0;
    significantChanges = 0;

    session.clicked = false;
    session.hoverCount = 0;
    session.hoverDurationMaxMs = 0;
    session.hoverDurationTotalMs = 0;
    session.hoverToClickLatencyMs = null;
    session.cursorProximityMinPx = Infinity;
    session.cursorTrajectoryEntropy = 0;
    session.lastHoverStart = null;
  }

  resetters.set(creativeEl, resetState);
}

interface GestureEvent extends Event {
  scale: number;
}

function initMobile(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  let touchStartY: number | null = null;
  let touchStartX: number | null = null;
  let touchStartTime: number | null = null;

  // touchstart
  creativeEl.addEventListener('touchstart', (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    touchStartY = touch.clientY;
    touchStartX = touch.clientX;
    touchStartTime = Date.now();
  }, { passive: true });

  // touchend
  creativeEl.addEventListener('touchend', (e: TouchEvent) => {
    if (touchStartTime === null) return;

    const touchDuration = Date.now() - touchStartTime;
    session.touchStartEndDeltaMs = touchDuration;

    // tap: короткое касание без значимого смещения пальца
    const touch = e.changedTouches[0];
    if (touch && touchStartX !== null && touchStartY !== null) {
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);

      if (
        dx < TAP_MAX_OFFSET_PX &&
        dy < TAP_MAX_OFFSET_PX &&
        touchDuration < TAP_MAX_DURATION_MS
      ) {
        session.tapCount++;
        session.clicked = true;

        if (cfg.debug) {
          console.log('[CPMind S5] Tap on creative:', {
            tapCount: session.tapCount,
            touchDurationMs: touchDuration,
          });
        }
      }
    }

    touchStartY = null;
    touchStartX = null;
    touchStartTime = null;
  }, { passive: true });

  // touchmove: swipe detection
  creativeEl.addEventListener('touchmove', (e: TouchEvent) => {
    if (touchStartY === null || touchStartX === null) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= SWIPE_MIN_DISTANCE_PX) {
      session.swipeCount++;

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      if (cfg.debug) {
        console.log('[CPMind S5] Swipe detected:', {
          swipeCount: session.swipeCount,
          distance: distance.toFixed(1),
        });
      }
    }
  }, { passive: true });

  // zoom: gesturechange (iOS Safari) + pinch через touch scale
  creativeEl.addEventListener('gesturechange', (e: Event) => {
    const scale = (e as GestureEvent).scale;

    if (Math.abs(scale - 1) > GESTURE_SCALE_DELTA_MIN) {
      session.zoom = true;
      if (cfg.debug) {
        console.log('[CPMind S5] Zoom detected (gesturechange):', { scale });
      }
    }
  }, { passive: true });

  // Fallback: multi-touch на баннере = zoom
  let initialPinchDistance: number | null = null;

  creativeEl.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  creativeEl.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      // Значимое изменение расстояния между пальцами = pinch zoom
      if (
        Math.abs(currentDistance - initialPinchDistance) > PINCH_DELTA_MIN_PX
      ) {
        session.zoom = true;
        if (cfg.debug) {
          console.log('[CPMind S5] Zoom detected (pinch)');
        }
      }
    }
  }, { passive: true });

  creativeEl.addEventListener('touchend', () => {
    initialPinchDistance = null;
  }, { passive: true });

  function resetState(): void {
    touchStartY = null;
    touchStartX = null;
    touchStartTime = null;
    initialPinchDistance = null;

    session.clicked = false;
    session.tapCount = 0;
    session.touchStartEndDeltaMs = null;
    session.zoom = false;
    session.swipeCount = 0;
  }

  resetters.set(creativeEl, resetState);
}

export function initS5(
  creativeEl: HTMLElement,
  session: Session,
  cfg: TagConfig,
): void {
  if (session.deviceType === 'desktop') {
    initDesktop(creativeEl, session, cfg);
  } else {
    initMobile(creativeEl, session, cfg);
  }
}

export function resetSegmentS5(creativeEl: HTMLElement): void {
  resetters.get(creativeEl)?.();
}