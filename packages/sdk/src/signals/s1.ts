import type { Session, SdkSignalConfig } from '../types.js';

const resetters = new WeakMap<HTMLElement, IntersectionObserver>();

function createObserver(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
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

                if (config.debug) {
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

                    if (!session.mrcCompliant && segmentSec >= 2.0 && session.visiblePixelsPct >= 75) {
                        session.mrcCompliant = true;
                    }

                    session.viewStart = null;

                    if (config.debug) {
                        console.log('[CPMind S1] Exited viewport:', {
                            segmentSec: segmentSec.toFixed(3),
                            totalTimeInViewSec: session.timeInViewSec.toFixed(3),
                            maxContinuousViewSec: session.maxContinuousViewSec.toFixed(3),
                        });
                    }
                }
            }

            if (config.debug) {
                console.log('[CPMind S1] State:', {
                    inView,
                    visiblePixelsPct: pixelsPct,
                    timeInViewSec: session.timeInViewSec.toFixed(3),
                    maxContinuousViewSec: session.maxContinuousViewSec.toFixed(3),
                });
            }
        },
        {
            threshold: config.constants.S1_VIEWPORT_THRESHOLDS,
        },
    );
}

export function initS1(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = createObserver(creativeEl, session, config);
    resetters.set(creativeEl, observer);
    observer.observe(creativeEl);

    window.addEventListener('pagehide', () => {
        resetters.get(creativeEl)?.disconnect();
    }, { once: true });
}

export function resetSegmentS1(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    session.timeInViewSec = 0;
    session.maxContinuousViewSec = 0;
    session.visiblePixelsPct = 0;
    session.mrcCompliant = false;
    session.viewStart = null;
    session.timestampStart = 0;

    resetters.get(creativeEl)?.disconnect();

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = createObserver(creativeEl, session, config);
    resetters.set(creativeEl, observer);
    observer.observe(creativeEl);
}