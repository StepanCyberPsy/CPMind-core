import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseListSearchParams } from '../src/lib/admin/search-params.ts';
import { parseUserListSearchParams } from '../src/lib/user/search-params.ts';
import {
    getS2QuantileLevels,
    getS2QuantileValue,
    getS6SegmentPresentation,
    formatS6Rate,
    formatS6Threshold,
} from '../src/lib/admin/signal-model-presentation.ts';

const parseAdminImpressions = (input) => parseListSearchParams(input, undefined, 'impressions');

test('TEST-FILTERS: both roles forward each backend taxonomy value and combined filters', () => {
    const cases = [
        ...['banner_static', 'banner_gif', 'banner_html5', 'video_creative'].map((creativeType) => ({creativeType})),
        ...['banner', 'instream', 'outstream'].map((format) => ({format})),
        ...['preroll', 'midroll', 'postroll', 'pauseroll', 'inpage', 'sticky'].map((subtype) => ({subtype})),
        {creativeType: 'video_creative', format: 'outstream', subtype: 'sticky'},
    ];
    for (const parse of [parseAdminImpressions, parseUserListSearchParams]) {
        for (const input of cases) {
            const {params} = parse(input);
            for (const [key, value] of Object.entries(input)) assert.equal(params[key], value);
        }
        const {params} = parse({creativeType: '', format: '', subtype: ''});
        for (const key of ['creativeType', 'format', 'subtype']) assert.equal(Object.hasOwn(params, key), false);
    }
});

test('TEST-ISOLATION: default recalculation parser preserves legacy filters and forced owner', () => {
    const {params} = parseListSearchParams({
        userUuid: 'another-owner',
        campaignId: 'campaign-key',
        tagConstantsVersion: 'v4',
        weightsVersion: 'weights-1',
        creativeType: 'video_creative',
        format: 'outstream',
        subtype: 'sticky',
        s2Min: '12',
    }, 'own-owner');
    assert.deepEqual(params, {
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortDir: 'desc',
        userUuid: 'own-owner',
        campaignId: 'campaign-key',
        tagConstantsVersion: 'v4',
        weightsVersion: 'weights-1',
        s2Min: 12,
    });
    assert.equal(Object.hasOwn(parseAdminImpressions({tagConstantsVersion: 'v4'}).params, 'tagConstantsVersion'), false);
});

async function loadApiForCsv(relativePath) {
    const require = createRequire(new URL('../package.json', import.meta.url));
    const ts = require('typescript');
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const {outputText} = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
    });
    const envUrl = new URL('../src/lib/shared/env.ts', import.meta.url).href;
    const code = outputText.replace(/(['"])@\/lib\/shared\/env\1/g, JSON.stringify(envUrl));
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('TEST-FILTERS: CSV builders receive the same taxonomy and preserve role scope', async () => {
    const previousBackend = process.env.NEXT_PUBLIC_BACKEND_URL;
    process.env.NEXT_PUBLIC_BACKEND_URL = '';
    try {
        const adminApi = await loadApiForCsv('../src/lib/admin/api.ts');
        const userApi = await loadApiForCsv('../src/lib/user/api.ts');
        const input = {creativeType: 'video_creative', format: 'instream', subtype: 'pauseroll', tagConstantsVersion: 'v4'};
        const adminParams = parseAdminImpressions({...input, userUuid: 'selected-owner'}).params;
        const userParams = parseUserListSearchParams({...input, campaignId: 'campaign-key'}).params;
        const adminUrl = new URL(adminApi.buildCsvUrl(adminParams), 'http://localhost');
        const userUrl = new URL(userApi.buildUserCsvUrl(userParams), 'http://localhost');
        for (const url of [adminUrl, userUrl]) {
            assert.equal(url.pathname, '/api/impressions/export/csv');
            for (const key of ['creativeType', 'format', 'subtype']) assert.equal(url.searchParams.get(key), input[key]);
            assert.equal(url.searchParams.has('tagConstantsVersion'), false);
        }
        assert.equal(adminUrl.searchParams.get('userUuid'), 'selected-owner');
        assert.equal(userUrl.searchParams.get('campaignId'), 'campaign-key');
        assert.equal(userUrl.searchParams.has('userUuid'), false);
    } finally {
        if (previousBackend === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL;
        else process.env.NEXT_PUBLIC_BACKEND_URL = previousBackend;
    }
});

test('TEST-S2: quantile columns align by level across configurations', () => {
    const configs = [
        {quantileLevels: [0.1, 0.5, 0.9], quantileValues: [1, 4, 12]},
        {quantileLevels: [0.01, 0.5, 0.99], quantileValues: [0, 6, 20]},
    ];
    assert.deepEqual(getS2QuantileLevels(configs), [0.01, 0.1, 0.5, 0.9, 0.99]);
    assert.equal(getS2QuantileValue(configs[0], 0.5), 4);
    assert.equal(getS2QuantileValue(configs[1], 0.5), 6);
    assert.equal(getS2QuantileValue(configs[1], 0.01), 0);
    assert.equal(getS2QuantileValue(configs[0], 0.99), null);
});

test('TEST-S6: placement and fallback segments reach their mode and device', () => {
    for (const device of ['desktop', 'mobile', 'tablet']) {
        for (const suffix of ['skippable', 'non_skippable']) {
            assert.deepEqual(getS6SegmentPresentation(`instream|${device}|${suffix}`), {section: 'instream', device});
        }
        for (const group of ['outstream_sticky', 'outstream_inpage']) {
            assert.deepEqual(getS6SegmentPresentation(`${group}|${device}`), {section: 'outstream', device});
        }
        for (const mode of ['instream', 'outstream']) {
            assert.deepEqual(getS6SegmentPresentation(`${mode}|${device}`), {section: mode, device});
        }
    }
    for (const mode of ['instream', 'outstream']) {
        assert.deepEqual(getS6SegmentPresentation(`${mode}|global`), {section: mode, device: 'common'});
    }
});

test('TEST-S6: historical and unknown keys remain available without an invented mode', () => {
    for (const key of ['desktop|skippable', 'mobile|non_skippable', 'tablet|outstream', 'desktop|instream_skippable', 'global', 'outstream_future|desktop', 'unknown']) {
        assert.deepEqual(getS6SegmentPresentation(key), {section: 'other', device: null});
    }
});

test('TEST-S6: label values distinguish zero from unavailable data', () => {
    assert.equal(formatS6Rate(0), '0.0%');
    assert.equal(formatS6Rate(0.375), '37.5%');
    assert.equal(formatS6Threshold(0), '0');
    for (const value of [null, undefined, NaN, Infinity]) {
        assert.equal(formatS6Rate(value), '—');
        assert.equal(formatS6Threshold(value), '—');
    }
});

test('TEST-S2: incomplete and non-finite quantiles stay unavailable', () => {
    assert.deepEqual(getS2QuantileLevels([]), []);
    assert.equal(getS2QuantileValue({quantileLevels: [0.1, 0.9], quantileValues: [5]}, 0.1), null);
    assert.equal(getS2QuantileValue({quantileLevels: [0.5], quantileValues: [NaN]}, 0.5), null);
    assert.deepEqual(getS2QuantileLevels([
        {quantileLevels: [NaN, -1, 0.5, 2], quantileValues: []},
    ]), [0.5]);
});
