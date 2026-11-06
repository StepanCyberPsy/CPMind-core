import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toVideoEvent, resolveCreativeElement, startFullMeasurement } from '../src/full.js';
import type { CpmindVerificationParams, OmidContext, OmidMediaEvent } from '../src/types.js';

const sdk = vi.hoisted(() => {
    vi.stubGlobal('OMID_RUNTIME_VERSION', 'test');
    return { prepare: vi.fn() };
});
vi.mock('@cpmind/sdk', () => ({ prepareMeasurementSession: sdk.prepare }));

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

describe('полная сессия и документ элемента', () => {
    const localWindow = {} as Window;
    const doc = { defaultView: localWindow } as Document;
    const params: CpmindVerificationParams = {
        sid: 'ad-one', tag_uuid: 'tag', tag_constants_version: 'v4',
        campaign_id: 'campaign', creative_id: 'creative', creative_type: 'video_creative',
        placement_uuid: 'placement', creative_version_uuid: 'version', delivery_kind: 'inline',
        collect_endpoint: 'https://collector.test/api/collect', delivery_mode: 'hosted_video',
        tag_constants: {},
    };
    const element = (ownerDocument: Document = doc, isConnected = true) => ({
        nodeType: 1, ownerDocument, isConnected,
    }) as unknown as HTMLVideoElement;
    const session = () => ({
        startMeasurement: vi.fn(), reportVideoEvent: vi.fn(), finalize: vi.fn(),
    });

    beforeEach(() => {
        sdk.prepare.mockReset();
        sdk.prepare.mockImplementation(session);
        vi.stubGlobal('window', localWindow);
        vi.stubGlobal('document', doc);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('сохраняет точный элемент, метаданные и время начала', () => {
        const video = element();
        const result = startFullMeasurement({ params, context: { videoElement: video }, startedAt: 1200 });
        expect(result).not.toBeNull();
        expect(sdk.prepare.mock.calls[0]![0].creativeEl).toBe(video);
        expect(sdk.prepare.mock.calls[0]![0].meta.adSessionIdentity.adSessionId).toBe('ad-one');
        expect(sdk.prepare.mock.results[0]!.value.startMeasurement).toHaveBeenCalledWith(1200);
    });

    it('не создаёт SDK для отсутствующего, отсоединённого или чужого элемента', () => {
        for (const context of [
            {}, { videoElement: element(doc, false) }, { videoElement: element({} as Document) },
        ]) {
            expect(startFullMeasurement({ params, context, startedAt: 0 })).toBeNull();
        }
        expect(sdk.prepare).not.toHaveBeenCalled();
    });

    it('не принимает документ, не принадлежащий исполняющему окну', () => {
        vi.stubGlobal('window', {});
        expect(startFullMeasurement({
            params, context: { videoElement: element() }, startedAt: 0,
        })).toBeNull();
        expect(sdk.prepare).not.toHaveBeenCalled();
    });

    it('отказ инициализации оставляет возможность partial', () => {
        sdk.prepare.mockImplementation(() => { throw new Error('init failed'); });
        expect(startFullMeasurement({
            params, context: { videoElement: element() }, startedAt: 0,
        })).toBeNull();
    });

    it('два креатива имеют независимые события и однократную финализацию', () => {
        const first = startFullMeasurement({ params, context: { videoElement: element() }, startedAt: 0 })!;
        const second = startFullMeasurement({
            params: { ...params, sid: 'ad-two' }, context: { videoElement: element() }, startedAt: 0,
        })!;
        const firstSdk = sdk.prepare.mock.results[0]!.value;
        const secondSdk = sdk.prepare.mock.results[1]!.value;
        first.reportMediaEvent(media('pause'));
        expect(firstSdk.reportVideoEvent).toHaveBeenCalledOnce();
        expect(secondSdk.reportVideoEvent).not.toHaveBeenCalled();
        first.finalize();
        first.finalize();
        expect(firstSdk.finalize).toHaveBeenCalledOnce();
        expect(secondSdk.finalize).not.toHaveBeenCalled();
        second.finalize();
        expect(secondSdk.finalize).toHaveBeenCalledOnce();
    });
});
