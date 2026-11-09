import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    CpmindOmidFullBranch,
    CpmindOmidFullSession,
    OmidContext,
    OmidSessionEvent,
} from '../src/types.js';

const fixture = vi.hoisted(() => {
    const session = { reportMediaEvent: vi.fn(), finalize: vi.fn() };
    return {
        observer: null as ((event: OmidSessionEvent) => void) | null,
        omidId: 'session',
        listeners: {} as Record<string, Array<(event: unknown) => void>>,
        session,
        start: vi.fn((_input: Parameters<CpmindOmidFullBranch['start']>[0]): CpmindOmidFullSession | null => session),
        load: vi.fn(),
        send: vi.fn(),
    };
});

vi.mock('@iabtechlab-omsdk/open-measurement/omsdk-js/Verification-Client/omid-verification-client-v1.js', () => ({
    OmidVerificationClient: class {
        isSupported() { return true; }
        registerSessionObserver(observer: (event: OmidSessionEvent) => void) {
            fixture.observer = observer;
        }
        addEventListener(type: string, listener: (event: unknown) => void) {
            (fixture.listeners[type] ??= []).push(listener);
        }
    },
}));
vi.mock('@cpmind/sdk', () => ({ detectDeviceType: () => 'desktop' }));
vi.mock('../src/loader.js', () => ({ loadFullBranch: fixture.load }));
vi.mock('../src/transport.js', async (importOriginal) => ({
    ...await importOriginal<typeof import('../src/transport.js')>(),
    sendMeasurement: fixture.send,
}));

function start(sid = 'ad-one', context: OmidContext = { accessMode: 'full' }, omidId = sid) {
    fixture.omidId = omidId;
    fixture.observer!({
        type: 'sessionStart', adSessionId: omidId, timestamp: 1000,
        data: {
            context,
            verificationParameters: JSON.stringify({
                sid, tag_uuid: 'tag', tag_constants_version: 'v4',
                campaign_id: 'campaign', creative_id: sid, creative_type: 'video_creative',
                placement_uuid: 'placement', creative_version_uuid: 'version',
                delivery_kind: 'inline', delivery_mode: 'hosted_video',
                collect_endpoint: 'https://collector.test/api/collect', tag_constants: {},
            }),
        },
    });
}

function finish(omidId = fixture.omidId) {
    fixture.observer!({
        type: 'sessionFinish', adSessionId: omidId, timestamp: 5000, data: {},
    });
}

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('выбор полной ветки и завершение показа', () => {
    let topWindow: Window;
    let currentWindow: Window;
    const branch = (): CpmindOmidFullBranch => ({ start: fixture.start });

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        fixture.observer = null;
        fixture.listeners = {};
        fixture.start.mockReset().mockReturnValue(fixture.session);
        fixture.load.mockReset().mockResolvedValue(branch());
        topWindow = { document: { documentElement: {} } } as unknown as Window;
        currentWindow = Object.assign(new EventTarget(), { top: topWindow }) as unknown as Window;
        vi.stubGlobal('window', currentWindow);
        vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
        vi.stubGlobal('OMID_RUNTIME_VERSION', 'test');
        await import('../src/index.js');
    });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('запускает фабрику в выбранном окне без friendlyToTop и сохраняет контекст', async () => {
        const context: OmidContext = { accessMode: 'full' };
        start('ad-one', context);
        await settle();
        expect(fixture.load).toHaveBeenCalledWith(topWindow);
        expect(fixture.start).toHaveBeenCalledOnce();
        expect(fixture.start.mock.calls[0]![0]).toMatchObject({
            context, startedAt: 1000, params: { sid: 'ad-one' },
        });
        const event = { type: 'pause', timestamp: 2000 };
        for (const listener of fixture.listeners['media']!) listener(event);
        expect(fixture.session.reportMediaEvent).toHaveBeenCalledWith(event);
        finish();
        finish();
        expect(fixture.session.finalize).toHaveBeenCalledOnce();
        expect(fixture.send).not.toHaveBeenCalled();
    });

    it.each(['limited', 'domain', 'unknown', undefined])('не проверяет верхний DOM для режима %s', async (accessMode) => {
        const topRead = vi.fn(() => { throw new Error('must not read top'); });
        Object.defineProperty(currentWindow, 'top', { configurable: true, get: topRead });
        start('partial', {
            ...(accessMode === undefined ? {} : { accessMode: accessMode as NonNullable<OmidContext['accessMode']> }),
        });
        await settle();
        finish();
        expect(topRead).not.toHaveBeenCalled();
        expect(fixture.load).not.toHaveBeenCalled();
        expect(fixture.send).toHaveBeenCalledWith(
            'https://collector.test/api/collect/omid',
            expect.objectContaining({ sid: 'partial', access_level: 'limited', page_collectors_loaded: false }),
        );
    });

    it('full с недоступным документом сохраняется как creative', async () => {
        Object.defineProperty(currentWindow, 'top', {
            get() { throw new Error('SecurityError'); },
        });
        start();
        await settle();
        finish();
        expect(fixture.load).not.toHaveBeenCalled();
        expect(fixture.send.mock.calls[0]![1]).toMatchObject({ access_level: 'creative' });
    });

    it.each(['load-null', 'load-error', 'start-null', 'start-error'])('сохраняет partial при %s', async (failure) => {
        if (failure === 'load-null') fixture.load.mockResolvedValue(null);
        if (failure === 'load-error') fixture.load.mockRejectedValue(new Error('load'));
        if (failure === 'start-null') fixture.start.mockReturnValue(null);
        if (failure === 'start-error') fixture.start.mockImplementation(() => { throw new Error('init'); });
        start();
        await settle();
        finish();
        finish();
        expect(fixture.send).toHaveBeenCalledOnce();
        expect(fixture.send.mock.calls[0]![1]).toMatchObject({
            sid: 'ad-one', page_collectors_loaded: false,
        });
        expect(fixture.session.finalize).not.toHaveBeenCalled();
    });

    it('не запускает полную сессию после уже отправленного partial', async () => {
        let resolve!: (value: CpmindOmidFullBranch) => void;
        fixture.load.mockReturnValue(new Promise<CpmindOmidFullBranch>((done) => { resolve = done; }));
        start();
        finish();
        resolve(branch());
        await settle();
        expect(fixture.start).not.toHaveBeenCalled();
        expect(fixture.send).toHaveBeenCalledOnce();
    });

    it('поздняя загрузка предыдущего запуска не создаёт постороннюю сессию', async () => {
        let resolve!: (value: CpmindOmidFullBranch) => void;
        fixture.load.mockReturnValueOnce(new Promise<CpmindOmidFullBranch>((done) => { resolve = done; }));
        start('old');
        start('new');
        await settle();
        resolve(branch());
        await settle();
        expect(fixture.start).toHaveBeenCalledOnce();
        expect(fixture.start.mock.calls[0]![0]).toMatchObject({ params: { sid: 'new' } });
        finish();
        expect(fixture.session.finalize).toHaveBeenCalledOnce();
    });

    it('не создаёт новую сессию на повторный sessionStart до и после завершения', async () => {
        start();
        start();
        await settle();
        finish();
        start();
        await settle();
        finish();
        expect(fixture.load).toHaveBeenCalledOnce();
        expect(fixture.start).toHaveBeenCalledOnce();
        expect(fixture.listeners['media']).toHaveLength(1);
        expect(fixture.session.finalize).toHaveBeenCalledOnce();
        expect(fixture.send).not.toHaveBeenCalled();
    });

    it('не завершает новый запуск уведомлением от старой OMID-сессии', async () => {
        start('same-delivery', { accessMode: 'full' }, 'old-omid');
        await settle();
        finish();
        fixture.session.finalize.mockClear();
        start('same-delivery', { accessMode: 'full' }, 'new-omid');
        await settle();
        finish('old-omid');
        expect(fixture.session.finalize).not.toHaveBeenCalled();
        finish('new-omid');
        expect(fixture.session.finalize).toHaveBeenCalledOnce();
    });

    it('передаёт ранние медиасобытия после загрузки FULL ровно один раз', async () => {
        let resolve!: (value: CpmindOmidFullBranch) => void;
        fixture.load.mockReturnValue(new Promise<CpmindOmidFullBranch>((done) => { resolve = done; }));
        start();
        const events = [{ type: 'start', timestamp: 1100 }, { type: 'firstQuartile', timestamp: 1200 }];
        for (const event of events) for (const listener of fixture.listeners['media']!) listener(event);
        resolve(branch());
        await settle();
        expect(fixture.session.reportMediaEvent.mock.calls.map(([event]) => event)).toEqual(events);
        finish();
        for (const listener of fixture.listeners['media']!) listener(events[1]);
        expect(fixture.session.reportMediaEvent).toHaveBeenCalledTimes(2);
    });

    it('при переполнении буфера сохраняет partial вместо неполного FULL', async () => {
        let resolve!: (value: CpmindOmidFullBranch) => void;
        fixture.load.mockReturnValue(new Promise<CpmindOmidFullBranch>((done) => { resolve = done; }));
        start();
        for (let n = 0; n < 257; n++) {
            for (const listener of fixture.listeners['media']!) listener({ type: 'pause', timestamp: 1100 + n });
        }
        resolve(branch());
        await settle();
        finish();
        expect(fixture.start).not.toHaveBeenCalled();
        expect(fixture.send).toHaveBeenCalledOnce();
    });

    it('не отправляет partial, если другой клиент уже владеет FULL', async () => {
        fixture.load.mockResolvedValue(null);
        start();
        await settle();
        Object.assign(topWindow, {
            __cpmindOmidFullV1_test: { start: fixture.start, hasRun: () => true },
        });
        finish();
        expect(fixture.send).not.toHaveBeenCalled();
    });
});
