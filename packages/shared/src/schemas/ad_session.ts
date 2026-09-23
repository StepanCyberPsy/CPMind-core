import { z } from 'zod';
import { CreativeTypeSchema } from './creative.js';
import {
    AdSessionIdSchema,
    DeliveryModeSchema,
    MeasurementModeSchema,
    MeasurementFinalizationReasonSchema,
} from './delivery.js';

// Идентификационный контекст рекламной сессии
export const AdSessionIdentitySchema = z.object({
    adSessionId: AdSessionIdSchema,
    placementUuid: z.string().uuid(),
    creativeVersionUuid: z.string().uuid().nullable(),
    creativeType: CreativeTypeSchema,
    deliveryMode: DeliveryModeSchema,
    measurementMode: MeasurementModeSchema,
});

// Результат попытки autoplay
export const AdSessionAutoplayOutcomeSchema = z.enum([
    'started',
    'blocked',
    'error',
]);

// Диагностический код player
export const AdSessionPlayerErrorCodeSchema = z.enum([
    'CONFIG_FETCH_FAILED',
    'VAST_FETCH_FAILED',
    'VAST_FETCH_TIMEOUT',
    'VAST_XML_INVALID',
    'VAST_STRUCTURE_UNSUPPORTED',
    'NO_SUPPORTED_MEDIA',
    'MEDIA_LOAD_FAILED',
    'MEDIA_PLAYBACK_BLOCKED',
    'MEDIA_START_TIMEOUT',
    'FIRST_FRAME_TIMEOUT',
    'CONTENT_BRIDGE_FAILED',
    'CONTENT_RESUME_FAILED',
    'PLAYER_DESTROYED',
]);

// Качество воспроизведения (getVideoPlaybackQuality)
export const AdSessionPlaybackQualitySchema = z.object({
    dropped_frames: z.number().int().min(0),
    total_frames: z.number().int().min(0),
}).refine(
    (data) => data.dropped_frames <= data.total_frames,
    {
        path: ['dropped_frames'],
        message: 'dropped_frames must be less than or equal to total_frames',
    },
);

// Тип delivery-события. autoplay_resolved фиксирует результат попытки автозапуска
// независимо от старта измерения, measurement_started — фактический старт измерения
export const AdSessionDeliveryEventTypeSchema = z.enum([
    'requested',
    'asset_load_started',
    'creative_ready',
    'render_confirmed',
    'autoplay_resolved',
    'measurement_started',
    'creative_error',
    'player_error',
    'closed',
]);

const TERMINAL_DELIVERY_EVENT_TYPES: ReadonlySet<AdSessionDeliveryEventType> = new Set([
    'closed',
    'creative_error',
    'player_error',
]);

const ERROR_DELIVERY_EVENT_TYPES: ReadonlySet<AdSessionDeliveryEventType> = new Set([
    'creative_error',
    'player_error',
]);

// Payload POST /api/delivery/event. Поля результата автозапуска допустимы только
// для autoplay_resolved и обязательны для него, причина финализации — только для
// терминальных событий, код ошибки — только для событий ошибки
export const DeliveryEventPayloadSchema = z.object({
    adSessionId: AdSessionIdSchema,
    eventType: AdSessionDeliveryEventTypeSchema,
    errorCode: AdSessionPlayerErrorCodeSchema.optional(),
    finalizationReason: MeasurementFinalizationReasonSchema.optional(),
    autoplayOutcome: AdSessionAutoplayOutcomeSchema.optional(),
    startMuted: z.boolean().optional(),
    mutedByBrowser: z.boolean().optional(),
    timestampMs: z.number().int().positive(),
}).superRefine(
    (payload, ctx) => {
        const hasAnyAutoplayField =
            payload.autoplayOutcome !== undefined ||
            payload.startMuted !== undefined ||
            payload.mutedByBrowser !== undefined;
        const hasAllAutoplayFields =
            payload.autoplayOutcome !== undefined &&
            payload.startMuted !== undefined &&
            payload.mutedByBrowser !== undefined;

        if (payload.eventType === 'autoplay_resolved' && !hasAllAutoplayFields) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['autoplayOutcome'],
                message: 'autoplayOutcome, startMuted and mutedByBrowser are required for autoplay_resolved',
            });
        }

        if (payload.eventType !== 'autoplay_resolved' && hasAnyAutoplayField) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['autoplayOutcome'],
                message: 'autoplay fields are allowed only for autoplay_resolved',
            });
        }

        if (
            payload.finalizationReason !== undefined &&
            !TERMINAL_DELIVERY_EVENT_TYPES.has(payload.eventType)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['finalizationReason'],
                message: 'finalizationReason is allowed only for terminal events',
            });
        }

        if (
            payload.errorCode !== undefined &&
            !ERROR_DELIVERY_EVENT_TYPES.has(payload.eventType)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['errorCode'],
                message: 'errorCode is allowed only for error events',
            });
        }
    },
);

// Дополнительные поля delivery-события без идентификации сессии и метки времени
export type DeliveryEventDetails = Omit<DeliveryEventPayload, 'adSessionId' | 'eventType' | 'timestampMs'>;

// Строка ad_session из БД — контракт API-ответа
export const AdSessionRowSchema = z.object({
    adSessionId: AdSessionIdSchema,
    placementUuid: z.string().uuid(),
    creativeVersionUuid: z.string().uuid().nullable(),
    creativeType: CreativeTypeSchema,
    deliveryMode: DeliveryModeSchema,
    measurementMode: MeasurementModeSchema,
    publisherDomain: z.string().nullable(),
    playerRuntimeVersion: z.string().nullable(),
    sdkRuntimeVersion: z.string().nullable(),
    autoplayRequested: z.boolean().nullable(),
    initialMuted: z.boolean().nullable(),
    autoplayOutcome: AdSessionAutoplayOutcomeSchema.nullable(),
    startMuted: z.boolean().nullable(),
    mutedByBrowser: z.boolean().nullable(),
    requestedAt: z.string(),
    assetLoadStartedAt: z.string().nullable(),
    creativeReadyAt: z.string().nullable(),
    renderConfirmedAt: z.string().nullable(),
    measurementStartedAt: z.string().nullable(),
    measurementEndedAt: z.string().nullable(),
    vastRequestedAt: z.string().nullable(),
    vastImpressionAt: z.string().nullable(),
    videoStartedAt: z.string().nullable(),
    firstQuartileAt: z.string().nullable(),
    midpointAt: z.string().nullable(),
    thirdQuartileAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    skippedAt: z.string().nullable(),
    errorAt: z.string().nullable(),
    errorCode: AdSessionPlayerErrorCodeSchema.nullable(),
    finalizationReason: MeasurementFinalizationReasonSchema.nullable(),
    playbackQuality: AdSessionPlaybackQualitySchema.nullable(),
    lastSeenAt: z.string(),
    createdAt: z.string(),
});

export type AdSessionIdentity = z.infer<typeof AdSessionIdentitySchema>;
export type AdSessionAutoplayOutcome = z.infer<typeof AdSessionAutoplayOutcomeSchema>;
export type AdSessionPlayerErrorCode = z.infer<typeof AdSessionPlayerErrorCodeSchema>;
export type AdSessionPlaybackQuality = z.infer<typeof AdSessionPlaybackQualitySchema>;
export type AdSessionDeliveryEventType = z.infer<typeof AdSessionDeliveryEventTypeSchema>;
export type DeliveryEventPayload = z.infer<typeof DeliveryEventPayloadSchema>;
export type AdSessionRow = z.infer<typeof AdSessionRowSchema>;