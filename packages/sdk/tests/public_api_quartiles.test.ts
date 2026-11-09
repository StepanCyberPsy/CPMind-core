import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TAG_CONSTANTS } from '@cpmind/shared';
import type { Session } from '../src/types.js';
import type { SessionPayloadMeta } from '../src/session.js';
import { prepareMeasurementSession } from '../src/public_api.js';

const fixture = vi.hoisted(() => ({ payloads: [] as string[], reset: null as (() => void) | null }));

// DOM collectors are a boundary here; public API, accumulator and serializer are real.
vi.mock('../src/surface/element.js', () => ({ MeasuredElement: class { dispose() {} } }));
vi.mock('../src/utils/publisher_domain.js', () => ({ getPublisherDomain: () => 'publisher.test' }));
vi.mock('../src/surface/surface.js', async () => {
    const { buildPayload } = await import('../src/session.js');
    return { MeasurementSurface: class {
        constructor(
            _element: HTMLElement,
            private session: Session,
            _config: unknown,
            private meta: SessionPayloadMeta,
            reset: () => void,
        ) { fixture.reset = reset; }
        init() {}
        finalize() { fixture.payloads.push(JSON.stringify(buildPayload(this.session, this.meta))); }
        destroy() {}
    } };
});

function prepare(source?: 'progress' | 'events', durationSec: number | null = null) {
    return prepareMeasurementSession({
        creativeEl: {} as HTMLElement,
        meta: {
            tagUuid: 'tag', tagConstantsVersion: 'v4', campaignId: 'campaign',
            creativeId: 'creative', creativeType: 'video_creative', skippable: false,
            endpoint: 'https://collector.test/api/collect',
        },
        config: { debug: false, constants: DEFAULT_TAG_CONSTANTS },
        video: { muted: false, volume: 1, durationSec },
        ...(source === undefined ? {} : { videoQuartileSource: source }),
    });
}

function finish(session: ReturnType<typeof prepare>) {
    session.finalize('complete');
    return JSON.parse(fixture.payloads.at(-1)!).signals.s6;
}

describe('public SDK quarter evidence through payload serialization', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(10000);
        vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 1200 }));
        vi.stubGlobal('navigator', { userAgent: 'desktop' });
        vi.stubGlobal('document', { documentElement: { scrollHeight: 1000 } });
        fixture.payloads = [];
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('preserves OMID quarter reports without duration', () => {
        const session = prepare('events');
        session.startMeasurement();
        session.reportVideoEvent({ type: 'play', source: 'unknown', timestampMs: Date.now() });
        for (const value of [25, 50, 75] as const) {
            session.reportVideoEvent({ type: 'quartile', value, timestampMs: Date.now() });
        }
        session.reportVideoEvent({ type: 'complete', timestampMs: Date.now() });
        expect(finish(session)).toMatchObject({
            quartile_25: true, quartile_50: true, quartile_75: true,
            audible_quartile_25: true, completion: true, duration_sec: null,
        });
    });

    it('does not infer missing quarters from completion or a later quarter', () => {
        const session = prepare('events', 10);
        session.startMeasurement();
        session.reportVideoEvent({ type: 'play', source: 'unknown', timestampMs: Date.now() });
        session.reportVideoEvent({ type: 'quartile', value: 75, timestampMs: Date.now() });
        vi.advanceTimersByTime(10000);
        session.reportVideoEvent({ type: 'complete', timestampMs: Date.now() });
        expect(finish(session)).toMatchObject({ quartile_25: false, quartile_50: false, quartile_75: true });
    });

    it('retains first quarter audibility despite duplicate and out-of-order reports', () => {
        const session = prepare('events');
        session.startMeasurement();
        session.reportVideoEvent({ type: 'mute', source: 'unknown', timestampMs: Date.now() });
        session.reportVideoEvent({ type: 'quartile', value: 75, timestampMs: Date.now() });
        session.reportVideoEvent({ type: 'unmute', source: 'unknown', timestampMs: Date.now() });
        for (const value of [75, 25, 50] as const) {
            session.reportVideoEvent({ type: 'quartile', value, timestampMs: Date.now() });
        }
        expect(finish(session)).toMatchObject({
            quartile_25: true, quartile_50: true, quartile_75: true,
            audible_quartile_25: true, audible_quartile_75: false,
        });
    });

    it('ignores pre-start and post-finalization quarter events', () => {
        const session = prepare('events');
        session.reportVideoEvent({ type: 'quartile', value: 25, timestampMs: Date.now() });
        session.startMeasurement();
        expect(finish(session).quartile_25).toBe(false);
        session.reportVideoEvent({ type: 'quartile', value: 50, timestampMs: Date.now() });
        session.finalize('complete');
        expect(fixture.payloads).toHaveLength(1);
    });

    it('resets event evidence between segments while retaining event mode', () => {
        const session = prepare('events');
        session.startMeasurement();
        session.reportVideoEvent({ type: 'quartile', value: 25, timestampMs: Date.now() });
        fixture.reset!();
        session.reportVideoEvent({ type: 'quartile', value: 50, timestampMs: Date.now() });
        expect(finish(session)).toMatchObject({ quartile_25: false, quartile_50: true });
    });

    it('does not treat quarter 100 as completion or infer lower quarters', () => {
        const session = prepare('events');
        session.startMeasurement();
        session.reportVideoEvent({ type: 'quartile', value: 100, timestampMs: Date.now() });
        expect(finish(session)).toMatchObject({ completion: false, quartile_25: false, quartile_75: false });
    });

    it.each([undefined, 'progress'] as const)('preserves default seek protection (%s)', (source) => {
        const session = prepare(source, 10);
        session.startMeasurement();
        session.reportVideoEvent({ type: 'play', source: 'user', timestampMs: Date.now() });
        for (let currentTimeSec = 0.25; currentTimeSec <= 2; currentTimeSec += 0.25) {
            vi.advanceTimersByTime(250);
            session.reportVideoEvent({ type: 'progress', currentTimeSec, durationSec: 10, timestampMs: Date.now() });
        }
        session.reportVideoEvent({ type: 'seek', fromSec: 2, toSec: 9, source: 'user', timestampMs: Date.now() });
        session.reportVideoEvent({ type: 'quartile', value: 75, timestampMs: Date.now() });
        session.reportVideoEvent({ type: 'complete', timestampMs: Date.now() });
        expect(finish(session)).toMatchObject({ completion: false, quartile_25: false, quartile_75: false });
    });

    it('retains normal progress, pause/resume, mute and replay behavior', () => {
        const session = prepare(undefined, 10);
        session.startMeasurement();
        const action = (type: 'play' | 'pause' | 'resume' | 'mute' | 'replay') => {
            session.reportVideoEvent({ type, source: 'user', timestampMs: Date.now() });
        };
        action('play');
        for (let currentTimeSec = 0.25; currentTimeSec <= 10; currentTimeSec += 0.25) {
            vi.advanceTimersByTime(250);
            session.reportVideoEvent({ type: 'progress', currentTimeSec, durationSec: 10, timestampMs: Date.now() });
        }
        action('pause');
        action('resume');
        action('mute');
        session.reportVideoEvent({ type: 'complete', timestampMs: Date.now() });
        action('replay');
        expect(finish(session)).toMatchObject({
            completion: true, quartile_25: true, quartile_50: true, quartile_75: true,
            pause_initiated: true, muted_by_user: true, replay_count: 1,
        });
    });
});
