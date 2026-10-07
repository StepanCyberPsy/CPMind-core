import type { Session, SdkSignalConfig } from '../types.js';
import type { FrameInteractionKind } from './frame_trust.js';

function distanceToRect(px: number, py: number, rect: DOMRect): number {
    const dx = Math.max(rect.left - px, 0, px - rect.right);
    const dy = Math.max(rect.top - py, 0, py - rect.bottom);
    return Math.sqrt(dx * dx + dy * dy);
}

function vectorAngle(dx: number, dy: number): number {
    return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

const resetters = new WeakMap<HTMLElement, () => void>();
const disposers = new WeakMap<HTMLElement, () => void>();

interface GestureEvent extends Event {
    scale: number;
}

function initDesktop(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    const {
        ENTROPY_ANGLE_THRESHOLD,
        PROXIMITY_TRACK_ZONE_PX,
        MOUSE_MOVE_DEDUP_PX,
    } = config.constants;

    let lastMouseX: number | null = null;
    let lastMouseY: number | null = null;
    let lastAngle: number | null = null;
    let totalMoves = 0;
    let significantChanges = 0;
    let disposed = false;

    const onClick = (): void => {
        session.clicked = true;
        if (session.lastHoverStart !== null) {
            session.hoverToClickLatencyMs = Date.now() - session.lastHoverStart;
        }
        if (config.debug) {
            console.log('[CPMind S5] Clicked:', { hoverToClickLatencyMs: session.hoverToClickLatencyMs });
        }
    };

    const onMouseEnter = (): void => {
        session.hoverCount++;
        session.lastHoverStart = Date.now();
        if (config.debug) {
            console.log('[CPMind S5] Hover enter:', { hoverCount: session.hoverCount });
        }
    };

    const onMouseLeave = (): void => {
        if (session.lastHoverStart !== null) {
            const hoverDuration = Date.now() - session.lastHoverStart;
            session.hoverDurationTotalMs += hoverDuration;
            if (hoverDuration > session.hoverDurationMaxMs) {
                session.hoverDurationMaxMs = hoverDuration;
            }
            session.lastHoverStart = null;
            if (config.debug) {
                console.log('[CPMind S5] Hover leave:', {
                    hoverDurationMs: hoverDuration,
                    hoverDurationMaxMs: session.hoverDurationMaxMs,
                });
            }
        }
    };

    let rafScheduled = false;
    let pendingX = 0;
    let pendingY = 0;

    // Удержание курсора в зоне кнопки пропуска. Длительность относится к предыдущему
    // положению курсора: кадр фиксирует, где он находился до этого перемещения
    function trackSkipZone(now: number): void {
        const zoneEl = session.skipZoneEl;
        if (zoneEl === null) return;
        if (session.skipZoneSince === null) return;

        const previousAt = session.skipZoneSampleAt;
        const zoneRect = zoneEl.getBoundingClientRect();
        const inside = distanceToRect(pendingX, pendingY, zoneRect) === 0;

        if (previousAt !== null && session.skipZoneHoverPending) {
            session.skipZoneHoverMs += Math.max(0, now - previousAt);
        }

        if (!inside) session.skipZoneMovedOutside = true;

        session.skipZoneHoverPending = inside;
        session.skipZoneSampleAt = now;
    }

    function processMouseFrame(): void {
        rafScheduled = false;
        if (disposed) return;

        trackSkipZone(Date.now());

        const rect = creativeEl.getBoundingClientRect();
        const dist = distanceToRect(pendingX, pendingY, rect);

        if (dist < session.cursorProximityMinPx) {
            session.cursorProximityMinPx = dist;
        }

        if (dist <= PROXIMITY_TRACK_ZONE_PX) {
            if (lastMouseX !== null && lastMouseY !== null) {
                const dx = pendingX - lastMouseX;
                const dy = pendingY - lastMouseY;

                if (Math.abs(dx) > MOUSE_MOVE_DEDUP_PX || Math.abs(dy) > MOUSE_MOVE_DEDUP_PX) {
                    const angle = vectorAngle(dx, dy);
                    totalMoves++;

                    if (lastAngle !== null) {
                        const diff = angleDiff(angle, lastAngle);
                        if (diff > ENTROPY_ANGLE_THRESHOLD) {
                            significantChanges++;
                        }
                    }

                    lastAngle = angle;
                    session.cursorTrajectoryEntropy = totalMoves > 1
                        ? Math.min(1, significantChanges / (totalMoves - 1))
                        : 0;
                }
            }
            lastMouseX = pendingX;
            lastMouseY = pendingY;
        }
    }

    const onMouseMove = (e: MouseEvent): void => {
        pendingX = e.clientX;
        pendingY = e.clientY;
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(processMouseFrame);
        }
    };

    creativeEl.addEventListener('click', onClick, { capture: true });
    creativeEl.addEventListener('mouseenter', onMouseEnter);
    creativeEl.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mousemove', onMouseMove, { passive: true });

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
        session.unconfirmedFrameEvents = 0;
        session.skipZoneSince = null;
        session.skipZoneHoverMs = 0;
        session.skipZoneSampleAt = null;
        session.skipZoneHoverPending = false;
        session.skipZoneMovedOutside = false;
    }

    function dispose(): void {
        disposed = true;
        creativeEl.removeEventListener('click', onClick, { capture: true });
        creativeEl.removeEventListener('mouseenter', onMouseEnter);
        creativeEl.removeEventListener('mouseleave', onMouseLeave);
        document.removeEventListener('mousemove', onMouseMove);
    }

    resetters.set(creativeEl, resetState);
    disposers.set(creativeEl, dispose);
}

function initMobile(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    const {
        SWIPE_MIN_DISTANCE_PX,
        PINCH_DELTA_MIN_PX,
        GESTURE_SCALE_DELTA_MIN,
        TAP_MAX_OFFSET_PX,
        TAP_MAX_DURATION_MS,
    } = config.constants;

    let touchStartY: number | null = null;
    let touchStartX: number | null = null;
    let touchStartTime: number | null = null;
    let initialPinchDistance: number | null = null;

    const onTouchStart = (e: TouchEvent): void => {
        const touch = e.touches[0];
        if (!touch) return;
        touchStartY = touch.clientY;
        touchStartX = touch.clientX;
        touchStartTime = Date.now();
    };

    const onTouchEnd = (e: TouchEvent): void => {
        if (touchStartTime === null) return;
        const touchDuration = Date.now() - touchStartTime;
        session.touchStartEndDeltaMs = touchDuration;

        const touch = e.changedTouches[0];
        if (touch && touchStartX !== null && touchStartY !== null) {
            const dx = Math.abs(touch.clientX - touchStartX);
            const dy = Math.abs(touch.clientY - touchStartY);

            if (dx < TAP_MAX_OFFSET_PX && dy < TAP_MAX_OFFSET_PX && touchDuration < TAP_MAX_DURATION_MS) {
                session.tapCount++;
                session.clicked = true;
                if (config.debug) {
                    console.log('[CPMind S5] Tap on creative:', { tapCount: session.tapCount });
                }
            }
        }

        touchStartY = null;
        touchStartX = null;
        touchStartTime = null;
    };

    const onTouchMove = (e: TouchEvent): void => {
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
            if (config.debug) {
                console.log('[CPMind S5] Swipe detected:', { swipeCount: session.swipeCount });
            }
        }
    };

    const onGestureChange = (e: Event): void => {
        const scale = (e as GestureEvent).scale;
        if (Math.abs(scale - 1) > GESTURE_SCALE_DELTA_MIN) {
            session.zoom = true;
        }
    };

    const onPinchStart = (e: TouchEvent): void => {
        if (e.touches.length === 2) {
            const t1 = e.touches[0]!;
            const t2 = e.touches[1]!;
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        }
    };

    const onPinchMove = (e: TouchEvent): void => {
        if (e.touches.length === 2 && initialPinchDistance !== null) {
            const t1 = e.touches[0]!;
            const t2 = e.touches[1]!;
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(currentDistance - initialPinchDistance) > PINCH_DELTA_MIN_PX) {
                session.zoom = true;
            }
        }
    };

    const onPinchEnd = (): void => {
        initialPinchDistance = null;
    };

    creativeEl.addEventListener('touchstart', onTouchStart, { passive: true });
    creativeEl.addEventListener('touchend', onTouchEnd, { passive: true });
    creativeEl.addEventListener('touchmove', onTouchMove, { passive: true });
    creativeEl.addEventListener('gesturechange', onGestureChange, { passive: true });
    creativeEl.addEventListener('touchstart', onPinchStart, { passive: true });
    creativeEl.addEventListener('touchmove', onPinchMove, { passive: true });
    creativeEl.addEventListener('touchend', onPinchEnd, { passive: true });

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
        session.unconfirmedFrameEvents = 0;
    }

    function dispose(): void {
        creativeEl.removeEventListener('touchstart', onTouchStart);
        creativeEl.removeEventListener('touchend', onTouchEnd);
        creativeEl.removeEventListener('touchmove', onTouchMove);
        creativeEl.removeEventListener('gesturechange', onGestureChange);
        creativeEl.removeEventListener('touchstart', onPinchStart);
        creativeEl.removeEventListener('touchmove', onPinchMove);
        creativeEl.removeEventListener('touchend', onPinchEnd);
    }

    resetters.set(creativeEl, resetState);
    disposers.set(creativeEl, dispose);
}

export function initS5(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    if (session.deviceType === 'desktop') {
        initDesktop(creativeEl, session, config);
    } else {
        initMobile(creativeEl, session, config);
    }
}

export function resetSegmentS5(creativeEl: HTMLElement): void {
    resetters.get(creativeEl)?.();
}

// Снятие обработчиков взаимодействий при завершении измерения
export function disposeS5(creativeEl: HTMLElement): void {
    disposers.get(creativeEl)?.();
    disposers.delete(creativeEl);
    resetters.delete(creativeEl);
}

// Взаимодействие внутри iframe креатива, подтверждённое хостом. Поля заполняются
// по тем же правилам, что и прямые события контейнера; payload отбирает поля по device_type
// Зона кнопки пропуска, переданная рантаймом. Отсчёт начинается с момента появления
// кнопки: до него курсор над ней оказаться не мог, и доля времени считалась бы
// от всего показа
export function trackSkipZoneElement(
    session: Session,
    el: HTMLElement,
): void {
    if (session.deviceType !== 'desktop') return;
    if (session.skipZoneEl !== null) return;

    const now = Date.now();

    session.skipZoneEl = el;
    session.skipZoneSince = now;
    session.skipZoneSampleAt = now;
    session.skipZoneHoverPending = false;
    session.skipZoneMovedOutside = false;
}

export function recordFrameInteraction(
    session: Session,
    kind: Exclude<FrameInteractionKind, 'activity'>,
): void {
    switch (kind) {
        case 'click': {
            session.clicked = true;
            if (session.deviceType === 'desktop' && session.lastHoverStart !== null) {
                session.hoverToClickLatencyMs = Date.now() - session.lastHoverStart;
            }
            break;
        }
        case 'tap': {
            session.clicked = true;
            session.tapCount++;
            break;
        }
        case 'swipe': {
            session.swipeCount++;
            break;
        }
        case 'zoom': {
            session.zoom = true;
            break;
        }
    }
}