import { z } from 'zod';
import { AdSessionIdSchema } from './delivery.js';

const HTTP_URI_TEMPLATE_REGEX = /^https?:\/\/[^\s\u0000-\u001F\u007F]+$/i;
const HTTP_URL_REGEX = /^https?:\/\//i;
const HTTPS_URL_REGEX = /^https:\/\//i;

// URI VAST tracking-ресурса с поддержкой макросов
export const VastTrackingUriTemplateSchema = z.string()
    .min(1)
    .regex(HTTP_URI_TEMPLATE_REGEX);

// URL media-файла
export const VastMediaFileUrlSchema = z.string()
    .url()
    .regex(
        HTTP_URL_REGEX,
        { message: 'Media file URL must use HTTP or HTTPS' },
    );

// Безопасный clickthrough URL
export const VastClickThroughUrlSchema = z.string()
    .url()
    .regex(
        HTTPS_URL_REGEX,
        { message: 'Clickthrough URL must use HTTPS' },
    );

// Linear tracking events VAST 4.3
export const VastLinearTrackingEventTypeSchema = z.enum([
    'creativeView',
    'start',
    'firstQuartile',
    'midpoint',
    'thirdQuartile',
    'complete',
    'progress',
    'pause',
    'resume',
    'rewind',
    'mute',
    'unmute',
    'skip',
    'closeLinear',
    'fullscreen',
    'exitFullscreen',
    'playerExpand',
    'playerCollapse',
    'acceptInvitationLinear',
    'otherAdInteraction',
    'notUsed',
]);

// Событие CPMind VAST tracking endpoint
export const VastTrackingRequestEventSchema = z.union([
    VastLinearTrackingEventTypeSchema,
    z.enum([
        'impression',
        'click',
        'error',
    ]),
]);

// Error codes IAB VAST 4.3
export const VastErrorCodeSchema = z.enum([
    '100',
    '101',
    '102',
    '200',
    '201',
    '202',
    '203',
    '204',
    '205',
    '300',
    '301',
    '302',
    '303',
    '304',
    '400',
    '401',
    '402',
    '403',
    '405',
    '406',
    '407',
    '408',
    '409',
    '410',
    '500',
    '501',
    '502',
    '503',
    '600',
    '601',
    '602',
    '603',
    '604',
    '900',
    '901',
]);

// Параметр маршрута tracking endpoint
export const VastTrackingEventParamSchema = z.object({
    event: VastTrackingRequestEventSchema,
}).strict();

// Query tracking endpoint
export const VastTrackingQuerySchema = z.object({
    sid: AdSessionIdSchema,
    code: VastErrorCodeSchema.optional(),
}).strict();

// Нормализованный tracking request
export const VastTrackingRequestSchema = z.object({
    event: VastTrackingRequestEventSchema,
    sid: AdSessionIdSchema,
    code: VastErrorCodeSchema.optional(),
}).strict().superRefine(
    (request, ctx) => {
        if (request.event === 'error' && request.code === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['code'],
                message: 'code is required for error event',
            });
        }

        if (request.event !== 'error' && request.code !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['code'],
                message: 'code is allowed only for error event',
            });
        }
    },
);

// Time offset VAST
export const VastTimeOffsetSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('seconds'),
        value: z.number().finite().min(0),
    }).strict(),
    z.object({
        kind: z.literal('percent'),
        value: z.number().finite().min(0).max(100),
    }).strict(),
]);

// Linear tracking resource
export const VastTrackingResourceSchema = z.object({
    event: VastLinearTrackingEventTypeSchema,
    url: VastTrackingUriTemplateSchema,
    offset: VastTimeOffsetSchema.nullable(),
}).strict().superRefine(
    (resource, ctx) => {
        if (resource.event === 'progress' && resource.offset === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['offset'],
                message: 'offset is required for progress event',
            });
        }

        if (resource.event !== 'progress' && resource.offset !== null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['offset'],
                message: 'offset is allowed only for progress event',
            });
        }
    },
);

// Video MediaFile VAST
export const VastMediaFileSchema = z.object({
    id: z.string().min(1).nullable(),
    url: VastMediaFileUrlSchema,
    type: z.string().min(1),
    delivery: z.enum([
        'progressive',
        'streaming',
    ]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    codec: z.string().min(1).nullable(),
    bitrateKbps: z.number().int().positive().nullable(),
    minBitrateKbps: z.number().int().positive().nullable(),
    maxBitrateKbps: z.number().int().positive().nullable(),
    scalable: z.boolean().nullable(),
    maintainAspectRatio: z.boolean().nullable(),
    fileSizeBytes: z.number().int().positive().nullable(),
    mediaType: z.string().min(1).nullable(),
}).strict().superRefine(
    (mediaFile, ctx) => {
        const hasMinBitrate = mediaFile.minBitrateKbps !== null;
        const hasMaxBitrate = mediaFile.maxBitrateKbps !== null;

        if (hasMinBitrate !== hasMaxBitrate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: hasMinBitrate ? ['maxBitrateKbps'] : ['minBitrateKbps'],
                message: 'minBitrateKbps and maxBitrateKbps must be provided together',
            });
        }

        if (
            mediaFile.minBitrateKbps !== null &&
            mediaFile.maxBitrateKbps !== null &&
            mediaFile.minBitrateKbps > mediaFile.maxBitrateKbps
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['minBitrateKbps'],
                message: 'minBitrateKbps must be less than or equal to maxBitrateKbps',
            });
        }
    },
);

// Impression resource
export const VastImpressionSchema = z.object({
    id: z.string().min(1).nullable(),
    url: VastTrackingUriTemplateSchema,
}).strict();

// AdSystem
export const VastAdSystemSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1).nullable(),
}).strict();

// UniversalAdId
export const VastUniversalAdIdSchema = z.object({
    idRegistry: z.string().min(1),
    value: z.string().min(1),
}).strict();

// ClickThrough
export const VastClickThroughSchema = z.object({
    id: z.string().min(1).nullable(),
    url: VastClickThroughUrlSchema,
}).strict();

// ClickTracking
export const VastClickTrackingSchema = z.object({
    id: z.string().min(1).nullable(),
    url: VastTrackingUriTemplateSchema,
}).strict();

// VideoClicks
export const VastVideoClicksSchema = z.object({
    clickThrough: VastClickThroughSchema.nullable(),
    clickTracking: z.array(VastClickTrackingSchema),
}).strict();

// Нормализованный CPMind VAST 4.3 InLine video ad
// OMID verification script — parsed but not executed in v1
export const VastVerificationSchema = z.object({
    vendor: z.string().min(1).nullable(),
    apiFramework: z.string().min(1),
    javascriptResourceUri: z.string().url(),
    verificationParameters: z.string().nullable(),
}).strict();

export const VastParsedAdSchema = z.object({
    vastVersion: z.literal('4.3'),
    format: z.literal('inline'),
    adType: z.literal('video'),
    adId: z.string().min(1).nullable(),
    adSystem: VastAdSystemSchema,
    adServingId: z.string().min(1).optional(),
    universalAdIds: z.array(VastUniversalAdIdSchema).min(1),
    adVerifications: z.array(VastVerificationSchema).optional(),
    title: z.string().min(1).optional(),
    durationSec: z.number().finite().positive(),
    skipOffset: VastTimeOffsetSchema.nullable(),
    mediaFiles: z.array(VastMediaFileSchema).min(1),
    impressions: z.array(VastImpressionSchema).min(1),
    errorUrls: z.array(VastTrackingUriTemplateSchema),
    trackingEvents: z.array(VastTrackingResourceSchema),
    videoClicks: VastVideoClicksSchema,
}).strict();

export type VastTrackingUriTemplate = z.infer<typeof VastTrackingUriTemplateSchema>;
export type VastMediaFileUrl = z.infer<typeof VastMediaFileUrlSchema>;
export type VastClickThroughUrl = z.infer<typeof VastClickThroughUrlSchema>;
export type VastLinearTrackingEventType = z.infer<typeof VastLinearTrackingEventTypeSchema>;
export type VastTrackingRequestEvent = z.infer<typeof VastTrackingRequestEventSchema>;
export type VastErrorCode = z.infer<typeof VastErrorCodeSchema>;
export type VastTrackingEventParam = z.infer<typeof VastTrackingEventParamSchema>;
export type VastTrackingQuery = z.infer<typeof VastTrackingQuerySchema>;
export type VastTrackingRequest = z.infer<typeof VastTrackingRequestSchema>;
export type VastTimeOffset = z.infer<typeof VastTimeOffsetSchema>;
export type VastTrackingResource = z.infer<typeof VastTrackingResourceSchema>;
export type VastMediaFile = z.infer<typeof VastMediaFileSchema>;
export type VastImpression = z.infer<typeof VastImpressionSchema>;
export type VastAdSystem = z.infer<typeof VastAdSystemSchema>;
export type VastUniversalAdId = z.infer<typeof VastUniversalAdIdSchema>;
export type VastClickThrough = z.infer<typeof VastClickThroughSchema>;
export type VastClickTracking = z.infer<typeof VastClickTrackingSchema>;
export type VastVideoClicks = z.infer<typeof VastVideoClicksSchema>;
export type VastVerification = z.infer<typeof VastVerificationSchema>;
export type VastParsedAd = z.infer<typeof VastParsedAdSchema>;