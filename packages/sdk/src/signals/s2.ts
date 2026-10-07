import type { Session, SdkSignalConfig } from '../types.js';

const disposers = new WeakMap<Session, () => void>();

// Наибольшая длительность, засчитываемая одному отсчёту, в штатных интервалах.
// Задержка таймера под нагрузкой учитывается полностью, нераспознанный разрыв
// наблюдения ограничивается этим потолком
const MAX_SAMPLE_GAP_FACTOR = 2;

export function initS2(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    const maxSampleGapMs = config.constants.S2_SAMPLE_INTERVAL_MS * MAX_SAMPLE_GAP_FACTOR;

    // Доля предыдущего отсчёта удерживается до текущего: её вклад взвешивается
    // фактической длительностью интервала
    function accumulate(now: number): void {
        const lastSampleAt = session.shareOfScreenLastSampleAt;
        const lastSamplePct = session.shareOfScreenLastSamplePct;

        if (lastSampleAt === null) return;
        if (lastSamplePct === null) return;

        const elapsed = Math.min(
            Math.max(0, now - lastSampleAt),
            maxSampleGapMs,
        );

        if (elapsed === 0) return;

        session.shareOfScreenWeightedSumPct += lastSamplePct * elapsed;
        session.shareOfScreenWeightMs += elapsed;
    }

    // Разрыв наблюдения: интервал до следующего отсчёта не относится ни к одной доле.
    // Без сброса якоря время скрытой вкладки досталось бы последней наблюдённой доле
    function suspend(now: number): void {
        accumulate(now);
        session.shareOfScreenLastSampleAt = null;
    }

    function sample(): void {
        if (session.sent) return;

        const now = Date.now();

        if (session.viewStart === null) {
            suspend(now);
            return;
        }

        // Вкладка скрыта: доля экрана не наблюдается зрителем. Тик фоновой вкладки
        // весит в среднем наравне с обычным, хотя браузер троттлит setInterval
        // до одного раза в секунду и реже — и засчитывал бы время, которое S4
        // из того же показа вычитает как неактивное
        if (document.visibilityState !== 'visible') {
            suspend(now);
            return;
        }

        const rect = creativeEl.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const viewportArea = viewportW * viewportH;

        if (viewportArea === 0) {
            suspend(now);
            return;
        }

        const visibleLeft = Math.max(0, rect.left);
        const visibleTop = Math.max(0, rect.top);
        const visibleRight = Math.min(rect.right, viewportW);
        const visibleBottom = Math.min(rect.bottom, viewportH);
        const visibleW = Math.max(0, visibleRight - visibleLeft);
        const visibleH = Math.max(0, visibleBottom - visibleTop);
        const visibleArea = visibleW * visibleH;

        const shareOfScreen = Math.min(100, (visibleArea / viewportArea) * 100);

        accumulate(now);

        session.shareOfScreenLastSamplePct = shareOfScreen;
        session.shareOfScreenLastSampleAt = now;

        if (shareOfScreen > session.shareOfScreenMax) {
            session.shareOfScreenMax = shareOfScreen;
        }

        if (config.debug) {
            const avg = session.shareOfScreenWeightMs > 0
                ? session.shareOfScreenWeightedSumPct / session.shareOfScreenWeightMs
                : shareOfScreen;
            console.log('[CPMind S2] Sample:', {
                shareOfScreen: shareOfScreen.toFixed(2) + '%',
                shareOfScreenMax: session.shareOfScreenMax.toFixed(2) + '%',
                avgSoFar: avg.toFixed(2) + '%',
                weightMs: Math.round(session.shareOfScreenWeightMs),
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
    session.shareOfScreenWeightedSumPct = 0;
    session.shareOfScreenWeightMs = 0;
    session.shareOfScreenLastSamplePct = null;
    session.shareOfScreenLastSampleAt = null;
    session.shareOfScreenMax = 0;
}

// Остановка сэмплирования при завершении измерения
export function disposeS2(session: Session): void {
    disposers.get(session)?.();
}