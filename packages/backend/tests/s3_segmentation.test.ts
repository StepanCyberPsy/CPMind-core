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
    normalizeS3,
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
    s2: vi.fn(),
    s4: vi.fn(),
    s5: vi.fn(),
    s6: vi.fn(),
    s7: vi.fn(),
    ivtList: vi.fn(),
    ivtThresholds: vi.fn(),
}));

// The real resolver and fitting runner use fixtures; no connection pool is created.
vi.mock('../src/db/index.js', () => ({
    db: { select: mocks.select, insert: mocks.insert },
}));
vi.mock('../src/services/tag/tags.js', () => ({ resolveActiveTagOwner: mocks.owner }));
vi.mock('../src/services/tag/tag_constants.js', () => ({ resolveTagConstantsVersion: mocks.constants }));
vi.mock('../src/services/delivery/impression_context.js', () => ({ resolveImpressionContext: mocks.context }));
vi.mock('../src/services/configs/weights_config.js', () => ({ getActiveWeightsConfig: mocks.weights }));
vi.mock('../src/services/configs/weibull_config.js', () => ({ getActiveWeibullParams: mocks.s1 }));
vi.mock('../src/services/configs/s2_config.js', () => ({ getActiveS2Params: mocks.s2 }));
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
    s3LogisticConfigs,
    type ImpressionInsert,
    type S3LogisticConfigInsert,
    type S3LogisticConfigSelect,
} from '../src/db/schema.js';
import { impressionsRoute } from '../src/routes/impressions.js';
import {
    getActiveS3LogisticParams,
    invalidateS3LogisticCache,
} from '../src/services/configs/logistic_config.js';
import { recalibrateS3Logistic } from '../src/jobs/s3_logistic_recalibration.js';

const NOW_MS = Date.UTC(2026, 9, 19, 12);
const DEVICES = ['desktop', 'mobile', 'tablet'] as const;
const BANNERS = ['banner_static', 'banner_gif', 'banner_html5'] as const;
type Device = typeof DEVICES[number];
type Scroll = NonNullable<ImpressionPayload['signals']['s3']>;
interface TrainingRow {
    creativeType: CreativeType;
    device: Device;
    version: string;
    ownerId: number;
    impressionId: string;
    s1RawTimeInView: number;
    signalsRaw: { s3: Scroll; s5: { clicked: boolean } };
}

const dialect = new PgDialect();
const fixtures = {
    configs: [] as S3LogisticConfigSelect[],
    records: [] as ImpressionInsert[],
    drafts: [] as S3LogisticConfigInsert[],
    trainingRows: [] as TrainingRow[],
    queries: [] as { kind: string; sql: string; params: unknown[] }[],
    dominantVersion: 'fixture-v1' as string | null,
};

function scroll(speed: number): Scroll {
    return {
        scroll_speed_avg_px_s: speed,
        scroll_speed_max_px_s: speed,
        scroll_speed_std_dev: 0,
        pause_count: 0,
        pause_duration_total_ms: 0,
        scroll_streaks: 0,
        direction_changes: 0,
        reading_pattern_detected: false,
        is_momentum_scroll: false,
    };
}

function addModel(
    segmentKey: string,
    overrides: Partial<S3LogisticConfigSelect> = {},
): S3LogisticConfigSelect {
    const row: S3LogisticConfigSelect = {
        id: '11111111-1111-4111-8111-' + String(fixtures.configs.length + 1).padStart(12, '0'),
        segmentKey,
        tagConstantsVersion: 'fixture-v1',
        coefficients: {
            beta0: -1, beta1: 0.02, beta2: 0, beta3: 0,
            beta4: 0, beta5: 0, beta6: 0, beta7: 0,
        },
        featureMeans: { ...DEFAULT_LOGISTIC_PARAMS.featureMeans },
        featureStds: { ...DEFAULT_LOGISTIC_PARAMS.featureStds },
        sampleSize: 1200,
        accuracy: 0.8,
        auc: 0.8,
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
            s1: { time_in_view_sec: 5, mrc_compliant: true, visible_pixels_pct: 100, max_continuous_view_sec: 5 },
            s2: { share_of_screen_avg_pct: 4, share_of_screen_max_pct: 4 },
            s3: scroll(20),
            s4: { tab_active_time_ms: 5000, tab_total_time_ms: 5000, tab_switches_count: 0, visibility_state_history: [] },
            s5: {
                clicked: false, hover_count: 1, hover_duration_max_ms: 500, hover_duration_total_ms: 500,
                hover_to_click_latency_ms: null, cursor_proximity_min_px: 10, cursor_trajectory_entropy: 0.5,
                tap_count: null, touch_start_end_delta_ms: null, zoom: null, swipe_count: null,
            },
            s6: null,
            s7: {
                creative_position_y_px: 100, page_height_total_px: 2000, is_above_the_fold: true,
                competing_ads_visible: 0, viewability_persistence_pct: 100,
            },
        },
        presence: { last_user_event_timestamp: NOW_MS - 100, time_since_last_event_ms: 100, events_count_during_impression: 1 },
    });
}

async function collect(
    creativeType: CreativeType,
    device: Device,
    s3: ImpressionPayload['signals']['s3'] = scroll(20),
): Promise<ImpressionInsert> {
    const app = Fastify({ logger: false });
    try {
        await app.register(impressionsRoute, { prefix: '/api' });
        const input = payload(creativeType, device);
        input.signals.s3 = s3;
        const response = await app.inject({ method: 'POST', url: '/api/collect', payload: input });
        expect(response.statusCode, response.body).toBe(202);
        expect(fixtures.records).toHaveLength(1);
        return fixtures.records[0]!;
    } finally {
        await app.close();
    }
}

function addTrainingRows(type: CreativeType, device: Device, count: number): void {
    for (let index = 0; index < count; index++) {
        const speed = (index % 101) * 10;
        fixtures.trainingRows.push({
            creativeType: type,
            device,
            version: 'fixture-v1',
            ownerId: index % 2 + 1,
            impressionId: type + '-' + device + '-' + index,
            s1RawTimeInView: speed > 500 ? 10 : 2,
            signalsRaw: {
                s3: {
                    ...scroll(speed),
                    scroll_speed_std_dev: (index % 7) * 3,
                    pause_count: index % 5,
                    direction_changes: index % 3,
                    scroll_streaks: index % 11,
                    reading_pattern_detected: index % 2 === 0,
                    is_momentum_scroll: index % 3 === 0,
                },
                s5: { clicked: false },
            },
        });
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    fixtures.configs = [];
    fixtures.records = [];
    fixtures.drafts = [];
    fixtures.trainingRows = [];
    fixtures.queries = [];
    fixtures.dominantVersion = 'fixture-v1';
    invalidateS3LogisticCache();
    mocks.owner.mockResolvedValue({ tagId: 11, userId: 12 });
    mocks.constants.mockResolvedValue({ isActive: true, presenceIdleThresholdMs: 30_000 });
    mocks.context.mockResolvedValue({ kind: 'legacy' });
    mocks.weights.mockImplementation(async (category: CreativeCategory) => DEFAULT_WEIGHTS_BY_CATEGORY[category]);
    mocks.s1.mockResolvedValue({ params: DEFAULT_WEIBULL_PARAMS, modelVersion: 'fixture-s1' });
    mocks.s2.mockResolvedValue({ params: DEFAULT_S2_PARAMS, modelVersion: 'fixture-s2' });
    mocks.s4.mockResolvedValue({ config: DEFAULT_S4_CONFIGS.default, modelVersion: 'fixture-s4' });
    mocks.s5.mockImplementation(async (segment: string) => ({
        params: segment === 'desktop' ? DEFAULT_S5_DESKTOP : DEFAULT_S5_MOBILE_TABLET,
        modelVersion: 'fixture-s5',
    }));
    mocks.s6.mockResolvedValue({ params: DEFAULT_S6_INSTREAM_LOGISTIC_PARAMS, modelVersion: 'fixture-s6' });
    mocks.s7.mockImplementation(async (device: Device) => ({
        thresholds: DEFAULT_S7_THRESHOLDS[device], modelVersion: 'fixture-s7',
    }));
    mocks.ivtList.mockResolvedValue(null);
    mocks.ivtThresholds.mockResolvedValue(DEFAULT_IVT_THRESHOLDS);

    mocks.select.mockImplementation((columns?: Record<string, unknown>) => ({
        from: (table: unknown) => ({
            where: (condition: SQL) => {
                const query = dialect.sqlToQuery(condition);
                const kind = table === s3LogisticConfigs ? 'config'
                    : columns?.version === impressions.tagConstantsVersion ? 'dominant'
                        : columns?.signalsRaw === impressions.signalsRaw ? 'sample' : 'exclusions';
                fixtures.queries.push({ ...query, kind });
                if (table === s3LogisticConfigs) {
                    return { orderBy: () => ({ limit: async () => fixtures.configs
                        .filter((row) => row.isActive && row.segmentKey === query.params[0]
                            && (query.params.length === 2 || row.tagConstantsVersion === query.params[2]))
                        .sort((a, b) => b.fittedAt.getTime() - a.fittedAt.getTime())
                        .slice(0, 1),
                    }) };
                }
                if (table !== impressions) throw new Error('Unexpected fixture query');
                if (kind === 'dominant') {
                    return { groupBy: () => ({ orderBy: () => ({
                        limit: async () => fixtures.dominantVersion === null ? [] : [{ version: fixtures.dominantVersion }],
                    }) }) };
                }
                const device = DEVICES.find((value) => query.params.includes(value));
                const rows = fixtures.trainingRows.filter((row) => query.params.includes(row.creativeType)
                    && query.params.includes(row.version) && (device === undefined || row.device === device));
                if (kind === 'sample') return Promise.resolve(rows);
                if (columns && 'candidates' in columns) {
                    return Promise.resolve([{ candidates: rows.length, unreliable: 0, contextMismatch: 0, legacy: 0 }]);
                }
                throw new Error('Unexpected fixture query');
            },
        }),
    }));
    mocks.insert.mockImplementation((table: unknown) => ({
        values: (record: ImpressionInsert | S3LogisticConfigInsert) => {
            if (table === impressions) {
                fixtures.records.push(record as ImpressionInsert);
                return { onConflictDoUpdate: async () => undefined };
            }
            if (table === s3LogisticConfigs) {
                fixtures.drafts.push(record as S3LogisticConfigInsert);
                return Promise.resolve();
            }
            throw new Error('Unexpected fixture insert');
        },
    }));
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TEST-2 / TEST-6: banner S3 selection is independent of S1/S2', () => {
    for (const device of DEVICES) {
        for (const type of BANNERS) {
            it(type + ' on ' + device + ' uses calibrated static S3 instead of neutral global', async () => {
                const model = addModel(device + '|static');
                addModel(device + '|animated', { coefficients: {} });
                addModel('global', { tagConstantsVersion: 'v0', coefficients: {}, sampleSize: 0 });
                const record = await collect(type, device);
                expect(record.s3ModelVersion).toBe(model.id);
                expect(record.s3Normalized).toBeCloseTo(100 / (1 + Math.exp(0.6)));
                const otherGroup = type === 'banner_static' ? 'static' : 'animated';
                expect(mocks.s1).toHaveBeenCalledWith(device + '|' + otherGroup);
                expect(mocks.s2).toHaveBeenCalledWith(device + '|' + otherGroup);
            });
        }
        it('video on ' + device + ' retains its separate S3 model', async () => {
            addModel(device + '|static');
            const model = addModel(device + '|video');
            const record = await collect('video_creative', device);
            expect(record.s3ModelVersion).toBe(model.id);
            expect(mocks.s1).toHaveBeenCalledWith(device + '|video');
            expect(mocks.s2).toHaveBeenCalledWith(device + '|video');
        });
    }

    it('preserves unavailable S3 as null', async () => {
        addModel('desktop|static');
        expect((await collect('banner_gif', 'desktop', null)).s3Normalized).toBeNull();
    });
});

describe('TEST-3 / TEST-6: S3 version and fallback semantics', () => {
    it('prioritizes the matching constants version over a newer version in the same segment', async () => {
        const matching = addModel('desktop|static');
        addModel('desktop|static', { tagConstantsVersion: 'v0', fittedAt: new Date(NOW_MS + 1000) });
        expect((await getActiveS3LogisticParams('desktop|static', 'fixture-v1')).modelVersion).toBe(matching.id);
    });

    it('uses a calibrated v0 device model before a matching-version global fallback', async () => {
        const model = addModel('desktop|static', { tagConstantsVersion: 'v0' });
        addModel('global', { coefficients: {} });
        const record = await collect('banner_gif', 'desktop');
        expect(record.s3ModelVersion).toBe(model.id);
        expect(record.s3Normalized).toBeCloseTo(100 / (1 + Math.exp(0.6)));
    });

    it('selects the latest active version when the requested version is absent', async () => {
        addModel('desktop|static', { tagConstantsVersion: 'old' });
        const latest = addModel('desktop|static', { tagConstantsVersion: 'new', fittedAt: new Date(NOW_MS + 1000) });
        addModel('desktop|static', { fittedAt: new Date(NOW_MS + 2000), isActive: false });
        expect((await getActiveS3LogisticParams('desktop|static', 'absent')).modelVersion).toBe(latest.id);
    });

    for (const group of ['static', 'video']) {
        it.each(['group', 'global', 'default'] as const)(group + ' resolves the %s fallback', async (level) => {
            const model = level === 'default' ? null : addModel(level === 'group' ? group : 'global');
            const result = await getActiveS3LogisticParams('desktop|' + group, 'fixture-v1');
            expect(result.modelVersion).toBe(model?.id ?? 'default');
            expect(normalizeS3(scroll(20), result.params)).toBeCloseTo(model ? 100 / (1 + Math.exp(0.6)) : 50);
            expect(fixtures.queries[0]!.params[0]).toBe('desktop|' + group);
        });
    }

    it('returns 50 for a neutral global v0 model while retaining its configuration ID', async () => {
        const global = addModel('global', { tagConstantsVersion: 'v0', coefficients: {}, sampleSize: 0 });
        const record = await collect('banner_gif', 'desktop');
        expect(record.s3ModelVersion).toBe(global.id);
        expect(record.s3Normalized).toBe(50);
    });

    it('separates cache entries by constants version and clears them on invalidation', async () => {
        const first = addModel('desktop|static');
        const second = addModel('desktop|static', { tagConstantsVersion: 'v0' });
        expect((await getActiveS3LogisticParams('desktop|static', 'fixture-v1')).modelVersion).toBe(first.id);
        expect((await getActiveS3LogisticParams('desktop|static', 'v0')).modelVersion).toBe(second.id);
        const count = fixtures.queries.length;
        await getActiveS3LogisticParams('desktop|static', 'v0');
        expect(fixtures.queries).toHaveLength(count);
        invalidateS3LogisticCache();
        await getActiveS3LogisticParams('desktop|static', 'v0');
        expect(fixtures.queries).toHaveLength(count + 1);
    });
});

describe('TEST-4 / TEST-5: pooled S3 training and existing safeguards', () => {
    it('fits static and video drafts with the real fitter and versioned quality-filtered queries', async () => {
        for (const device of DEVICES) {
            for (const type of BANNERS) addTrainingRows(type, device, 400);
            addTrainingRows('video_creative', device, 1000);
        }
        await recalibrateS3Logistic();
        expect(fixtures.drafts.map((row) => row.segmentKey)).toEqual([
            'desktop|static', 'mobile|static', 'tablet|static', 'static',
            'desktop|video', 'mobile|video', 'tablet|video', 'video',
        ]);
        for (const draft of fixtures.drafts) {
            const isVideo = draft.segmentKey.includes('video');
            expect(draft.sampleSize).toBe((isVideo ? 800 : 960) * (draft.segmentKey.includes('|') ? 1 : 3));
            expect(draft.tagConstantsVersion).toBe('fixture-v1');
            expect(draft.isActive).toBe(false);
            expect(Object.values(draft.coefficients as Record<string, number>).every(Number.isFinite)).toBe(true);
            expect(draft.auc).toBeGreaterThan(0.9);
        }
        const queries = fixtures.queries.filter((query) => query.kind === 'sample');
        expect(queries).toHaveLength(8);
        for (const query of queries) {
            const types = query.params.filter((value) => typeof value === 'string'
                && (value.startsWith('banner_') || value === 'video_creative'));
            expect(types).toEqual(types.includes('video_creative') ? ['video_creative'] : [...BANNERS]);
            expect(query.params).toContain('fixture-v1');
            expect(query.params).toContain(new Date(NOW_MS - 30 * 86400_000).toISOString());
            expect(query.sql).toContain('"score_reliable" =');
            expect(query.sql).toContain('"is_suspicious" =');
            expect(query.sql).toContain('"s3_raw_scroll_speed" is not null');
            expect(query.sql).toContain('CLIENT_CONTEXT_MISMATCH');
            expect(query.sql).toContain('NOT (');
            expect(query.params).toContain(true);
            expect(query.params).toContain(false);
            expect(query.sql).not.toContain('"user_id"');
            expect(query.sql).not.toContain('"tag_id"');
            expect(query.params).not.toContain('legacy_tag');
        }
        expect(fixtures.queries.find((query) => query.kind === 'dominant')!.sql).toContain('"score_reliable" =');
    });

    it.each(['insufficient', 'one_class', 'no_version'] as const)('does not save drafts for %s', async (kind) => {
        addTrainingRows('banner_gif', 'desktop', kind === 'insufficient' ? 999 : 1000);
        if (kind === 'one_class') {
            for (const row of fixtures.trainingRows) row.signalsRaw.s5.clicked = true;
        }
        if (kind === 'no_version') fixtures.dominantVersion = null;
        await recalibrateS3Logistic();
        expect(fixtures.drafts).toEqual([]);
    });
});
