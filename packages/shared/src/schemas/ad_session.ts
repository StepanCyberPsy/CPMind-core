import { z } from 'zod';
import { CreativeTypeSchema } from './creative.js';
import {
    AdSessionIdSchema,
    DeliveryModeSchema,
    MeasurementModeSchema,
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

// Тип delivery-события
export const AdSessionDeliveryEventTypeSchema = z.enum([
    'requested',
    'asset_load_started',
    'creative_ready',
    'render_confirmed',
    'creative_error',
    'player_error',
    'closed',
]);

// Payload POST /api/delivery/event
export const DeliveryEventPayloadSchema = z.object({
    adSessionId: AdSessionIdSchema,
    eventType: AdSessionDeliveryEventTypeSchema,
    errorCode: AdSessionPlayerErrorCodeSchema.optional(),
    timestampMs: z.number().int().positive(),
});

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