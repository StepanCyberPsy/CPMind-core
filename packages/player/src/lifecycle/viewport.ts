import {
    ELIGIBILITY_THRESHOLD,
    PLAYBACK_THRESHOLD
} from '../player-config.js';

// Три независимых IntersectionObserver для outstream lifecycle:
// 1. eligibility — threshold 0: любой px → начать загрузку
// 2. playback — threshold 0.5 (MRC): 50%+ → play; ниже → pause
// 3. s1 — управляется SDK через S1_VIEWPORT_THRESHOLDS

export interface ViewportObservers {
    disconnect(): void;
}

// Запускает eligibility observer — одноразовый.
// После первого срабатывания отключается и вызывает onEligible
export function observeEligibility(
    target: HTMLElement,
    onEligible: () => void,
): ViewportObservers {
    const io = new IntersectionObserver(
        (entries) => {
            const entry = entries[0];
            if (entry === undefined) return;
            if (entry.isIntersecting) {
                io.disconnect();
                onEligible();
            }
        },
        { threshold: ELIGIBILITY_THRESHOLD },
    );

    io.observe(target);
    return { disconnect: () => io.disconnect() };
}

// Запускает play/pause observer — постоянный на время жизни Player.
// 50%+ видно → onEnter; ниже 50% → onExit
export function observePlayback(
    target: HTMLElement,
    onEnter: () => void,
    onExit: () => void,
): ViewportObservers {
    let isInView = false;

    const io = new IntersectionObserver(
        (entries) => {
            const entry = entries[0];
            if (entry === undefined) return;

            const nowInView = entry.intersectionRatio >= PLAYBACK_THRESHOLD;

            if (nowInView && !isInView) {
                isInView = true;
                onEnter();
            } else if (!nowInView && isInView) {
                isInView = false;
                onExit();
            }
        },
        { threshold: [0, PLAYBACK_THRESHOLD] },
    );

    io.observe(target);
    return { disconnect: () => io.disconnect() };
}