import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const flush = () => new Promise((done) => setImmediate(done));

// Проверяет реальные обработчики и дерево JSX; браузерный layout этим не моделируется.
function harness(dependencies = {}, environment = {}) {
    const context = vm.createContext({Error, ...environment});
    const slots = [];
    let cursor = 0;
    const hooks = {
        useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
            return [slots[index], (value) => {
                slots[index] = typeof value === 'function' ? value(slots[index]) : value;
            }];
        },
        useCallback: (callback) => callback,
        useRef(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = {current:initial};
            return slots[index];
        },
        useEffect(effect) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = {cleanup:effect()};
        },
    };
    const cache = new Map();
    function load(relativePath) {
        let file = resolve(sourceRoot, relativePath);
        const isFile = (path) => existsSync(path) && statSync(path).isFile();
        if (!isFile(file)) file = [file + '.tsx', file + '.ts', resolve(file, 'index.ts')].find(isFile);
        assert.ok(file, relativePath);
        if (cache.has(file)) return cache.get(file).exports;
        const module = {exports:{}};
        cache.set(file, module);
        const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
            },
        }).outputText;
        const localRequire = (name) => {
            if (name in dependencies) return dependencies[name];
            if (name === 'react') return hooks;
            if (name === 'react/jsx-runtime' || name === '@cpmind/shared') return require(name);
            if (name.endsWith('.module.css')) {
                return {__esModule:true, default:new Proxy({}, {get:(_, key) => String(key)})};
            }
            if (name.startsWith('@/')) return load(name.slice(2));
            if (name.startsWith('./')) return load(resolve(dirname(file), name));
            throw new Error(`Unexpected dependency: ${name}`);
        };
        vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, {filename:file})(localRequire, module, module.exports);
        return module.exports;
    }
    return {
        load,
        render(callback) { cursor = 0; return callback(); },
        unmount() { for (const slot of slots) slot?.cleanup?.(); },
    };
}

function nodes(tree) {
    if (tree === null || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
}

function text(tree) {
    if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
    if (typeof tree !== 'object') return String(tree);
    if (Array.isArray(tree)) return tree.map(text).join('');
    return text(tree.props?.children);
}

const placement = {
    uuid: 'placement-fixture', format:'banner', subtype:null,
    currentVersionStatus:'ready', embedCode:'<script src="https://fixture.invalid/embed.js"></script>',
    vastUrl:null, isActive:true,
};
const creative = {
    uuid:'creative-fixture', campaignUuid:'campaign-fixture', creativeType:'banner_static',
    versions:[{assets:[{role:'source',width:300,height:250}]}],
};

async function createdForm({reject = false} = {}) {
    const payloads = [];
    let refreshes = 0;
    const router = {refresh() { refreshes++; }};
    const h = harness({
        'next/navigation': {useRouter:() => router},
        '@/lib/admin/api': {async createPlacement(payload) {
            payloads.push(payload);
            if (reject) throw new Error('Fixture creation failed');
            return placement;
        }},
    });
    const {InlinePlacementForm} = h.load('components/shared/InlinePlacementForm.tsx');
    const render = () => h.render(() => InlinePlacementForm({creative}));
    const submit = nodes(render()).find((node) => node.type === 'button' && text(node) === 'Создать размещение');
    assert.ok(submit);
    submit.props.onClick();
    await flush();
    return {h, render, payloads, get refreshes() { return refreshes; }};
}

test('TEST-UI-MODAL: creation keeps the code open without refreshing until close', async () => {
    const f = await createdForm();
    assert.equal(f.refreshes, 0);
    assert.equal(f.payloads.length, 1);
    assert.equal(f.payloads[0].creativeUuid, creative.uuid);
    assert.equal(f.payloads[0].campaignUuid, creative.campaignUuid);
    assert.equal(f.payloads[0].format, 'banner');
    const modal = nodes(f.render()).find((node) => node.type?.name === 'PlacementEmbedModal');
    assert.ok(modal);
    assert.equal(modal.props.placement.embedCode, placement.embedCode);
    await flush();
    assert.ok(nodes(f.render()).some((node) => node.type?.name === 'PlacementEmbedModal'));
    assert.equal(f.refreshes, 0);
    modal.props.onClose();
    assert.equal(f.refreshes, 1);
    assert.ok(!nodes(f.render()).some((node) => node.type?.name === 'PlacementEmbedModal'));
});

test('TEST-UI-MODAL: a creation error keeps the form available without a refresh', async () => {
    const f = await createdForm({reject:true});
    assert.equal(f.refreshes, 0);
    const tree = f.render();
    assert.ok(text(tree).includes('Fixture creation failed'));
    assert.ok(!nodes(tree).some((node) => node.type?.name === 'PlacementEmbedModal'));
    assert.equal(nodes(tree).find((node) => node.type === 'button' && text(node) === 'Создать размещение').props.disabled, false);
});

for (const closeMethod of ['button', 'escape', 'backdrop']) {
    test(`TEST-UI-MODAL: ${closeMethod} closes through the form callback and refreshes`, async () => {
        const f = await createdForm();
        const modalProps = nodes(f.render()).find((node) => node.type?.name === 'PlacementEmbedModal').props;
        const listeners = new Map();
        const document = {
            addEventListener(type, callback) { listeners.set(type, callback); },
            removeEventListener(type) { listeners.delete(type); },
        };
        const modalHarness = harness({}, {document});
        const {PlacementEmbedModal} = modalHarness.load('components/shared/PlacementEmbedModal.tsx');
        const tree = modalHarness.render(() => PlacementEmbedModal(modalProps));
        const backdrop = {};
        tree.ref.current = backdrop;
        assert.equal(f.refreshes, 0);
        if (closeMethod === 'button') {
            nodes(tree).find((node) => node.props?.['aria-label'] === 'Закрыть').props.onClick();
        } else if (closeMethod === 'escape') {
            listeners.get('keydown')({key:'Escape'});
        } else {
            tree.props.onClick({target:{}});
            assert.equal(f.refreshes, 0);
            tree.props.onClick({target:backdrop});
        }
        assert.equal(f.refreshes, 1);
        modalHarness.unmount();
        assert.equal(listeners.size, 0);
    });
}

test('TEST-UI-ACTIVITY: campaign cards match the existing first-placement rule and preserve processing badges', async () => {
    const Link = () => null;
    const calls = [];
    const creatives = ['inactive','active','unplaced'].map((uuid) => ({
        uuid, campaignUuid:'campaign-fixture', name:`Name ${uuid}`, creativeType:'banner_static',
        status:uuid === 'unplaced' ? 'processing' : 'ready', createdAt:'2026-10-01T00:00:00Z',
    }));
    creatives.push({...creatives[0],uuid:'other-campaign',campaignUuid:'another-campaign'});
    const placements = [
        {creativeUuid:'inactive',isActive:false},
        {creativeUuid:'inactive',isActive:true},
        {creativeUuid:'active',isActive:true},
    ];
    const h = harness({
        'next/headers':{cookies:() => ({get:() => ({value:'fixture-cookie'})})},
        'next/link':{__esModule:true,default:Link},
        'next/navigation':{notFound() { throw new Error('Unexpected notFound'); }},
        '@/lib/admin/api':{
            async fetchCampaigns(cookie) { calls.push(['campaigns',cookie]); return [{uuid:'campaign-fixture',name:'Campaign'}]; },
            async fetchCreatives(cookie) { calls.push(['creatives',cookie]); return creatives; },
            async fetchPlacements(cookie) { calls.push(['placements',cookie]); return placements; },
        },
    });
    const page = h.load('app/(workspace)/campaigns/[uuid]/page.tsx').default;
    const tree = await page({params:{uuid:'campaign-fixture'}});
    const cards = nodes(tree).filter((node) => node.type === Link && node.props.href.startsWith('/creatives/'));
    assert.equal(cards.length, 3);
    for (const card of cards) {
        const uuid = card.props.href.split('/').at(-1);
        const badge = nodes(card).find((node) => node.type?.name === 'CreativeActivityBadge');
        const expected = placements.find((placement) => placement.creativeUuid === uuid)?.isActive;
        assert.equal(badge.props.isActive, expected);
        const renderedBadge = badge.type(badge.props);
        assert.equal(text(renderedBadge), expected === undefined ? '' : expected ? 'Активно' : 'Неактивно');
        assert.ok(nodes(card).some((node) => node.type?.name === 'CreativeStatusBadge'));
    }
    assert.equal(calls.filter(([name]) => name === 'placements').length, 1);
    assert.ok(calls.every(([,cookie]) => cookie === 'cpmind_token=fixture-cookie'));
});
