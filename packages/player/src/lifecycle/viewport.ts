import {
    ELIGIBILITY_THRESHOLD,
    PLAYBACK_THRESHOLD
} from '../player-config.js';

// Три независимых IntersectionObserver для outstream lifecycle:
// 1. eligibility — threshold 0: любой px → начать загрузку
// 2. playback — доля видимой площади по MRC: 50%+ → play; ниже → pause
// 3. s1 — управляется SDK через S1_VIEWPORT_THRESHOLDS

export interface ViewportObservers {
    disconnect(): void;
}

// Пороги уведомления наблюдателя. intersectionRatio элемента выше вьюпорта
// не достигает 0.5, поэтому набор из двух отметок оставлял бы колбэк без вызовов
// на всей прокрутке — шаг задаётся плотнее, чем порог воспроизведения
const PLAYBACK_NOTIFY_THRESHOLDS = [
    0,
    0.1,
    0.25,
    0.5,
    0.75,
    1
];

// Видимая доля по стандарту MRC: отношение пересечения к меньшей из двух площадей —
// площади элемента и площади вьюпорта. Элемент, закрывающий экран целиком, видим
// полностью, даже если его собственная площадь больше вьюпорта
function resolveVisibleFraction(entry: IntersectionObserverEntry): number {
    const intersection = entry.intersectionRect;
    const intersectionArea = intersection.width * intersection.height;

    if (intersectionArea <= 0) return 0;

    const target = entry.boundingClientRect;
    const targetArea = target.width * target.height;

    if (targetArea <= 0) return 0;

    // rootBounds отсутствует при межсайтовом наблюдении — резервом служит окно
    const root = entry.rootBounds;
    const rootArea = root !== null
        ? root.width * root.height
        : window.innerWidth * window.innerHeight;

    const referenceArea = rootArea > 0
        ? Math.min(targetArea, rootArea)
        : targetArea;

    return Math.min(1, intersectionArea / referenceArea);
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
// 50%+ видимой площади → onEnter; ниже 50% → onExit
export function observePlayback(
    target: HTMLElement,
    onEnter: () => void,
    onExit: () => void,
): ViewportObservers {
    let isInView = false;

    const io = new IntersectionObserver(
        (entries) => {
            const entry = entries[entries.length - 1];
            if (entry === undefined) return;

            const nowInView = resolveVisibleFraction(entry) >= PLAYBACK_THRESHOLD;

            if (nowInView && !isInView) {
                isInView = true;
                onEnter();
            } else if (!nowInView && isInView) {
                isInView = false;
                onExit();
            }
        },
        { threshold: PLAYBACK_NOTIFY_THRESHOLDS },
    );

    io.observe(target);
    return { disconnect: () => io.disconnect() };
}