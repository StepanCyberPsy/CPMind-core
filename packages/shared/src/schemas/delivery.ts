import { z } from 'zod';
import { TagUuidSchema } from './tag.js';
import { TagConstantsValuesSchema } from './tag-constants.js';
import { CreativeTypeSchema } from './creative.js';

// Режим доставки
export const DeliveryModeSchema = z.enum([
    'display',
    'instream_preroll',
    'instream_midroll',
    'instream_postroll',
    'outstream',
    'standalone_video',
]);

// Режим измерения
export const MeasurementModeSchema = z.enum([
    'full_direct_display',
    'full_cpmind_player',
    'partial_embedded_iframe',
    'vast_only',
    'legacy_tag',
]);

// Причина финализации measurement-сессии
export const MeasurementFinalizationReasonSchema = z.enum([
    'complete',
    'skip',
    'close',
    'timeout',
    'error',
    'page_unload',
    'idle',
    'creative_removed',
    'destroyed',
]);

// Идентификатор рекламной сессии
export const AdSessionIdSchema = z.string().uuid().brand<'AdSessionId'>();

// Таймауты player
export const PlayerTimeoutsSchema = z.object({
    configRequestMs: z.number().int().positive().default(5_000),
    vastRequestMs: z.number().int().positive().default(8_000),
    mediaStartMs: z.number().int().positive().default(15_000),
    firstFrameMs: z.number().int().positive().default(10_000),
    contentHandoffMs: z.number().int().positive().default(5_000),
    adLoadTotalMs: z.number().int().positive().default(30_000),
});

// Конфигурация delivery runtime
export const DeliveryRuntimeConfigSchema = z.object({
    adSessionId: AdSessionIdSchema,
    placementUuid: z.string().uuid(),
    deliveryToken: z.string().min(32),
    creativeVersionUuid: z.string().uuid(),
    creativeType: CreativeTypeSchema,
    deliveryMode: DeliveryModeSchema,
    tagUuid: TagUuidSchema,
    tagConstantsVersion: z.string().min(1),
    tagConstants: TagConstantsValuesSchema,
    collectEndpoint: z.string().url(),
    deliveryEventEndpoint: z.string().url(),
    vastUrl: z.string().url().nullable(),
    clickUrl: z.string().url().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    plcmt: z.number().int().positive().nullable(),
    autoplay: z.boolean(),
    initialMuted: z.boolean(),
    skippable: z.boolean(),
    skipOffsetSec: z.number().min(0).nullable(),
    timeouts: PlayerTimeoutsSchema,
});

// Тайминги доставки для диагностики
export const DeliveryTimingSchema = z.object({
    requested_at: z.number().int(),
    creative_ready_at: z.number().int().nullable(),
    render_confirmed_at: z.number().int().nullable(),
    load_duration_ms: z.number().min(0).nullable(),
});

export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;
export type MeasurementMode = z.infer<typeof MeasurementModeSchema>;
export type MeasurementFinalizationReason = z.infer<typeof MeasurementFinalizationReasonSchema>;
export type AdSessionId = z.infer<typeof AdSessionIdSchema>;
export type PlayerTimeouts = z.infer<typeof PlayerTimeoutsSchema>;
export type DeliveryRuntimeConfig = z.infer<typeof DeliveryRuntimeConfigSchema>;
export type DeliveryTiming = z.infer<typeof DeliveryTimingSchema>;