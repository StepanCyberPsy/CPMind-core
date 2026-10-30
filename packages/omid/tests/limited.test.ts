import { describe, expect, it } from 'vitest';
import {
    MAX_INTERVAL_MS,
    createLimitedState,
    onGeometryChange,
    onMediaEvent,
    finalizeAudibleTime,
    averageSharePct,
    VIEWABLE_PERCENT,
} from '../src/limited.js';
import type {
    OmidGeometryChangeEvent,
    OmidMediaEvent,
    OmidViewabilityReason,
} from '../src/types.js';

function geometry(
    timestamp: number,
    percentageInView: number,
    options: {
        onScreen?: { width: number; height: number };
        reasons?: OmidViewabilityReason[];
    } = {},
): OmidGeometryChangeEvent {
    const onScreen = options.onScreen ?? { width: 320, height: 180 };

    return {
        timestamp,
        data: {
            viewport: { width: 1280, height: 720 },
            adView: {
                percentageInView,
                geometry: { x: 0, y: 0, width: 320, height: 180 },
                onScreenGeometry: { x: 0, y: 0, ...onScreen },
                ...(options.reasons !== undefined ? { reasons: options.reasons } : {}),
            },
        },
    };
}

function media(type: string, timestamp: number, data?: OmidMediaEvent['data']): OmidMediaEvent {
    return { type, timestamp, ...(data !== undefined ? { data } : {}) };
}

describe('накопитель ограниченного режима — S1', () => {

    it('засчитывает время только для интервалов выше порога видимости', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(1000, VIEWABLE_PERCENT));
        onGeometryChange(s, geometry(3000, VIEWABLE_PERCENT));   // 2000 мс видимо
        onGeometryChange(s, geometry(4000, 10));                  // 1000 мс видимо
        onGeometryChange(s, geometry(9000, 10));                  // 5000 мс не видимо

        expect(s.viewableTimeMs).toBe(3000);
    });

    it('отслеживает наибольший непрерывный отрезок видимости', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(1000, 90));
        onGeometryChange(s, geometry(2000, 0));    // прерывание
        onGeometryChange(s, geometry(3000, 90));
        onGeometryChange(s, geometry(7000, 90));

        expect(s.maxContinuousViewableMs).toBe(4000);
        expect(s.viewableTimeMs).toBe(6000);
    });
});

describe('накопитель ограниченного режима — S2', () => {

    it('взвешивает долю экрана длительностью интервала, а не числом событий', () => {
        const s = createLimitedState();

        // 320×180 от 1280×720 — это 6.25% площади окна, 160×90 — 1.5625%
        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(1000, 90, { onScreen: { width: 160, height: 90 } }));
        onGeometryChange(s, geometry(9000, 90, { onScreen: { width: 160, height: 90 } }));

        // Интервал 0→1000 прошёл в геометрии события t=0, интервал 1000→9000 —
        // в геометрии события t=1000
        const expected = (6.25 * 1000 + 1.5625 * 8000) / 9000;
        expect(averageSharePct(s)).toBeCloseTo(expected, 5);
        expect(s.maxSharePct).toBeCloseTo(6.25, 5);
    });

    it('без интервалов средняя доля равна нулю, а не NaN', () => {
        const s = createLimitedState();
        onGeometryChange(s, geometry(0, 90));
        expect(averageSharePct(s)).toBe(0);
    });
});

describe('накопитель ограниченного режима — S4', () => {

    it('восстанавливает активность окна из причин невидимости', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(1000, 90, { reasons: ['backgrounded'] }));
        onGeometryChange(s, geometry(4000, 90));
        onGeometryChange(s, geometry(5000, 90, { reasons: ['noWindowFocus'] }));
        onGeometryChange(s, geometry(6000, 90));

        // Интервал относится к состоянию предыдущего события:
        // 0→1000 активен, 1000→4000 в фоне, 4000→5000 активен, 5000→6000 без фокуса
        expect(s.totalTimeMs).toBe(6000);
        expect(s.activeTimeMs).toBe(2000);
        expect(s.inactiveSwitches).toBe(2);
    });

    it('не считает переключением продолжение неактивного состояния', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(1000, 90, { reasons: ['hidden'] }));
        onGeometryChange(s, geometry(2000, 90, { reasons: ['hidden'] }));
        onGeometryChange(s, geometry(3000, 90, { reasons: ['hidden'] }));

        expect(s.inactiveSwitches).toBe(1);
    });
});

describe('накопитель ограниченного режима — S6', () => {

    it('фиксирует квартили и завершение', () => {
        const s = createLimitedState();

        onMediaEvent(s, media('loaded', 0, { duration: 30 }));
        onMediaEvent(s, media('start', 100, { mediaPlayerVolume: 1 }));
        onMediaEvent(s, media('firstQuartile', 200));
        onMediaEvent(s, media('midpoint', 300));
        onMediaEvent(s, media('thirdQuartile', 400));
        onMediaEvent(s, media('complete', 500));

        expect(s.durationSec).toBe(30);
        expect(s.started).toBe(true);
        expect(s.quartiles).toEqual({ q25: true, q50: true, q75: true, complete: true });
    });

    it('накапливает время со звуком по изменениям громкости', () => {
        const s = createLimitedState();

        onMediaEvent(s, media('start', 1000, { mediaPlayerVolume: 1 }));
        onMediaEvent(s, media('volumeChange', 4000, { mediaPlayerVolume: 0 }));  // +3000 мс
        onMediaEvent(s, media('volumeChange', 6000, { mediaPlayerVolume: 1 }));  // тишина
        finalizeAudibleTime(s, 7500);                                            // +1500 мс

        expect(s.audibleTimeMs).toBe(4500);
        expect(s.muted).toBe(false);
    });

    it('ролик, запущенный без звука, времени со звуком не накапливает', () => {
        const s = createLimitedState();

        onMediaEvent(s, media('start', 0, { mediaPlayerVolume: 0 }));
        finalizeAudibleTime(s, 10_000);

        expect(s.audibleTimeMs).toBe(0);
        expect(s.muted).toBe(true);
    });

    it('различает пропуск и паузу', () => {
        const s = createLimitedState();

        onMediaEvent(s, media('pause', 100));
        onMediaEvent(s, media('skipped', 200));

        expect(s.paused).toBe(true);
        expect(s.skipped).toBe(true);
    });
});

describe('накопитель ограниченного режима — S5', () => {

    it('фиксирует только клик: прочих признаков взаимодействия в этих режимах нет', () => {
        const s = createLimitedState();

        onMediaEvent(s, media('adUserInteraction', 100, { interactionType: 'invitationAccept' }));
        expect(s.clicked).toBe(false);

        onMediaEvent(s, media('adUserInteraction', 200, { interactionType: 'click' }));
        expect(s.clicked).toBe(true);
    });
});

describe('разрыв потока событий', () => {

    it('интервал длиннее потолка не достаётся ни одному состоянию', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(2000, 90));                       // засчитан
        onGeometryChange(s, geometry(2000 + MAX_INTERVAL_MS + 1, 90)); // отброшен
        onGeometryChange(s, geometry(2000 + MAX_INTERVAL_MS + 3000, 90));

        // Учтены только интервалы 0→2000 и последний в 2999 мс
        expect(s.totalTimeMs).toBe(2000 + 2999);
        expect(s.viewableTimeMs).toBe(2000 + 2999);
        expect(s.droppedIntervalMs).toBe(MAX_INTERVAL_MS + 1);
    });

    it('разрыв прерывает непрерывность просмотра', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(5000, 90));
        onGeometryChange(s, geometry(5000 + MAX_INTERVAL_MS + 1, 90));
        onGeometryChange(s, geometry(5000 + MAX_INTERVAL_MS + 2000, 90));

        // До разрыва 5000 мс, после — 1999 мс; склейки в 6999 быть не должно
        expect(s.maxContinuousViewableMs).toBe(5000);
    });

    it('состояние после разрыва всё равно обновляется', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(MAX_INTERVAL_MS + 1, 10, {
            onScreen: { width: 160, height: 90 },
            reasons: ['viewport'],
        }));
        onGeometryChange(s, geometry(MAX_INTERVAL_MS + 2000, 10));

        // Интервал после разрыва относится к доле, наблюдённой при разрыве
        expect(s.lastSharePct).toBeCloseTo(6.25, 5);
        expect(s.viewableTimeMs).toBe(0);
    });

    it('ровно потолок ещё засчитывается', () => {
        const s = createLimitedState();

        onGeometryChange(s, geometry(0, 90));
        onGeometryChange(s, geometry(MAX_INTERVAL_MS, 90));

        expect(s.totalTimeMs).toBe(MAX_INTERVAL_MS);
        expect(s.droppedIntervalMs).toBe(0);
    });
});
