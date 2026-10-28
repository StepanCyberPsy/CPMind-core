import type {
    OmidAdView,
    OmidGeometryChangeEvent,
    OmidMediaEvent,
    OmidViewport,
} from './types.js';

/**
 * Порог видимости показа — тот же, что у S1 в SDK.
 *
 * Значение продублировано намеренно: импорт из @cpmind/shared втягивает в бандл
 * zod и все схемы пакета, а скрипт грузится на каждом показе у стороннего плеера.
 * Совпадение с DEFAULT_TAG_CONSTANTS.S1_VIEWPORT_THRESHOLDS закреплено тестом
 * tests/viewable_threshold.test.ts — расхождение не пройдёт сборку.
 */
const VIEWABLE_PERCENT = 75;

/**
 * Потолок длительности одного интервала.
 *
 * События OMID приходят по факту изменения геометрии, поэтому их отсутствие
 * само по себе означает «ничего не менялось» — тот потолок в две длительности
 * выборки, что стоит у S2 в SDK, здесь занизил бы неподвижную рекламу.
 * Но интервал длиннее порога присутствия засчитывать нельзя: по определению
 * продукта зрителя за экраном к этому моменту уже нет.
 *
 * Значение равно DEFAULT_TAG_CONSTANTS.PRESENCE_IDLE_TIMEOUT_MS, совпадение
 * закреплено тестом tests/viewable_threshold.test.ts
 */
const MAX_INTERVAL_MS = 60_000;

/**
 * Накопитель сигналов для режимов без доступа к странице.
 *
 * Источник данных — события OMID, а не наблюдение элемента: собирается то,
 * что физически доступно (S1, S2, S4 и видеочасть S6). Прокрутка, курсор
 * и окружение рекламы в этих режимах не существуют и остаются пустыми.
 *
 * Чистая машина состояний без обращений к DOM: тестируется подачей событий.
 */
export interface LimitedState {
    startedAt: number | null;
    lastGeometryAt: number | null;

    // S1
    viewableTimeMs: number;
    maxContinuousViewableMs: number;
    currentContinuousMs: number;
    maxPercentageInView: number;

    // S2
    shareSamplesSum: number;
    shareSamplesWeightMs: number;
    maxSharePct: number;
    lastSharePct: number;

    // S4 — активность окна восстанавливается из причин невидимости
    activeTimeMs: number;
    totalTimeMs: number;
    inactiveSwitches: number;
    wasInactive: boolean;

    // Суммарная длительность отброшенных интервалов — диагностика качества
    // потока событий площадки, в сигналы не входит
    droppedIntervalMs: number;

    // S5 — в этих режимах доступен только факт взаимодействия
    clicked: boolean;

    // S6 — заполняется медиасобытиями
    quartiles: { q25: boolean; q50: boolean; q75: boolean; complete: boolean };
    started: boolean;
    paused: boolean;
    skipped: boolean;
    volume: number;
    muted: boolean;
    audibleTimeMs: number;
    lastVolumeChangeAt: number | null;
    durationSec: number | null;
    noOutputDevice: boolean;
}

export function createLimitedState(): LimitedState {
    return {
        startedAt: null,
        lastGeometryAt: null,
        viewableTimeMs: 0,
        maxContinuousViewableMs: 0,
        currentContinuousMs: 0,
        maxPercentageInView: 0,
        shareSamplesSum: 0,
        shareSamplesWeightMs: 0,
        maxSharePct: 0,
        lastSharePct: 0,
        activeTimeMs: 0,
        totalTimeMs: 0,
        inactiveSwitches: 0,
        wasInactive: false,
        droppedIntervalMs: 0,
        clicked: false,
        quartiles: { q25: false, q50: false, q75: false, complete: false },
        started: false,
        paused: false,
        skipped: false,
        volume: 0,
        muted: true,
        audibleTimeMs: 0,
        lastVolumeChangeAt: null,
        durationSec: null,
        noOutputDevice: false,
    };
}

function isInactive(adView: OmidAdView): boolean {
    const reasons = adView.reasons ?? [];
    return reasons.includes('backgrounded')
        || reasons.includes('noWindowFocus')
        || reasons.includes('hidden');
}

function sharePct(adView: OmidAdView, viewport: OmidViewport): number {
    const viewportArea = viewport.width * viewport.height;
    if (viewportArea <= 0) return 0;

    const onScreen = adView.onScreenGeometry;
    const visibleArea = Math.max(0, onScreen.width) * Math.max(0, onScreen.height);

    return Math.min(100, (visibleArea / viewportArea) * 100);
}

/**
 * Геометрия приходит событиями, а не равномерной выборкой: интервал между
 * соседними событиями относится к состоянию, объявленному предыдущим.
 * Поэтому время засчитывается задним числом, а доля экрана взвешивается
 * длительностью интервала — иначе частые события перевесили бы редкие.
 */
export function onGeometryChange(
    state: LimitedState,
    event: OmidGeometryChangeEvent,
): void {
    const { viewport, adView } = event.data;
    const now = event.timestamp;

    if (state.startedAt === null) state.startedAt = now;

    if (state.lastGeometryAt !== null) {
        const rawDeltaMs = Math.max(0, now - state.lastGeometryAt);

        // Превышение потолка означает разрыв наблюдения: как и suspend() у S2
        // в SDK, такой интервал не достаётся ни одному состоянию
        if (rawDeltaMs > MAX_INTERVAL_MS) {
            state.droppedIntervalMs += rawDeltaMs;
            state.currentContinuousMs = 0;
            state.lastGeometryAt = now;
            applyObservation(state, adView, viewport);
            return;
        }

        const deltaMs = rawDeltaMs;

        state.totalTimeMs += deltaMs;

        if (state.wasInactive) {
            // интервал прошёл в неактивном окне
        } else {
            state.activeTimeMs += deltaMs;
        }

        if (state.maxPercentageInView >= VIEWABLE_PERCENT) {
            state.viewableTimeMs += deltaMs;
            state.currentContinuousMs += deltaMs;
            state.maxContinuousViewableMs = Math.max(
                state.maxContinuousViewableMs,
                state.currentContinuousMs,
            );
        } else {
            state.currentContinuousMs = 0;
        }

        state.shareSamplesSum += state.lastSharePct * deltaMs;
        state.shareSamplesWeightMs += deltaMs;
    }

    state.lastGeometryAt = now;
    applyObservation(state, adView, viewport);
}

// Фиксация наблюдённого состояния: применяется и на обычном интервале,
// и после разрыва — состояние обновляется в обоих случаях
function applyObservation(
    state: LimitedState,
    adView: OmidAdView,
    viewport: OmidViewport,
): void {
    const inactive = isInactive(adView);
    if (inactive && !state.wasInactive) state.inactiveSwitches += 1;
    state.wasInactive = inactive;

    state.maxPercentageInView = adView.percentageInView;

    const share = sharePct(adView, viewport);
    state.maxSharePct = Math.max(state.maxSharePct, share);
    state.lastSharePct = share;
}

export function onMediaEvent(state: LimitedState, event: OmidMediaEvent): void {
    const volume = event.data?.mediaPlayerVolume
        ?? event.data?.videoPlayerVolume;

    switch (event.type) {
        case 'loaded': {
            if (typeof event.data?.duration === 'number') {
                state.durationSec = event.data.duration;
            }
            break;
        }
        case 'start': {
            state.started = true;
            if (typeof volume === 'number') {
                state.volume = volume;
                state.muted = volume <= 0;
            }
            state.lastVolumeChangeAt = event.timestamp;
            break;
        }
        case 'firstQuartile': state.quartiles.q25 = true; break;
        case 'midpoint': state.quartiles.q50 = true; break;
        case 'thirdQuartile': state.quartiles.q75 = true; break;
        case 'complete': state.quartiles.complete = true; break;
        case 'pause': state.paused = true; break;
        case 'skipped': state.skipped = true; break;
        case 'volumeChange': {
            // Время со звуком накапливается на изменениях громкости: отрезок
            // относится к громкости, действовавшей до события
            if (state.lastVolumeChangeAt !== null && !state.muted) {
                state.audibleTimeMs += Math.max(0, event.timestamp - state.lastVolumeChangeAt);
            }
            if (typeof volume === 'number') {
                state.volume = volume;
                state.muted = volume <= 0;
            }
            state.lastVolumeChangeAt = event.timestamp;
            break;
        }
        case 'adUserInteraction': {
            if (event.data?.interactionType === 'click') state.clicked = true;
            break;
        }
        default: break;
    }
}

export function finalizeAudibleTime(state: LimitedState, endTimestamp: number): void {
    if (state.lastVolumeChangeAt !== null && !state.muted) {
        state.audibleTimeMs += Math.max(0, endTimestamp - state.lastVolumeChangeAt);
        state.lastVolumeChangeAt = endTimestamp;
    }
}

export function averageSharePct(state: LimitedState): number {
    if (state.shareSamplesWeightMs <= 0) return 0;
    return state.shareSamplesSum / state.shareSamplesWeightMs;
}

export { VIEWABLE_PERCENT, MAX_INTERVAL_MS };
