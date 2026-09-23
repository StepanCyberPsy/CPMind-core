import { z } from 'zod';
import { TagUuidSchema } from './tag.js';
import { TagConstantsValuesSchema } from './tag-constants.js';
import { CreativeTypeSchema } from './creative.js';

// Режим доставки. Заменяется парой формат + подтип, сохраняется на время перехода
export const DeliveryModeSchema = z.enum([
    'display',
    'instream_preroll',
    'instream_midroll',
    'instream_postroll',
    'outstream',
    'standalone_video',
]);

// Формат размещения — верхний уровень таксономии
export const PlacementFormatSchema = z.enum([
    'banner',
    'instream',
    'outstream',
]);

// Подтип in-stream: точка вставки рекламы в контент издателя
export const InstreamSubtypeSchema = z.enum([
    'preroll',
    'midroll',
    'postroll',
    'pauseroll',
]);

// Подтип out-stream: inpage встраивается в поток страницы,
// sticky закрепляется в углу окна и прокручивается вместе со страницей
export const OutstreamSubtypeSchema = z.enum([
    'inpage',
    'sticky',
]);

// Подтип размещения. Для баннера подтип отсутствует
export const PlacementSubtypeSchema = z.union([
    InstreamSubtypeSchema,
    OutstreamSubtypeSchema,
]);

// Угол привязки закреплённого видео
export const StickyCornerSchema = z.enum([
    'top_left',
    'top_right',
    'bottom_left',
    'bottom_right',
]);

// Допустимые подтипы каждого формата — источник истины для проверки пары
export const FORMAT_SUBTYPES: Readonly<Record<PlacementFormat, readonly PlacementSubtype[]>> = {
    banner: [],
    instream: InstreamSubtypeSchema.options,
    outstream: OutstreamSubtypeSchema.options,
};

export function isValidFormatSubtype(
    format: PlacementFormat,
    subtype: PlacementSubtype | null,
): boolean {
    const allowed = FORMAT_SUBTYPES[format];
    if (allowed.length === 0) return subtype === null;
    return subtype !== null && allowed.includes(subtype);
}

// Видео воспроизводится во всех форматах, кроме баннера
export function isVideoFormat(format: PlacementFormat): boolean {
    return format !== 'banner';
}

// In-stream привязывается к content video издателя — собственный контейнер не требуется
export function isInstreamFormat(format: PlacementFormat): boolean {
    return format === 'instream';
}

// Player создаёт собственную поверхность в контейнере placement
export function isSelfMountedFormat(format: PlacementFormat): boolean {
    return format === 'outstream';
}

// IAB OpenRTB 2.6 plcmt: in-stream — 1, остальные форматы видео — 2
export function resolvePlcmt(format: PlacementFormat): number | null {
    if (format === 'banner') return null;
    return format === 'instream' ? 1 : 2;
}

// Соответствие прежней модели новой. Нужно на время перехода: сессии и показы
// пишут обе модели, пока delivery_mode не снят со схемы
export function toFormatSubtype(
    mode: DeliveryMode,
): { format: PlacementFormat; subtype: PlacementSubtype | null } {
    switch (mode) {
        case 'display':
            return { format: 'banner', subtype: null };
        case 'instream_preroll':
            return { format: 'instream', subtype: 'preroll' };
        case 'instream_midroll':
            return { format: 'instream', subtype: 'midroll' };
        case 'instream_postroll':
            return { format: 'instream', subtype: 'postroll' };
        case 'outstream':
        case 'standalone_video':
            return { format: 'outstream', subtype: 'inpage' };
    }
}

// Обратное соответствие. Подтипы, отсутствовавшие в прежней модели, приводятся
// к ближайшему существовавшему значению того же формата
export function toDeliveryMode(
    format: PlacementFormat,
    subtype: PlacementSubtype | null,
): DeliveryMode {
    if (format === 'banner') return 'display';

    if (format === 'instream') {
        switch (subtype) {
            case 'midroll': return 'instream_midroll';
            case 'postroll': return 'instream_postroll';
            default: return 'instream_preroll';
        }
    }

    return 'outstream';
}

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

// Производные множества режимов доставки. Единый источник истины для backend,
// frontend и player — локальные копии расходятся при добавлении режима в enum
export const VIDEO_DELIVERY_MODES: ReadonlySet<DeliveryMode> = new Set([
    'instream_preroll',
    'instream_midroll',
    'instream_postroll',
    'outstream',
    'standalone_video',
]);

// Привязываются к content video издателя — собственный контейнер не требуется
export const INSTREAM_DELIVERY_MODES: ReadonlySet<DeliveryMode> = new Set([
    'instream_preroll',
    'instream_midroll',
    'instream_postroll',
]);

// Player создаёт собственную поверхность в контейнере placement
export const SELF_MOUNTED_DELIVERY_MODES: ReadonlySet<DeliveryMode> = new Set([
    'outstream',
    'standalone_video',
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

// Конфигурация delivery runtime. adSessionId = null для in-stream: сессия выдаётся плееру
// через sessionEndpoint в момент рекламной вставки. measurementMode определяет только сервер.
// campaignId и creativeId — безопасные системные ключи для payload, атрибуция показа
// выполняется сервером по ad_session
export const DeliveryRuntimeConfigSchema = z.object({
    adSessionId: AdSessionIdSchema.nullable(),
    placementUuid: z.string().uuid(),
    deliveryToken: z.string().min(32),
    creativeVersionUuid: z.string().uuid(),
    creativeType: CreativeTypeSchema,
    deliveryMode: DeliveryModeSchema,
    format: PlacementFormatSchema,
    subtype: PlacementSubtypeSchema.nullable(),
    measurementMode: MeasurementModeSchema,
    campaignId: z.string().min(1),
    creativeId: z.string().min(1),
    tagUuid: TagUuidSchema,
    tagConstantsVersion: z.string().min(1),
    tagConstants: TagConstantsValuesSchema,
    collectEndpoint: z.string().url(),
    deliveryEventEndpoint: z.string().url(),
    sessionEndpoint: z.string().url(),
    advanceEndpoint: z.string().url(),
    vastUrl: z.string().url().nullable(),
    clickUrl: z.string().url().nullable(),
    slotId: z.string().nullable(),
    videoSelector: z.string().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),

    // Параметры закреплённой поверхности. Заполняются только для подтипа sticky
    stickyCorner: StickyCornerSchema.nullable(),
    stickyOffsetX: z.number().int().min(0).nullable(),
    stickyOffsetY: z.number().int().min(0).nullable(),
    stickyWidth: z.number().int().positive().nullable(),
    stickyHeight: z.number().int().positive().nullable(),

    plcmt: z.number().int().positive().nullable(),
    autoplay: z.boolean(),
    initialMuted: z.boolean(),
    skippable: z.boolean(),
    skipOffsetSec: z.number().min(0).nullable(),
    timeouts: PlayerTimeoutsSchema,
});

export const DeliverySessionRequestSchema = z.object({
    deliveryToken: z.string().min(32),
});

export const DeliverySessionResponseSchema = z.object({
    adSessionId: AdSessionIdSchema,
});

// Переход рекламной сессии к следующему ролику набора. Сессия остаётся прежней:
// цикл out-stream — новый показ внутри той же рекламной возможности
export const DeliveryAdvanceRequestSchema = z.object({
    deliveryToken: z.string().min(32),
    adSessionId: AdSessionIdSchema,
});

export const DeliveryAdvanceResponseSchema = z.object({
    videoShowIndex: z.number().int().min(0),
    creativeVersionUuid: z.string().uuid(),
});

// Тайминги доставки для диагностики
export const DeliveryTimingSchema = z.object({
    requested_at: z.number().int(),
    creative_ready_at: z.number().int().nullable(),
    render_confirmed_at: z.number().int().nullable(),
    load_duration_ms: z.number().min(0).nullable(),
});

export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;
export type PlacementFormat = z.infer<typeof PlacementFormatSchema>;
export type InstreamSubtype = z.infer<typeof InstreamSubtypeSchema>;
export type OutstreamSubtype = z.infer<typeof OutstreamSubtypeSchema>;
export type PlacementSubtype = z.infer<typeof PlacementSubtypeSchema>;
export type StickyCorner = z.infer<typeof StickyCornerSchema>;
export type MeasurementMode = z.infer<typeof MeasurementModeSchema>;
export type MeasurementFinalizationReason = z.infer<typeof MeasurementFinalizationReasonSchema>;
export type AdSessionId = z.infer<typeof AdSessionIdSchema>;
export type PlayerTimeouts = z.infer<typeof PlayerTimeoutsSchema>;
export type DeliveryRuntimeConfig = z.infer<typeof DeliveryRuntimeConfigSchema>;
export type DeliverySessionRequest = z.infer<typeof DeliverySessionRequestSchema>;
export type DeliverySessionResponse = z.infer<typeof DeliverySessionResponseSchema>;
export type DeliveryAdvanceRequest = z.infer<typeof DeliveryAdvanceRequestSchema>;
export type DeliveryAdvanceResponse = z.infer<typeof DeliveryAdvanceResponseSchema>;
export type DeliveryTiming = z.infer<typeof DeliveryTimingSchema>;