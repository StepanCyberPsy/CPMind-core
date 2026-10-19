import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import Fastify from 'fastify';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
    DEFAULT_IVT_THRESHOLDS,
    DEFAULT_LOGISTIC_PARAMS,
    DEFAULT_S2_PARAMS,
    DEFAULT_S4_CONFIGS,
    DEFAULT_S5_DESKTOP,
    DEFAULT_S5_MOBILE_TABLET,
    DEFAULT_S6_INSTREAM_LOGISTIC_PARAMS,
    DEFAULT_S7_THRESHOLDS,
    DEFAULT_WEIBULL_PARAMS,
    DEFAULT_WEIGHTS_BY_CATEGORY,
    ImpressionPayloadSchema,
    normalizeS2,
    type CreativeCategory,
    type CreativeType,
    type ImpressionPayload,
} from '@cpmind/shared';

const mocks = vi.hoisted(() => ({
    select: vi.fn(),
    insert: vi.fn(),
    owner: vi.fn(),
    constants: vi.fn(),
    context: vi.fn(),
    weights: vi.fn(),
    s1: vi.fn(),
    s3: vi.fn(),
    s4: vi.fn(),
    s5: vi.fn(),
    s6: vi.fn(),
    s7: vi.fn(),
    ivtList: vi.fn(),
    ivtThresholds: vi.fn(),
}));

// Replace the DB module before importing any production service: no pool is created.
vi.mock('../src/db/index.js', () => ({
    db: { select: mocks.select, insert: mocks.insert },
}));
vi.mock('../src/services/tag/tags.js', () => ({ resolveActiveTagOwner: mocks.owner }));
vi.mock('../src/services/tag/tag_constants.js', () => ({ resolveTagConstantsVersion: mocks.constants }));
vi.mock('../src/services/delivery/impression_context.js', () => ({ resolveImpressionContext: mocks.context }));
vi.mock('../src/services/configs/weights_config.js', () => ({ getActiveWeightsConfig: mocks.weights }));
vi.mock('../src/services/configs/weibull_config.js', () => ({ getActiveWeibullParams: mocks.s1 }));
vi.mock('../src/services/configs/logistic_config.js', () => ({ getActiveS3LogisticParams: mocks.s3 }));
vi.mock('../src/services/configs/s4_config.js', () => ({ getActiveS4Config: mocks.s4 }));
vi.mock('../src/services/configs/s5_logistic_config.js', () => ({ getActiveS5LogisticParams: mocks.s5 }));
vi.mock('../src/services/configs/s6_logistic_config.js', () => ({ getActiveS6LogisticParams: mocks.s6 }));
vi.mock('../src/services/configs/s7_quantile_config.js', () => ({ getActiveS7Thresholds: mocks.s7 }));
vi.mock('../src/services/ivt/ivt_list.js', () => ({ getActiveIvtList: mocks.ivtList }));
vi.mock('../src/services/ivt/ivt_thresholds.js', () => ({ getActiveIvtThresholds: mocks.ivtThresholds }));
vi.mock('../src/middleware/requireAuth.js', () => ({ requireAuth: vi.fn() }));
vi.mock('../src/services/impressions.js', () => ({
    listImpressionsForAdmin: vi.fn(),
    listImpressionsForUser: vi.fn(),
    getImpressionForAdmin: vi.fn(),
    getPublisherDomainAggregate: vi.fn(),
    resolveTargetUserId: vi.fn(),
}));

import {
    impressions,
    s2Configs,
    type ImpressionInsert,
    type S2ConfigInsert,
    type S2ConfigSelect,
} from '../src/db/schema.js';
import { impressionsRoute } from '../src/routes/impressions.js';
import {
    getActiveS2Params,
    invalidateS2Cache,
} from '../src/services/configs/s2_config.js';
import { recalibrateS2 } from '../src/jobs/s2_calibration.js';
import type { ImpressionDeliveryContext } from '../src/services/delivery/impression_context_rules.js';

const NOW_MS = Date.UTC(2026, 9, 19, 12);
const DEVICES = ['desktop', 'mobile', 'tablet'] as const;
const BANNERS = ['banner_static', 'banner_gif', 'banner_html5'] as const;
type Device = typeof DEVICES[number];
interface TrainingRow {
    creativeType: CreativeType;
    device: Device;
    ownerId: number;
    share: number | null;
}
interface CapturedQuery {
    sql: string;
    params: unknown[];
    sample: boolean;
}

const dialect = new PgDialect();
const fixtures = {
    configs: [] as S2ConfigSelect[],
    records: [] as ImpressionInsert[],
    drafts: [] as S2ConfigInsert[],
    queries: [] as CapturedQuery[],
    trainingRows: [] as TrainingRow[],
};

function addModel(
    segmentKey: string,
    overrides: Partial<S2ConfigSelect> = {},
): S2ConfigSelect {
    const row: S2ConfigSelect = {
        id: '11111111-1111-4111-8111-' + String(fixtures.configs.length + 1).padStart(12, '0'),
        segmentKey,
        quantileLevels: [0.2, 0.8],
        quantileValues: [1, 4],
        sampleSize: 1200,
        fittedAt: new Date(NOW_MS),
        isActive: true,
        deletionScheduledAt: null,
        ...overrides,
    };
    fixtures.configs.push(row);
    return row;
}

function payload(creativeType: CreativeType, device: Device): ImpressionPayload {
    return ImpressionPayloadSchema.parse({
        impression_id: '22222222-2222-4222-8222-222222222222',
        tag_uuid: '33333333-3333-4333-8333-333333333333',
        tag_constants_version: 'fixture-v1',
        campaign_id: 'fixture_campaign',
        creative_id: 'fixture_creative',
        creative_type: creativeType,
        device_type: device,
        publisher_domain: 'example.com',
        timestamp_start: NOW_MS - 5000,
        timestamp_end: NOW_MS,
        signals: {
            s1: {
                time_in_view_sec: 5,
                mrc_compliant: true,
                visible_pixels_pct: 100,
                max_continuous_view_sec: 5,
            },
            s2: { share_of_screen_avg_pct: 4, share_of_screen_max_pct: 4 },
            s3: null,
            s4: {
                tab_active_time_ms: 5000,
                tab_total_time_ms: 5000,
                tab_switches_count: 0,
                visibility_state_history: [],
            },
            s5: {
                clicked: false,
                hover_count: 1,
                hover_duration_max_ms: 500,
                hover_duration_total_ms: 500,
                hover_to_click_latency_ms: null,
                cursor_proximity_min_px: 10,
                cursor_trajectory_entropy: 0.5,
                tap_count: null,
                touch_start_end_delta_ms: null,
                zoom: null,
                swipe_count: null,
            },
            s6: null,
            s7: {
                creative_position_y_px: 100,
                page_height_total_px: 2000,
                is_above_the_fold: true,
                competing_ads_visible: 0,
                viewability_persistence_pct: 100,
            },
        },
        presence: {
            last_user_event_timestamp: NOW_MS - 100,
            time_since_last_event_ms: 100,
            events_count_during_impression: 1,
        },
    });
}

async function collect(creativeType: CreativeType, device: Device): Promise<ImpressionInsert> {
    const app = Fastify({ logger: false });
    try {
        await app.register(impressionsRoute, { prefix: '/api' });
        const response = await app.inject({
            method: 'POST',
            url: '/api/collect',
            payload: payload(creativeType, device),
        });
        expect(response.statusCode, response.body).toBe(202);
        expect(fixtures.records).toHaveLength(1);
        return fixtures.records[0]!;
    } finally {
        await app.close();
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    fixtures.configs = [];
    fixtures.records = [];
    fixtures.drafts = [];
    fixtures.queries = [];
    fixtures.trainingRows = [];
    invalidateS2Cache();

    mocks.owner.mockResolvedValue({ tagId: 11, userId: 12 });
    mocks.constants.mockResolvedValue({ isActive: true, presenceIdleThresholdMs: 30_000 });
    mocks.context.mockResolvedValue({ kind: 'legacy' });
    mocks.weights.mockImplementation(async (category: CreativeCategory) => DEFAULT_WEIGHTS_BY_CATEGORY[category]);
    mocks.s1.mockResolvedValue({ params: DEFAULT_WEIBULL_PARAMS, modelVersion: 'fixture-s1' });
    mocks.s3.mockResolvedValue({ params: DEFAULT_LOGISTIC_PARAMS, modelVersion: 'fixture-s3' });
    mocks.s4.mockResolvedValue({ config: DEFAULT_S4_CONFIGS.default, modelVersion: 'fixture-s4' });
    mocks.s5.mockImplementation(async (segment: string) => ({
        params: segment === 'desktop' ? DEFAULT_S5_DESKTOP : DEFAULT_S5_MOBILE_TABLET,
        modelVersion: 'fixture-s5',
    }));
    mocks.s6.mockResolvedValue({ params: DEFAULT_S6_INSTREAM_LOGISTIC_PARAMS, modelVersion: 'fixture-s6' });
    mocks.s7.mockImplementation(async (device: Device) => ({
        thresholds: DEFAULT_S7_THRESHOLDS[device],
        modelVersion: 'fixture-s7',
    }));
    mocks.ivtList.mockResolvedValue(null);
    mocks.ivtThresholds.mockResolvedValue(DEFAULT_IVT_THRESHOLDS);

    mocks.select.mockImplementation((columns?: Record<string, unknown>) => ({
        from: (table: unknown) => ({
            where: (condition: SQL) => {
                const query = dialect.sqlToQuery(condition);
                const sample = columns?.share === impressions.s2RawShareOfScreen;
                fixtures.queries.push({ sql: query.sql, params: query.params, sample });
                if (table === s2Configs) {
                    return {
                        limit: async () => fixtures.configs
                            .filter((row) => row.segmentKey === query.params[0] && row.isActive)
                            .slice(0, 1),
                    };
                }
                if (table === impressions) {
                    const device = DEVICES.find((value) => query.params.includes(value));
                    const rows = fixtures.trainingRows.filter((row) =>
                        query.params.includes(row.creativeType)
                        && (device === undefined || row.device === device));
                    if (sample) return Promise.resolve(rows.map((row) => ({ share: row.share })));
                    if (columns && 'candidates' in columns) {
                        return Promise.resolve([{
                            candidates: rows.length, unreliable: 0, contextMismatch: 0, legacy: 0,
                        }]);
                    }
                }
                throw new Error('Unexpected fixture query');
            },
        }),
    }));
    mocks.insert.mockImplementation((table: unknown) => ({
        values: (record: ImpressionInsert | S2ConfigInsert) => {
            if (table === impressions) {
                fixtures.records.push(record as ImpressionInsert);
                return { onConflictDoUpdate: async () => undefined };
            }
            if (table === s2Configs) {
                fixtures.drafts.push(record as S2ConfigInsert);
                return Promise.resolve();
            }
            throw new Error('Unexpected fixture insert');
        },
    }));
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TEST-1 / TEST-6: restored S2 segments remain independent of S3', () => {
    for (const device of DEVICES) {
        for (const creativeType of BANNERS) {
            it(creativeType + ' on ' + device + ' uses its original S2 group', async () => {
                const group = creativeType === 'banner_static' ? 'static' : 'animated';
                const model = addModel(device + '|' + group);
                addModel(device + '|' + (group === 'static' ? 'animated' : 'static'), { quantileValues: [1, 100] });
                addModel('global', { quantileValues: [1, 100] });
                const record = await collect(creativeType, device);

                expect(record.s2ModelVersion).toBe(model.id);
                expect(record.s2Normalized).toBeCloseTo(80);
                expect(record.creativeType).toBe(creativeType);
                expect(mocks.s1).toHaveBeenCalledWith(device + '|' + group);
                expect(mocks.s3).toHaveBeenCalledWith(device + '|static', 'fixture-v1');
            });
        }
        it('video on ' + device + ' keeps its video model', async () => {
            addModel(device + '|static', { quantileValues: [1, 100] });
            const model = addModel(device + '|video');
            const record = await collect('video_creative', device);
            expect(record.s2ModelVersion).toBe(model.id);
            expect(record.s2Normalized).toBeCloseTo(80);
            expect(mocks.s1).toHaveBeenCalledWith(device + '|video');
            expect(mocks.s3).toHaveBeenCalledWith(device + '|video', 'fixture-v1');
        });
    }

    it.each([
        ['banner_gif', 'video_creative', 'animated', 'animated'],
        ['video_creative', 'banner_html5', 'video', 'video'],
    ] as const)('server type %s takes precedence over payload type %s', async (serverType, clientType, s2Group, otherGroup) => {
        const isVideo = serverType === 'video_creative';
        const context: ImpressionDeliveryContext = {
            adSessionId: '44444444-4444-4444-8444-444444444444',
            placementId: 'fixture-placement',
            creativeVersionId: 'fixture-version',
            creativeRefId: 'fixture-creative',
            campaignRefId: 'fixture-campaign',
            campaignLabel: 'server_campaign',
            creativeLabel: 'server_creative',
            creativeType: serverType,
            skippable: false,
            deliveryMode: isVideo ? 'outstream' : 'display',
            format: isVideo ? 'outstream' : 'banner',
            subtype: isVideo ? 'sticky' : null,
            videoShowIndex: null,
            sdkRuntimeVersion: 'fixture-runtime',
            measurementMode: isVideo ? 'full_cpmind_player' : 'full_direct_display',
            tagConstantsVersion: 'fixture-server-v1',
            publisherDomain: 'example.com',
            contextViolations: ['CLIENT_CONTEXT_MISMATCH'],
        };
        mocks.context.mockResolvedValue({ kind: 'hosted', context });
        const model = addModel('desktop|' + s2Group);
        const record = await collect(clientType, 'desktop');
        expect(record.s2ModelVersion).toBe(model.id);
        expect(record.creativeType).toBe(serverType);
        expect(mocks.s1).toHaveBeenCalledWith('desktop|' + otherGroup);
        expect(mocks.s3).toHaveBeenCalledWith('desktop|' + (isVideo ? 'video' : 'static'), 'fixture-server-v1');
    });
});

describe('TEST-1: restored S2 fallback chains', () => {
    for (const group of ['static', 'animated', 'video']) {
        it.each(['device', 'group', 'global', 'default'] as const)(
            group + ' resolves %s fallback and persists its model version',
            async (level) => {
                const model = level === 'default' ? null : addModel(
                    level === 'device' ? 'desktop|' + group : level === 'group' ? group : 'global',
                );
                const type = group === 'static' ? 'banner_static' : group === 'animated' ? 'banner_gif' : 'video_creative';
                const record = await collect(type, 'desktop');
                const chain = ['desktop|' + group, group, 'global'];
                const length = level === 'device' ? 1 : level === 'group' ? 2 : 3;
                expect(fixtures.queries.map((query) => query.params[0])).toEqual(chain.slice(0, length));
                expect(record.s2ModelVersion).toBe(model?.id ?? 'default');
                expect(record.s2Normalized).toBeCloseTo(model ? 80 : normalizeS2(
                    payload('banner_static', 'desktop').signals.s2,
                    DEFAULT_S2_PARAMS,
                ));
            },
        );
    }

    it('skips inactive and malformed configurations and caches the selected fallback', async () => {
        addModel('desktop|static', { isActive: false });
        addModel('static', { quantileValues: [1] });
        const global = addModel('global');
        const first = await getActiveS2Params('desktop|static');
        expect(first.modelVersion).toBe(global.id);
        expect(fixtures.queries).toHaveLength(3);
        expect(await getActiveS2Params('desktop|static')).toBe(first);
        expect(fixtures.queries).toHaveLength(3);
        invalidateS2Cache();
        const device = addModel('desktop|static');
        expect((await getActiveS2Params('desktop|static')).modelVersion).toBe(device.id);
    });
});

describe('TEST-1: S2 training restores separate creative groups and preserves guards', () => {
    it('fits separate static, animated, and video device/group drafts across owners', async () => {
        for (const device of DEVICES) {
            for (const creativeType of BANNERS) {
                const count = creativeType === 'banner_static' ? 1000 : 600;
                for (let index = 0; index < count; index++) {
                    fixtures.trainingRows.push({
                        creativeType, device, ownerId: index % 2 + 1, share: index / 10,
                    });
                }
            }
            for (let index = 0; index < 1000; index++) {
                fixtures.trainingRows.push({
                    creativeType: 'video_creative', device, ownerId: index % 2 + 1, share: 60 + index / 100,
                });
            }
        }
        await recalibrateS2();
        expect(fixtures.drafts.map((row) => row.segmentKey)).toEqual([
            'desktop|static', 'mobile|static', 'tablet|static', 'static',
            'desktop|animated', 'mobile|animated', 'tablet|animated', 'animated',
            'desktop|video', 'mobile|video', 'tablet|video', 'video',
        ]);
        for (const draft of fixtures.drafts) {
            const group = draft.segmentKey.split('|').at(-1)!;
            const isGroup = !draft.segmentKey.includes('|');
            expect(draft.sampleSize).toBe((group === 'animated' ? 1200 : 1000) * (isGroup ? 3 : 1));
            expect(draft.isActive).toBe(false);
            expect(draft.quantileLevels).toEqual(DEFAULT_S2_PARAMS.quantileLevels);
            const values = draft.quantileValues as number[];
            expect(values[0]).toBeCloseTo(group === 'video' ? 60.0999 : group === 'animated' ? 0.599 : 0.999);
            expect(values.at(-1)).toBeCloseTo(group === 'video' ? 69.8901 : group === 'animated' ? 59.301 : 98.901);
        }
        const queries = fixtures.queries.filter((query) => query.sample);
        expect(queries).toHaveLength(12);
        for (const query of queries) {
            const types = query.params.filter((value) => typeof value === 'string' && (
                value.startsWith('banner_') || value === 'video_creative'
            ));
            const expectedTypes = types.includes('video_creative') ? ['video_creative']
                : types.includes('banner_static') ? ['banner_static'] : ['banner_gif', 'banner_html5'];
            expect(types).toEqual(expectedTypes);
            expect(query.sql).toContain('"score_reliable" =');
            expect(query.sql).toContain('"is_suspicious" =');
            expect(query.sql).toContain('"s2_raw_share_of_screen" is not null');
            expect(query.sql).toContain('"measurement_mode" <>');
            expect(query.sql).toContain('NOT (');
            expect(query.sql).toContain('CLIENT_CONTEXT_MISMATCH');
            expect(query.params).toContain('legacy_tag');
            expect(query.params).toContain(true);
            expect(query.params).toContain(false);
            expect(query.params).toContain(new Date(NOW_MS - 30 * 86400_000).toISOString());
            expect(query.sql).not.toContain('"user_id"');
            expect(query.sql).not.toContain('"tag_id"');
        }
    });

    it.each(['insufficient', 'degenerate', 'nonfinite'] as const)(
        'does not save a model for an %s sample',
        async (kind) => {
            fixtures.trainingRows = Array.from({ length: kind === 'insufficient' ? 999 : 1000 }, (_, index) => ({
                creativeType: 'banner_gif',
                device: 'desktop',
                ownerId: index % 2 + 1,
                share: kind === 'degenerate' ? 5 : index / 10,
            }));
            if (kind === 'nonfinite') {
                fixtures.trainingRows[0]!.share = Number.NaN;
                fixtures.trainingRows[1]!.share = null;
            }
            await recalibrateS2();
            expect(fixtures.drafts).toEqual([]);
        },
    );
});
