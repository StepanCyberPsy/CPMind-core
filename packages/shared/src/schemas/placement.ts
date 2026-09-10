import { z } from 'zod';
import { CreativeTypeSchema } from './creative.js';
import { DeliveryModeSchema } from './delivery.js';

const VIDEO_SELECTOR_MAX_LENGTH = 256;
const SLOT_ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// IAB OpenRTB plcmt: 1=In-Stream, 2=In-Banner, 3=In-Article, 4=In-Feed, 5=Interstitial
export const PlcmtSchema = z.number().int().min(1).max(5);

// Режим автовоспроизведения
export const AutoplayModeSchema = z.enum([
    'autoplay',
    'click_to_play',
]);

// Placement — строка ответа API
export const PlacementRowSchema = z.object({
    uuid: z.string().uuid(),
    campaignUuid: z.string().uuid(),
    creativeUuid: z.string().uuid(),
    creativeVersionUuid: z.string().uuid().nullable(),
    creativeType: CreativeTypeSchema,
    deliveryToken: z.string().min(32),
    mode: DeliveryModeSchema,
    plcmt: PlcmtSchema.nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    autoplayMode: AutoplayModeSchema.nullable(),
    initialMuted: z.boolean(),
    skippable: z.boolean(),
    skipOffsetSec: z.number().min(0).nullable(),
    allowedDomains: z.array(
        z.string().min(1).max(253).regex(DOMAIN_REGEX),
    ).nullable(),
    slotId: z.string().regex(SLOT_ID_REGEX).nullable(),
    videoSelector: z.string().min(1).max(VIDEO_SELECTOR_MAX_LENGTH).nullable(),
    clickUrl: z.string().url().nullable(),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

// Создание placement
export const CreatePlacementPayloadSchema = z.object({
    campaignUuid: z.string().uuid(),
    creativeUuid: z.string().uuid(),
    mode: DeliveryModeSchema,
    plcmt: PlcmtSchema.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    autoplayMode: AutoplayModeSchema.optional(),
    initialMuted: z.boolean().default(true),
    skippable: z.boolean().default(false),
    skipOffsetSec: z.number().min(0).optional(),
    allowedDomains: z.array(
        z.string().min(1).max(253).regex(DOMAIN_REGEX),
    ).optional(),
    slotId: z.string().regex(SLOT_ID_REGEX).optional(),
    videoSelector: z.string().min(1).max(VIDEO_SELECTOR_MAX_LENGTH).optional(),
    clickUrl: z.string().url().optional(),
});

// Обновление placement — минимум одно поле обязательно
export const UpdatePlacementPayloadSchema = z.object({
    mode: DeliveryModeSchema.optional(),
    plcmt: PlcmtSchema.nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    autoplayMode: AutoplayModeSchema.nullable().optional(),
    initialMuted: z.boolean().optional(),
    skippable: z.boolean().optional(),
    skipOffsetSec: z.number().min(0).nullable().optional(),
    allowedDomains: z.array(
        z.string().min(1).max(253).regex(DOMAIN_REGEX),
    ).nullable().optional(),
    slotId: z.string().regex(SLOT_ID_REGEX).nullable().optional(),
    videoSelector: z.string().min(1).max(VIDEO_SELECTOR_MAX_LENGTH).nullable().optional(),
    clickUrl: z.string().url().nullable().optional(),
}).refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided' },
);

// Список placements
export const PlacementListResponseSchema = z.object({
    items: z.array(PlacementRowSchema),
    total: z.number().int(),
    pages: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
});

// Параметр маршрута :placementUuid
export const PlacementUuidParamSchema = z.object({
    placementUuid: z.string().uuid(),
});

export type Plcmt = z.infer<typeof PlcmtSchema>;
export type AutoplayMode = z.infer<typeof AutoplayModeSchema>;
export type PlacementRow = z.infer<typeof PlacementRowSchema>;
export type CreatePlacementPayload = z.infer<typeof CreatePlacementPayloadSchema>;
export type UpdatePlacementPayload = z.infer<typeof UpdatePlacementPayloadSchema>;
export type PlacementListResponse = z.infer<typeof PlacementListResponseSchema>;
export type PlacementUuidParam = z.infer<typeof PlacementUuidParamSchema>;