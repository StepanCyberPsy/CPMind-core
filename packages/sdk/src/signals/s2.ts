import type { Session, SdkSignalConfig } from '../types.js';

const disposers = new WeakMap<Session, () => void>();

export function initS2(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    function sample(): void {
        if (session.sent) return;
        if (session.viewStart === null) return;

        // Вкладка скрыта: доля экрана не наблюдается зрителем. Тик фоновой вкладки
        // весит в среднем наравне с обычным, хотя браузер троттлит setInterval
        // до одного раза в секунду и реже — и засчитывал бы время, которое S4
        // из того же показа вычитает как неактивное
        if (document.visibilityState !== 'visible') return;

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

        if (config.debug) {
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

    const intervalId = setInterval(sample, config.constants.S2_SAMPLE_INTERVAL_MS);
    sample();

    function dispose(): void {
        clearInterval(intervalId);
        window.removeEventListener('pagehide', dispose);
        disposers.delete(session);
    }

    window.addEventListener('pagehide', dispose, { once: true });
    disposers.set(session, dispose);
}

export function resetSegmentS2(session: Session): void {
    session.shareOfScreenSamples = [];
    session.shareOfScreenMax = 0;
}

// Остановка сэмплирования при завершении измерения
export function disposeS2(session: Session): void {
    disposers.get(session)?.();
}