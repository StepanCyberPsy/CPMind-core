import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const shared = require('@cpmind/shared');
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const flush = () => new Promise((done) => setImmediate(done));

function fixture(creativeType, options = {}) {
    let now = 1_000;
    let nextTimer = 0;
    let bridgeCleanups = 0;
    const timers = new Map();
    const events = [];
    const prepared = [];
    const started = [];
    const intersections = [];
    const mutations = [];
    const elements = [];

    class Target {
        listeners = new Map();
        addEventListener(type, listener) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(listener);
        }
        removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
        emit(type) {
            for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
        }
    }

    class Element extends Target {
        style = {};
        children = [];
        isConnected = true;
        sandbox = {add() {}};
        complete = !options.loading;
        naturalWidth = options.loading ? 0 : 300;
        constructor(tag) { super(); this.tag = tag; elements.push(this); }
        get firstChild() { return this.children[0] ?? null; }
        appendChild(child) { this.children.push(child); }
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
        setAttribute() {}
        async decode() {}
    }

    const window = new Target();
    window.location = {search: ''};
    const container = new Element('div');
    const document = {documentElement: {}, createElement: (tag) => new Element(tag)};
    const entry = {
        creativeType, container,
        adSessionId: '11111111-1111-4111-8111-111111111111',
        placementUuid: '22222222-2222-4222-8222-222222222222',
        creativeVersionUuid: null,
        deliveryMode: 'display', measurementMode: 'full_direct_display',
        campaignId: 'fixture-campaign', creativeId: 'fixture-creative', tagUuid: 'fixture-tag',
        tagConstantsVersion: 'fixture', tagConstants: shared.DEFAULT_TAG_CONSTANTS,
        skippable: false, collectEndpoint: 'https://fixture.invalid/collect',
        deliveryEventEndpoint: 'https://fixture.invalid/event',
        assetUrl: 'https://fixture.invalid/asset', clickUrl: null,
        width: 300, height: 250, timeouts: {adLoadTotalMs: 500},
    };
    window.__CPMIND_QUEUE__ = [entry];

    const sdk = {
        sendDeliveryEvent: async (payload) => { events.push(payload); },
        prepareMeasurementSession(input) {
            prepared.push(input);
            let state = 'PREPARED';
            return {
                get state() { return state; },
                startMeasurement(timestamp) { state = 'MEASURING'; started.push(timestamp); },
                reportFrameInteraction() {},
                finalize(reason) { state = 'FINALIZED'; input.onFinalized?.(reason); },
            };
        },
    };

    const bridge = {
        async waitForHtml5Ready({signal, onCreativeReady}) {
            if (options.loading) {
                await new Promise((done, reject) => {
                    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
                    if (signal.aborted) onAbort();
                    else signal.addEventListener('abort', onAbort, {once: true});
                });
            }
            onCreativeReady();
            return {renderConfirmedAt: now, connect() {}, cleanup() { bridgeCleanups++; }};
        },
    };

    const context = vm.createContext({
        window, document, console, URL, DOMException, AbortController,
        Date: class extends Date { static now() { return now; } },
        setTimeout(callback, delay) {
            const id = ++nextTimer;
            timers.set(id, {callback, at: now + delay});
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        requestAnimationFrame(callback) { queueMicrotask(() => callback(now)); },
        MutationObserver: class {
            active = false;
            constructor(callback) { this.callback = callback; mutations.push(this); }
            observe() { this.active = true; }
            disconnect() { this.active = false; }
        },
        IntersectionObserver: options.noIntersectionObserver ? undefined : class {
            active = false;
            constructor(callback, config) {
                if (options.observerError) throw new Error('observer failed');
                this.callback = callback;
                this.config = config;
                intersections.push(this);
            }
            observe() {
                this.active = true;
                if (options.initiallyVisible) queueMicrotask(() => this.notify(true, 1));
            }
            disconnect() { this.active = false; }
            notify(isIntersecting, intersectionRatio) {
                this.callback([{isIntersecting, intersectionRatio}]);
            }
        },
    });
    const modules = new Map();
    function load(file) {
        if (modules.has(file)) return modules.get(file).exports;
        const module = {exports: {}};
        modules.set(file, module);
        const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
        }).outputText;
        const localRequire = (name) => {
            if (name === '@cpmind/shared') return shared;
            if (name === '@cpmind/sdk') return sdk;
            if (name === './html5_bridge.js') return bridge;
            assert.ok(name.startsWith('./'), `Unexpected dependency: ${name}`);
            return load(resolve(dirname(file), name.replace(/\.js$/, '.ts')));
        };
        vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, {filename:file})(localRequire, module, module.exports);
        return module.exports;
    }
    load(resolve(sourceRoot, 'index.ts'));

    return {
        events, prepared, started, intersections, mutations, elements, container,
        get bridgeCleanups() { return bridgeCleanups; },
        tick(ms) {
            now += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.at <= now) { timers.delete(id); timer.callback(); }
            }
        },
        enter(isIntersecting = true, ratio = 0.01) {
            intersections.at(-1).notify(isIntersecting, ratio);
        },
        remove() {
            container.isConnected = false;
            for (const observer of mutations) if (observer.active) observer.callback();
        },
        pagehide() { window.emit('pagehide'); },
        assertReleased() {
            assert.ok(intersections.every((observer) => !observer.active));
            assert.ok(mutations.every((observer) => !observer.active));
            assert.equal(window.listeners.get('pagehide')?.size ?? 0, 0);
            assert.equal(timers.size, 0);
        },
    };
}

for (const creativeType of ['banner_static', 'banner_gif', 'banner_html5']) {
    test(`TEST-BNR-START/TIMING: ${creativeType} waits for viewport and starts once at entry time`, async () => {
        const f = fixture(creativeType);
        await flush();
        assert.equal(f.events.filter((event) => event.eventType === 'render_confirmed').length, 1);
        assert.equal(f.prepared.length, 0);
        f.tick(120_000);
        f.enter(false, 0);
        f.enter(true, 0);
        await flush();
        assert.equal(f.prepared.length, 0);
        assert.equal(f.events.filter((event) => event.eventType === 'creative_error').length, 0);
        f.enter();
        await flush();
        assert.equal(f.prepared.length, 1);
        assert.deepEqual(f.started, [121_000]);
        assert.equal(f.events.filter((event) => event.eventType === 'measurement_started').length, 1);
        f.enter();
        await flush();
        assert.equal(f.prepared.length, 1);
        assert.equal(f.started.length, 1);
        f.assertReleased();
    });

    for (const reason of ['page_unload', 'creative_removed']) {
        test(`TEST-BNR-CANCEL: ${creativeType} releases pending resources on ${reason}`, async () => {
            const f = fixture(creativeType);
            await flush();
            if (reason === 'page_unload') f.pagehide();
            else f.remove();
            await flush();
            assert.equal(f.prepared.length, 0);
            assert.equal(f.started.length, 0);
            const closed = f.events.filter((event) => event.eventType === 'closed');
            assert.equal(closed.length, 1);
            assert.equal(closed[0].finalizationReason, reason);
            assert.equal(f.events.filter((event) => event.eventType === 'creative_error').length, 0);
            assert.equal(f.bridgeCleanups, creativeType === 'banner_html5' ? 1 : 0);
            f.pagehide();
            f.tick(120_000);
            await flush();
            assert.equal(f.events.filter((event) => event.eventType === 'closed').length, 1);
            f.assertReleased();
        });
    }
}

test('TEST-BNR-START: an initially visible banner starts after render readiness', async () => {
    const f = fixture('banner_static', {initiallyVisible:true});
    assert.equal(f.prepared.length, 0);
    await flush();
    assert.deepEqual(f.started, [1_000]);
    const types = f.events.map((event) => event.eventType);
    assert.ok(types.indexOf('render_confirmed') < types.indexOf('measurement_started'));
    f.assertReleased();
});

test('TEST-BNR-CANCEL: removal between intersection and SDK preparation prevents measurement', async () => {
    const f = fixture('banner_static');
    await flush();
    f.enter();
    f.remove();
    await flush();
    assert.equal(f.prepared.length, 0);
    assert.equal(f.events.at(-1).finalizationReason, 'creative_removed');
    f.assertReleased();
});

for (const creativeType of ['banner_static', 'banner_html5']) {
    test(`TEST-BNR-CANCEL: ${creativeType} asset timeout remains a load failure`, async () => {
        const f = fixture(creativeType, {loading:true});
        await flush();
        f.tick(500);
        await flush();
        assert.equal(f.prepared.length, 0);
        assert.equal(f.events.at(-1).errorCode, 'MEDIA_START_TIMEOUT');
        assert.equal(f.events.at(-1).finalizationReason, 'timeout');
        f.assertReleased();
    });
}

test('TEST-BNR-CANCEL: pagehide during asset load is not misreported as a timeout', async () => {
    const f = fixture('banner_static', {loading:true});
    await flush();
    f.pagehide();
    await flush();
    assert.equal(f.prepared.length, 0);
    assert.equal(f.events.at(-1).eventType, 'closed');
    assert.equal(f.events.at(-1).finalizationReason, 'page_unload');
    f.assertReleased();
});

test('TEST-BNR-CANCEL: image load failure does not prepare a measurement session', async () => {
    const f = fixture('banner_static', {loading:true});
    await flush();
    f.elements.find((element) => element.tag === 'img').emit('error');
    await flush();
    assert.equal(f.prepared.length, 0);
    assert.equal(f.events.at(-1).errorCode, 'MEDIA_LOAD_FAILED');
    f.assertReleased();
});

for (const options of [{noIntersectionObserver:true}, {observerError:true}]) {
    test(`TEST-BNR-CANCEL: unavailable visibility observation fails closed ${JSON.stringify(options)}`, async () => {
        const f = fixture('banner_html5', options);
        await flush();
        assert.equal(f.prepared.length, 0);
        assert.equal(f.events.at(-1).eventType, 'creative_error');
        assert.equal(f.bridgeCleanups, 1);
        f.assertReleased();
    });
}

test('TEST-BNR-BUNDLE: browser IIFE builds in memory for existing supported targets', async () => {
    const esbuild = require('esbuild');
    const result = await esbuild.build({
        entryPoints: [resolve(sourceRoot, 'index.ts')],
        bundle: true, write: false, platform: 'browser', format: 'iife',
        target: [...shared.TAG_BUILD_TARGETS], minify: true, legalComments: 'none',
        define: {'process.env.NODE_ENV': JSON.stringify('production')},
    });
    assert.equal(result.errors.length, 0);
    assert.ok(result.outputFiles[0].contents.length > 0);
});
