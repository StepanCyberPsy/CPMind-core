import type { Session, SdkSignalConfig } from '../types.js';

const cleanups = new WeakMap<Session, () => void>();

export function initS4(
    session: Session,
    config: SdkSignalConfig,
): void {
    session.tabSessionStart = Date.now();

    const initialState = document.visibilityState === 'visible' ? 'visible' : 'hidden';

    session.visibilityStateHistory.push({
        state: initialState,
        timestamp: session.tabSessionStart,
    });

    // Фокус окна на момент инициализации: показ может начаться в окне, которое уже
    // не в фокусе, и отсчёт интервала без фокуса начинается сразу
    session.windowFocused = document.hasFocus();
    session.windowUnfocusedStart = session.windowFocused ? null : session.tabSessionStart;

    function closeUnfocusedInterval(now: number): void {
        const start = session.windowUnfocusedStart;
        if (start === null) return;

        const elapsed = Math.max(0, now - start);
        if (elapsed > session.windowUnfocusedMaxMs) {
            session.windowUnfocusedMaxMs = elapsed;
        }

        session.windowUnfocusedStart = null;
    }

    function onWindowFocus(): void {
        session.windowFocused = true;
        closeUnfocusedInterval(Date.now());
    }

    // Повторное событие потери фокуса не сдвигает якорь: интервал остаётся непрерывным
    function onWindowBlur(): void {
        if (!session.windowFocused) return;
        session.windowFocused = false;
        session.windowUnfocusedStart = Date.now();
    }

    // Если вкладка изначально hidden — не начинаем накопление active time
    // tabSessionStart используется как маркер начала visible-сегмента,
    // при hidden-init он не должен влиять на tabActiveTimeMs
    let isCurrentlyVisible = initialState === 'visible';

    function onVisibilityChange(): void {
        const now = Date.now();
        const state = document.visibilityState;

        if (state === 'hidden') {
            // Финализируем visible-сегмент только если реально были visible
            if (isCurrentlyVisible) {
                const activeSegment = now - session.tabSessionStart;
                session.tabActiveTimeMs += activeSegment;
                session.tabSwitchesCount++;
                isCurrentlyVisible = false;
            }

            session.visibilityStateHistory.push({ state: 'hidden', timestamp: now });

            if (config.debug) {
                console.log('[CPMind S4] Tab hidden:', {
                    totalActiveTimeMs: session.tabActiveTimeMs,
                    switchesCount: session.tabSwitchesCount,
                });
            }
        } else {
            session.tabSessionStart = now;
            isCurrentlyVisible = true;
            session.visibilityStateHistory.push({ state: 'visible', timestamp: now });

            if (config.debug) {
                console.log('[CPMind S4] Tab visible:', {
                    totalActiveTimeMs: session.tabActiveTimeMs,
                    switchesCount: session.tabSwitchesCount,
                });
            }
        }
    }

    // pagehide: финализируем текущий visible-сегмент перед bfcache/закрытием
    function onPageHide(): void {
        if (!isCurrentlyVisible) return;
        const now = Date.now();
        const activeSegment = now - session.tabSessionStart;
        session.tabActiveTimeMs += activeSegment;
        isCurrentlyVisible = false;
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('pagehide', onPageHide, { once: true });

    if (config.debug) {
        console.log('[CPMind S4] Initialized:', {
            initialState,
            windowFocused: session.windowFocused,
            tabSessionStart: session.tabSessionStart,
        });
    }

    // Cleanup для предотвращения listener leak при segment reset
    cleanups.set(session, () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('focus', onWindowFocus);
        window.removeEventListener('blur', onWindowBlur);
        window.removeEventListener('pagehide', onPageHide);
    });
}

// Снятие обработчиков видимости вкладки при завершении измерения
export function disposeS4(session: Session): void {
    cleanups.get(session)?.();
    cleanups.delete(session);
}

export function resetSegmentS4(
    session: Session,
    config: SdkSignalConfig,
): void {
    // Удаляем listener'ы предыдущего сегмента — критично для предотвращения утечки
    cleanups.get(session)?.();
    cleanups.delete(session);

    session.tabActiveTimeMs = 0;
    session.tabSwitchesCount = 0;
    session.windowUnfocusedMaxMs = 0;

    // Начальную запись истории, tabSessionStart и состояние фокуса нового сегмента
    // выставляет initS4
    session.visibilityStateHistory = [];

    // Переинициализируем для нового сегмента
    initS4(session, config);
}