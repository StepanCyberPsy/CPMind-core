import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullSessionRegistry, getFullSessionRegistry, getOmidRunKey } from '../src/full_sessions.js';
import type { CpmindOmidFullInput } from '../src/types.js';

const input = (sid = 'delivery', omidSessionId = 'omid'): CpmindOmidFullInput => ({
    params: {
        sid, tag_uuid: 'tag', tag_constants_version: 'v4', campaign_id: 'campaign',
        creative_id: 'creative', creative_type: 'video_creative', placement_uuid: 'placement',
        creative_version_uuid: 'version', delivery_kind: 'inline', delivery_mode: 'outstream',
        collect_endpoint: 'https://collector.test/api/collect', tag_constants: {},
    },
    context: {}, startedAt: 1000, omidSessionId,
});

describe('shared ownership of FULL OMID runs', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10000); });
    afterEach(() => { vi.useRealTimers(); });
    const element = {} as HTMLElement;
    const raw = () => ({ reportMediaEvent: vi.fn(), finalize: vi.fn() });

    it('has one owner and passive duplicate clients, including after finalization', () => {
        const registry = new FullSessionRegistry();
        const underlying = raw();
        const create = vi.fn(() => underlying);
        const owner = registry.start(input(), element, create)!;
        const duplicate = registry.start({ ...input(), startedAt: 2000 }, element, create)!;
        const media = { type: 'pause', timestamp: 2000 };
        owner.reportMediaEvent(media);
        duplicate.reportMediaEvent(media);
        duplicate.finalize();
        expect(underlying.finalize).not.toHaveBeenCalled();
        owner.finalize();
        owner.finalize();
        const late = registry.start(input(), null, create)!;
        late.reportMediaEvent(media);
        late.finalize();
        expect(create).toHaveBeenCalledOnce();
        expect(underlying.finalize).toHaveBeenCalledOnce();
        expect(underlying.reportMediaEvent).toHaveBeenCalledOnce();
    });

    it('observes SDK removal/finalization without waiting for OMID finish', () => {
        const registry = new FullSessionRegistry();
        const underlying = raw();
        let close!: () => void;
        const owner = registry.start(input(), element, (done) => { close = done; return underlying; })!;
        close();
        owner.reportMediaEvent({ type: 'pause', timestamp: 2000 });
        owner.finalize();
        expect(underlying.reportMediaEvent).not.toHaveBeenCalled();
        expect(underlying.finalize).not.toHaveBeenCalled();
        expect(registry.hasRun(input())).toBe(true);
    });

    it('keeps distinct delivery/OMID runs independent on a reused element', () => {
        const registry = new FullSessionRegistry();
        const create = vi.fn(raw);
        for (const request of [input(), input('second'), input('delivery', 'second-omid')]) {
            registry.start(request, element, create)!.finalize();
        }
        expect(create).toHaveBeenCalledTimes(3);
        for (const result of create.mock.results) expect(result.value.finalize).toHaveBeenCalledOnce();
    });

    it('does not merge conflicting metadata or elements', () => {
        const registry = new FullSessionRegistry();
        registry.start(input(), element, raw);
        const conflict = input();
        conflict.params.creative_id = 'another-creative';
        expect(registry.start(conflict, element, raw)).toBeNull();
        expect(registry.start(input(), {} as HTMLElement, raw)).toBeNull();
        expect(registry.hasRun(conflict)).toBe(false);
    });

    it('allows retry after null or throwing initialization', () => {
        const registry = new FullSessionRegistry();
        expect(registry.start(input(), element, () => null)).toBeNull();
        expect(registry.hasRun(input())).toBe(false);
        expect(() => registry.start(input(), element, () => { throw new Error('init'); })).toThrow('init');
        expect(registry.hasRun(input())).toBe(false);
        expect(registry.start(input(), element, raw)).not.toBeNull();
    });

    it.each(['null', 'throw'])('late callback from failed initialization cannot close the retry (%s)', (failure) => {
        const registry = new FullSessionRegistry();
        let abandonedClose!: () => void;
        const attempt = () => registry.start(input(), element, (close) => {
            abandonedClose = close;
            if (failure === 'throw') throw new Error('init');
            return null;
        });
        if (failure === 'throw') expect(attempt).toThrow('init');
        else expect(attempt()).toBeNull();

        const underlying = raw();
        const retry = registry.start(input(), element, () => underlying)!;
        abandonedClose();
        const createAnother = vi.fn(raw);
        const duplicate = registry.start(input(), element, createAnother)!;
        duplicate.finalize();
        expect(createAnother).not.toHaveBeenCalled();
        expect(underlying.finalize).not.toHaveBeenCalled();
        retry.finalize();
        expect(underlying.finalize).toHaveBeenCalledOnce();
    });

    it('bounds completed records without evicting active runs', () => {
        const registry = new FullSessionRegistry();
        registry.start(input('active'), element, raw);
        for (let n = 0; n < 1025; n++) registry.start(input(String(n)), element, raw)!.finalize();
        expect(registry.hasRun(input('0'))).toBe(false);
        expect(registry.hasRun(input('1024'))).toBe(true);
        expect(registry.hasRun(input('active'))).toBe(true);
        vi.advanceTimersByTime(30 * 60 * 1000);
        expect(registry.hasRun(input('1024'))).toBe(false);
        expect(registry.hasRun(input('active'))).toBe(true);
    });

    it('uses start time only when OMID identity is absent', () => {
        expect(getOmidRunKey(input())).toBe(getOmidRunKey({ ...input(), startedAt: 2000 }));
        const { omidSessionId: _unused, ...fallback } = input();
        expect(getOmidRunKey(fallback)).not.toBe(getOmidRunKey({ ...fallback, startedAt: 2000 }));
    });

    it('does not share state between target windows', () => {
        const first = {} as Window;
        const second = {} as Window;
        expect(getFullSessionRegistry(first)).toBe(getFullSessionRegistry(first));
        expect(getFullSessionRegistry(first)).not.toBe(getFullSessionRegistry(second));
    });
});
