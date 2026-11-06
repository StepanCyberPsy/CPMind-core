// Local regression fixture: real browser/SDK, simulated OMID events, no production traffic.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const { build } = require('esbuild');
const shared = await import(pathToFileURL(path.join(root, 'packages/shared/dist/index.js')));
const artifactDir = await mkdtemp('/private/tmp/cpmind-omid-access-browser-');
const version = '2';
const factoryKey = '__cpmindOmidFullV1_' + version;
const observations = [];
const results = [];
const exceptions = [];
const assets = [];
let browser;
let socket;
let chromeLog;
let cdp;
let origin;
let otherOrigin;
let entryBundle;
let fullBundle;
let tagBundle;
let browserVersion;

const cases = [
    { name: 'full-child', full: true },
    { name: 'full-top', full: true, direct: true },
    { name: 'limited-child', access: 'limited' },
    { name: 'domain-child', access: 'domain' },
    { name: 'denied-child', denied: true },
    { name: 'missing-element', missing: true },
    { name: 'other-document', otherDocument: true },
    { name: 'detached-element', detached: true },
    { name: 'load-error', loadError: true },
    { name: 'csp-block', cspBlock: true },
    { name: 'load-timeout', assetDelay: 5500 },
    { name: 'late-finish', assetDelay: 400, earlyFinish: true },
    { name: 'sticky', full: true, sticky: true },
    { name: 'two-creatives', full: true, count: 2 },
    { name: 'old-factory', full: true, oldFactory: true },
    { name: 'ordinary-script', ordinary: true },
];
for (const test of cases) {
    test.frames = Array.from({ length: test.count ?? 1 }, (_, index) => ({
        index, caseName: test.name, access: test.access ?? 'full',
        missing: test.missing, otherDocument: test.otherDocument, detached: test.detached,
        params: {
            sid: randomUUID(), tag_uuid: randomUUID(), tag_constants_version: 'browser-test',
            campaign_id: 'browser-campaign', creative_id: test.name + '-' + index,
            creative_type: 'video_creative', placement_uuid: randomUUID(),
            creative_version_uuid: randomUUID(), delivery_kind: 'inline', delivery_mode: 'outstream',
            tag_constants: shared.DEFAULT_TAG_CONSTANTS,
        },
    }));
}

// This class is bundled instead of the IAB client solely for producing fixture events.
class FixtureVerificationClient {
    constructor() {
        this.listeners = {};
        window.__fixtureControl = this;
        window.addEventListener('message', (event) => {
            if (event.data?.fixtureCase !== window.__fixtureConfig.caseName) return;
            if (event.data.command === 'finish') this.finish();
            if (event.data.command === 'media') this.media();
        });
    }
    isSupported() { return true; }
    registerSessionObserver(observer) {
        this.observer = observer;
        const cfg = window.__fixtureConfig;
        let videoElement;
        if (!cfg.missing) {
            try {
                videoElement = cfg.otherDocument
                    ? document.getElementById('local-video')
                    : window.top.document.getElementById('creative-' + cfg.index);
                if (cfg.detached) videoElement = window.top.document.createElement('video');
            } catch {
                videoElement = document.getElementById('local-video');
            }
        }
        observer({
            type: 'sessionStart', timestamp: Date.now(), adSessionId: cfg.params.sid,
            data: {
                context: { accessMode: cfg.access, environment: 'web', videoElement },
                verificationParameters: JSON.stringify(cfg.params),
            },
        });
        this.geometry();
        window.parent.postMessage({ fixtureReady: cfg.caseName, index: cfg.index }, '*');
    }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    geometry() {
        for (const callback of this.listeners.geometryChange ?? []) callback({
            type: 'geometryChange', timestamp: Date.now(),
            data: {
                viewport: { width: 1000, height: 800 },
                adView: {
                    percentageInView: 100,
                    geometry: { x: 20, y: 60, width: 320, height: 180 },
                    onScreenGeometry: { x: 20, y: 60, width: 320, height: 180 },
                },
            },
        });
    }
    media() {
        for (const event of [
            { type: 'loaded', data: { duration: 30 } },
            { type: 'start', data: { mediaPlayerVolume: 0 } },
        ]) {
            for (const callback of this.listeners.media ?? []) callback({ ...event, timestamp: Date.now() });
        }
    }
    finish() {
        this.observer({
            type: 'sessionFinish', timestamp: Date.now(),
            adSessionId: window.__fixtureConfig.params.sid, data: {},
        });
    }
}

function setupPage(config) {
    window.__caseData = config;
    window.__readyIndices = [];
    window.__fullStarts = [];
    window.addEventListener('message', (event) => {
        if (event.data?.fixtureReady !== config.name) return;
        if (!window.__readyIndices.includes(event.data.index)) window.__readyIndices.push(event.data.index);
    });
    if (config.direct) window.__fixtureConfig = config.frames[0];
    if (config.oldFactory) {
        const old = { start() { window.__oldFactoryCalled = true; throw new Error('old factory used'); } };
        window.__cpmindOmidFullV1 = old;
        window.__cpmindOmidFullV1_old = old;
    }
}

function instrumentFull(key) {
    const factory = window[key];
    const original = factory.start;
    factory.start = (input) => {
        const element = input.context.videoElement ?? input.context.slotElement;
        const session = original(input);
        window.__fullStarts.push({
            sid: input.params.sid, elementId: element?.id,
            documentMatches: element?.ownerDocument === document,
            isTopWindow: window === window.top, accepted: session !== null,
        });
        return session;
    };
}

function commandFixture(command, index = null) {
    const config = window.__caseData;
    if (config.direct) {
        window.__fixtureControl[command]();
        return;
    }
    for (const frame of document.querySelectorAll('iframe.verify')) {
        if (index !== null && Number(frame.dataset.index) !== index) continue;
        frame.contentWindow.postMessage({ fixtureCase: config.name, command }, '*');
    }
}

function inlineCall(fn, value) {
    return '<script nonce="fixture">(' + fn.toString() + ')(' + JSON.stringify(value) + ')</script>';
}

async function serve(request, response) {
    const url = new URL(request.url, 'http://fixture.test');
    const requestOrigin = request.headers.origin;
    if (requestOrigin) response.setHeader('Access-Control-Allow-Origin', requestOrigin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    if (url.pathname.startsWith('/api/collect')) {
        let body = '';
        for await (const chunk of request) body += chunk;
        observations.push({ route: url.pathname, payload: JSON.parse(body) });
        response.writeHead(202).end('{}');
        return;
    }
    if (url.pathname === '/entry.js' || url.pathname === '/tag.js') {
        response.setHeader('Content-Type', 'application/javascript');
        response.end(url.pathname === '/entry.js' ? entryBundle : tagBundle);
        return;
    }
    if (url.pathname.startsWith('/runtime/')) {
        const referrer = new URL(request.headers.referer ?? origin);
        const test = cases.find((candidate) => candidate.name === referrer.searchParams.get('case'));
        assets.push({ caseName: test?.name, path: url.pathname });
        if (test?.assetDelay) await delay(test.assetDelay);
        if (response.destroyed) return;
        if (test?.loadError) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', 'application/javascript');
        response.end(fullBundle);
        return;
    }
    if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const test = cases.find((candidate) => candidate.name === url.searchParams.get('case'));
    if (!test) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (url.pathname === '/frame') {
        const config = test.frames[Number(url.searchParams.get('index'))];
        response.end('<!doctype html><video id="local-video"></video><script>window.__fixtureConfig='
            + JSON.stringify(config) + '</script><script src="/entry.js"></script>');
        return;
    }
    const videos = test.frames.map((config, index) => {
        const attrs = test.ordinary
            ? 'data-cpmind-creative data-tag-uuid="' + config.params.tag_uuid
                + '" data-campaign-id="browser-campaign" data-creative-id="' + config.params.creative_id
                + '" data-creative-type="banner_static" data-endpoint="' + origin + '/api/collect"'
            : '';
        const tag = test.ordinary ? 'div' : 'video';
        return '<' + tag + ' class="ad-banner creative" id="creative-' + index + '" ' + attrs
            + ' style="top:' + (60 + index * 230) + 'px"></' + tag + '>';
    }).join('');
    const frames = test.ordinary || test.direct ? '' : test.frames.map((config, index) =>
        '<iframe class="verify" data-index="' + index + '" src="'
            + (test.denied ? otherOrigin : origin) + '/frame?case=' + test.name + '&index=' + index + '"></iframe>',
    ).join('');
    const policy = test.cspBlock ? '<meta http-equiv="Content-Security-Policy" content="script-src &apos;nonce-fixture&apos;">' : '';
    response.end('<!doctype html>' + policy + '<style>body{margin:0;height:2400px}.creative{position:absolute;left:20px;width:320px;height:180px;background:#345}'
        + '.verify{position:absolute;left:0;top:0;width:40px;height:30px;border:0}'
        + '.advertisement{position:fixed;right:0;top:0;width:100px;height:100px}</style>'
        + videos + '<div class="advertisement"></div>' + inlineCall(setupPage, test)
        + (test.ordinary ? '<script src="/tag.js"></script>' : test.direct ? '<script src="/entry.js"></script>' : frames));
}

const server = createServer((req, res) => { serve(req, res).catch((error) => res.destroy(error)); });
const otherServer = createServer((req, res) => { serve(req, res).catch((error) => res.destroy(error)); });

async function connect(url) {
    socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params);
        if (message.id === undefined) return;
        const call = pending.get(message.id);
        if (!call) return;
        pending.delete(message.id);
        clearTimeout(call.timer);
        if (message.error) call.reject(new Error(JSON.stringify(message.error)));
        else call.resolve(message.result);
    });
    return (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('CDP timeout: ' + method));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}

async function waitFor(expression, label, timeout = 8000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
        if (await evaluate(expression)) return;
        await delay(50);
    }
    throw new Error('Timed out: ' + label);
}

function recordsFor(test) {
    const ids = new Set(test.frames.map((config) => config.params.sid));
    const creativeIds = new Set(test.frames.map((config) => config.params.creative_id));
    return observations.filter(({ payload }) =>
        ids.has(payload.ad_session_id ?? payload.sid) || creativeIds.has(payload.creative_id),
    ).filter(({ payload }) => payload.checkpoint !== true);
}

function validateFull(payload) {
    const parsed = shared.ImpressionPayloadSchema.parse(payload);
    const weights = parsed.creative_type === 'video_creative'
        ? shared.DEFAULT_VIDEO_OUTSTREAM_WEIGHTS : shared.DEFAULT_BANNER_WEIGHTS;
    const result = shared.computeScore(
        parsed, weights, shared.DEFAULT_WEIBULL_PARAMS, shared.DEFAULT_S2_PARAMS,
        shared.DEFAULT_LOGISTIC_PARAMS, parsed.creative_type === 'video_creative'
            ? shared.DEFAULT_S4_CONFIGS.desktop_video : shared.DEFAULT_S4_CONFIGS.desktop_banner,
        shared.DEFAULT_S5_DESKTOP, shared.DEFAULT_S6_OUTSTREAM_LOGISTIC_PARAMS,
        shared.DEFAULT_S7_THRESHOLDS.desktop, shared.DEFAULT_TAG_CONSTANTS.PRESENCE_IDLE_TIMEOUT_MS,
    );
    assert.ok(Number.isFinite(result.score_final));
    assert.notEqual(parsed.signals.s7, null);
    return result.score_final;
}

try {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    await new Promise((resolve, reject) => {
        otherServer.once('error', reject);
        otherServer.listen(0, '127.0.0.1', resolve);
    });
    origin = 'http://127.0.0.1:' + server.address().port;
    otherOrigin = 'http://127.0.0.1:' + otherServer.address().port;
    for (const test of cases) for (const config of test.frames) config.params.collect_endpoint = origin + '/api/collect';
    const options = {
        bundle: true, write: false, format: 'iife', platform: 'browser', absWorkingDir: root,
        define: {
            OMID_RUNTIME_VERSION: JSON.stringify(version), CDN_BASE_URL: JSON.stringify(origin),
            'process.env.NODE_ENV': '"production"',
        },
    };
    const clientPlugin = {
        name: 'fixture-omid-events',
        setup(builder) {
            builder.onResolve({ filter: /omid-verification-client-v1\.js$/ }, () => ({ path: 'client', namespace: 'fixture' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                contents: 'export const OmidVerificationClient = ' + FixtureVerificationClient.toString() + ';',
                loader: 'js',
            }));
        },
    };
    entryBundle = (await build({
        ...options, entryPoints: ['packages/omid/src/index.ts'], plugins: [clientPlugin],
    })).outputFiles[0].text;
    fullBundle = (await build({ ...options, entryPoints: ['packages/omid/src/full.ts'] })).outputFiles[0].text
        + '\n(' + instrumentFull.toString() + ')(' + JSON.stringify(factoryKey) + ');';
    tagBundle = (await build({
        ...options, entryPoints: ['packages/tag/src/index.ts'],
        define: {
            ...options.define, __CPMIND_CONSTANTS__: JSON.stringify(shared.DEFAULT_TAG_CONSTANTS),
            __CPMIND_TAG_VERSION__: '"browser-test"',
        },
    })).outputFiles[0].text;
    chromeLog = await open(path.join(artifactDir, 'chrome.log'), 'w');
    browser = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
        '--user-data-dir=' + path.join(artifactDir, 'chrome-profile'),
        '--disable-background-networking', '--disable-component-update', '--disable-sync',
        '--disable-extensions', '--no-first-run', '--no-default-browser-check', 'about:blank',
    ], { stdio: ['ignore', chromeLog.fd, chromeLog.fd] });
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
        if (browser.exitCode !== null || browser.signalCode !== null) throw new Error('Chrome exited; see chrome.log');
        try {
            port = (await readFile(path.join(artifactDir, 'chrome-profile/DevToolsActivePort'), 'utf8')).split('\n')[0];
            break;
        } catch { await delay(100); }
    }
    assert.ok(port, 'Chrome debugging unavailable');
    const page = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
    browserVersion = await cdp('Browser.getVersion');
    console.log('Browser: ' + browserVersion.product);
    for (const test of cases) {
        const exceptionCount = exceptions.length;
        await cdp('Page.navigate', { url: origin + '/?case=' + test.name });
        if (test.ordinary) {
            await waitFor('document.querySelector("[data-cpmind-creative]") !== null', test.name);
        } else {
            await waitFor('window.__readyIndices?.length === ' + test.frames.length, test.name + ' ready');
            if (test.earlyFinish) {
                await evaluate('(' + commandFixture.toString() + ')("finish")');
                await delay(700);
                assert.equal(await evaluate('window.__fullStarts.length'), 0);
            } else if (test.full) {
                await waitFor('window.__fullStarts?.filter(x => x.accepted).length === ' + test.frames.length, test.name + ' full');
                assert.equal(await evaluate('window.__fullStarts.every(x => x.isTopWindow && x.documentMatches)'), true);
                await evaluate('(' + commandFixture.toString() + ')("media")');
            } else {
                await delay(test.assetDelay ? 5700 : 300);
            }
        }
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 120 });
        if (test.count === 2) {
            await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 100, y: 120, button: 'left', clickCount: 1 });
            await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 100, y: 120, button: 'left', clickCount: 1 });
        }
        if (test.sticky) {
            await delay(600);
            await evaluate('window.__stickyElement = document.getElementById("creative-0");'
                + 'window.scrollTo(0, 500); Object.assign(window.__stickyElement.style,'
                + '{position:"fixed",top:"auto",left:"auto",right:"20px",bottom:"20px"})');
        }
        await delay(test.full || test.ordinary ? 1300 : 100);
        if (test.ordinary) {
            await evaluate('window.dispatchEvent(new Event("pagehide"))');
        } else if (!test.earlyFinish) {
            if (test.count === 2) {
                await evaluate('(' + commandFixture.toString() + ')("finish",0)');
                await delay(150);
                assert.equal(recordsFor(test).length, 1, 'second ad must remain active');
                await evaluate('(' + commandFixture.toString() + ')("finish",1)');
            } else {
                await evaluate('(' + commandFixture.toString() + ')("finish")');
            }
            await evaluate('(' + commandFixture.toString() + ')("finish")');
        }
        for (let attempt = 0; attempt < 100 && recordsFor(test).length < test.frames.length; attempt++) await delay(50);
        const records = recordsFor(test);
        assert.equal(records.length, test.frames.length, test.name + ' final payload count');
        const scores = [];
        for (const record of records) {
            if (test.full || test.ordinary) {
                assert.equal(record.route, '/api/collect');
                scores.push(validateFull(record.payload));
                assert.ok(record.payload.signals.s2.share_of_screen_max_pct > 6);
                assert.ok(record.payload.signals.s2.share_of_screen_max_pct < 9);
                assert.ok(record.payload.signals.s7.competing_ads_visible >= 1);
            } else {
                assert.equal(record.route, '/api/collect/omid');
                shared.OmidPartialImpressionSchema.parse(record.payload);
                assert.equal(record.payload.page_collectors_loaded, false);
            }
        }
        if (test.count === 2) {
            assert.equal(new Set(records.map(({ payload }) => payload.ad_session_id)).size, 2);
            const first = records.find(({ payload }) => payload.ad_session_id === test.frames[0].params.sid);
            const second = records.find(({ payload }) => payload.ad_session_id === test.frames[1].params.sid);
            assert.equal(first.payload.signals.s5.clicked, true);
            assert.equal(second.payload.signals.s5.clicked, false);
        }
        if (test.sticky) {
            assert.equal(await evaluate('window.__stickyElement === document.getElementById("creative-0")'), true);
            assert.ok(records[0].payload.signals.s7.creative_position_y_px > 500);
        }
        if (test.oldFactory) assert.equal(await evaluate('window.__oldFactoryCalled === true'), false);
        assert.equal(exceptions.length, exceptionCount, test.name + ' unexpected runtime exception');
        results.push({ name: test.name, status: 'PASS', scores, records });
        console.log('PASS ' + test.name);
    }
} catch (error) {
    results.push({ status: 'FAIL', error: error.stack });
    console.error(error.stack);
    process.exitCode = 1;
} finally {
    socket?.close();
    if (browser && browser.exitCode === null && browser.signalCode === null) {
        browser.kill('SIGTERM');
        await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), delay(5000)]);
        if (browser.exitCode === null && browser.signalCode === null) browser.kill('SIGKILL');
    }
    server.closeAllConnections();
    otherServer.closeAllConnections();
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => otherServer.close(resolve))]);
    await chromeLog?.close();
    await writeFile(path.join(artifactDir, 'results.json'), JSON.stringify({
        environment: { node: process.version, browser: browserVersion?.product },
        results, exceptions, assets, observations,
    }, null, 2));
    console.log('Artifacts: ' + artifactDir);
}
