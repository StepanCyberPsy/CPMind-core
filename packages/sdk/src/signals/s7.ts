import type { Session, SdkSignalConfig } from '../types.js';

const AD_SELECTORS = [
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googletagservices.com"]',
    'iframe[src*="adfox.ru"]',
    'iframe[src*="begun.ru"]',
    'iframe[src*="criteo.com"]',
    'iframe[src*="rtbhouse.com"]',
    'iframe[src*="yandex.ru/adv"]',
    'iframe[src*="ssp.rambler.ru"]',
    '[class*="adsbygoogle"]',
    '[id*="yandex_rtb"]',
    '[class*="banner-ad"]',
    '[class*="ad-banner"]',
    '[class*="advertisement"]',
    'ins.adsbygoogle',
];

function isElementInViewport(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
    );
}

function countCompetingAds(creativeEl: HTMLElement): number {
    let count = 0;
    for (const selector of AD_SELECTORS) {
        let elements: NodeListOf<Element>;
        try {
            elements = document.querySelectorAll(selector);
        } catch {
            continue;
        }
        for (const el of elements) {
            if (el === creativeEl || creativeEl.contains(el)) continue;
            if (isElementInViewport(el)) count++;
        }
    }
    return count;
}

function getCreativePositionY(creativeEl: HTMLElement): number {
    const rect = creativeEl.getBoundingClientRect();
    return Math.round(rect.top + window.scrollY);
}

function checkIsAboveTheFold(creativeEl: HTMLElement): boolean {
    const rect = creativeEl.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
}

export function initS7(
    creativeEl: HTMLElement,
    session: Session,
    config: SdkSignalConfig,
): void {
    session.pageHeightTotalPx = Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.scrollHeight,
        document.body.offsetHeight,
    );

    session.creativePositionYPx = getCreativePositionY(creativeEl);
    session.isAboveTheFold = checkIsAboveTheFold(creativeEl);
    session.competingAdsVisible = countCompetingAds(creativeEl);

    if (config.debug) {
        console.log('[CPMind S7] Initial state:', {
            creativePositionYPx: session.creativePositionYPx,
            pageHeightTotalPx: session.pageHeightTotalPx,
            isAboveTheFold: session.isAboveTheFold,
            competingAdsVisible: session.competingAdsVisible,
        });
    }

    const intervalId = setInterval(() => {
        const isInView = session.viewStart !== null;
        session.viewabilityPersistenceSamples.push(isInView);

        session.competingAdsVisible = countCompetingAds(creativeEl);

        session.pageHeightTotalPx = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
            session.pageHeightTotalPx,
        );

        session.creativePositionYPx = getCreativePositionY(creativeEl);

        if (config.debug) {
            const persistenceCount = session.viewabilityPersistenceSamples.filter(Boolean).length;
            const totalSamples = session.viewabilityPersistenceSamples.length;
            const persistencePct = totalSamples > 0
                ? ((persistenceCount / totalSamples) * 100).toFixed(1)
                : '0.0';
            console.log('[CPMind S7] Sample:', {
                isInView,
                persistencePct: persistencePct + '%',
                competingAdsVisible: session.competingAdsVisible,
            });
        }
    }, config.constants.S7_SAMPLE_INTERVAL_MS);

    window.addEventListener('pagehide', () => {
        clearInterval(intervalId);
    }, { once: true });
}

export function resetSegmentS7(session: Session): void {
    session.viewabilityPersistenceSamples = [];
}