import { describe, expect, it } from 'vitest';
import { toVideoEvent, resolveCreativeElement } from '../src/full.js';
import type { OmidContext, OmidMediaEvent } from '../src/types.js';

function media(type: string, data?: OmidMediaEvent['data']): OmidMediaEvent {
    return { type, timestamp: 1700, ...(data !== undefined ? { data } : {}) };
}

describe('перевод медиасобытий OMID', () => {

    it('переносит метку времени события, а не момент обработки', () => {
        const [event] = toVideoEvent(media('start'));
        expect(event).toMatchObject({ type: 'play', timestampMs: 1700 });
    });

    it('источник действия помечается как неизвестный', () => {
        // OMID источник не сообщает. Он участвует в обучении моделей,
        // поэтому догадка исказила бы выборку
        for (const type of ['start', 'pause', 'resume', 'skipped']) {
            const [event] = toVideoEvent(media(type));
            expect(event).toMatchObject({ source: 'unknown' });
        }
    });

    it('квартили переводятся в числовые значения накопителя', () => {
        expect(toVideoEvent(media('firstQuartile'))[0]).toMatchObject({ type: 'quartile', value: 25 });
        expect(toVideoEvent(media('midpoint'))[0]).toMatchObject({ type: 'quartile', value: 50 });
        expect(toVideoEvent(media('thirdQuartile'))[0]).toMatchObject({ type: 'quartile', value: 75 });
        expect(toVideoEvent(media('complete'))[0]).toMatchObject({ type: 'complete' });
    });

    it('изменение громкости даёт и признак звука, и значение', () => {
        expect(toVideoEvent(media('volumeChange', { mediaPlayerVolume: 0 })))
            .toMatchObject([{ type: 'mute' }, { type: 'volume', volume: 0 }]);

        expect(toVideoEvent(media('volumeChange', { mediaPlayerVolume: 0.6 })))
            .toMatchObject([{ type: 'unmute' }, { type: 'volume', volume: 0.6 }]);
    });

    it('громкость без значения не порождает событий', () => {
        expect(toVideoEvent(media('volumeChange'))).toEqual([]);
    });

    it('длительность берётся только из положительного значения', () => {
        expect(toVideoEvent(media('loaded', { duration: 30 })))
            .toMatchObject([{ type: 'duration_known', durationSec: 30 }]);

        expect(toVideoEvent(media('loaded', { duration: 0 }))).toEqual([]);
        expect(toVideoEvent(media('loaded'))).toEqual([]);
    });

    it('неизвестные события отбрасываются, а не приводятся к похожим', () => {
        for (const type of ['bufferStart', 'bufferFinish', 'playerStateChange', 'adUserInteraction']) {
            expect(toVideoEvent(media(type))).toEqual([]);
        }
    });
});

describe('выбор измеряемого элемента', () => {

    it('предпочитает элемент видео, затем слот', () => {
        const video = { nodeType: 1 } as unknown as HTMLVideoElement;
        const slot = { nodeType: 1 } as unknown as HTMLElement;

        expect(resolveCreativeElement({ videoElement: video, slotElement: slot }))
            .toBe(video);

        expect(resolveCreativeElement({ slotElement: slot })).toBe(slot);
    });

    it('узел, не являющийся элементом, не принимается', () => {
        const textNode = { nodeType: 3 } as unknown as HTMLElement;
        expect(resolveCreativeElement({ slotElement: textNode })).toBeNull();
    });

    it('без ссылок на элементы возвращает null', () => {
        expect(resolveCreativeElement({ environment: 'web' })).toBeNull();
    });
});
