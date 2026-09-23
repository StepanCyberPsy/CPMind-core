import { z } from 'zod';
import { CreativeTypeSchema } from './creative.js';
import {
    DeliveryModeSchema,
    PlacementFormatSchema,
    PlacementSubtypeSchema,
    StickyCornerSchema,
    INSTREAM_DELIVERY_MODES,
    type DeliveryMode,
} from './delivery.js';
import { TagConstantsConfigIdSchema } from './tag-constants.js';

const VIDEO_SELECTOR_MAX_LENGTH = 256;
const SLOT_ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// IAB OpenRTB plcmt: 1=In-Stream, 2=In-Banner, 3=In-Article, 4=In-Feed, 5=Interstitial
export const PlcmtSchema = z.number().int().min(1).max(5);

// Звук по умолчанию определяет формат размещения: in-stream воспроизводится внутри
// контента, который зритель уже смотрит со звуком, out-stream появляется в потоке
// страницы без его запроса. Пользователь переопределяет значение явно
export function resolveDefaultInitialMuted(mode: DeliveryMode): boolean {
    return !INSTREAM_DELIVERY_MODES.has(mode);
}

// Режим автовоспроизведения
export const AutoplayModeSchema = z.enum([
    'autoplay',
    'click_to_play',
]);

// Порядок выбора ролика из набора: взвешенный случайный либо последовательный по кругу
export const RotationModeSchema = z.enum([
    'weighted_random',
    'sequential',
]);

// Сумма весов набора в процентах. Допуск покрывает представление долей,
// не делящихся нацело: три равных ролика дают 33.34 + 33.33 + 33.33
const WEIGHT_SUM_PCT = 100;
const WEIGHT_SUM_TOLERANCE = 0.01;

// Элемент набора роликов
export const PlacementCreativeSetItemSchema = z.object({
    creativeUuid: z.string().uuid(),
    weightPct: z.number().positive().max(100),
    displayOrder: z.number().int().min(0),
});

// Набор роликов плейсмента. Пустой массив снимает набор — плейсмент возвращается
// к работе с одним креативом
export const PlacementCreativeSetSchema = z.array(PlacementCreativeSetItemSchema)
    .max(20)
    .refine(
        (items) => {
            if (items.length === 0) return true;
            const sum = items.reduce((total, item) => total + item.weightPct, 0);
            return Math.abs(sum - WEIGHT_SUM_PCT) <= WEIGHT_SUM_TOLERANCE;
        },
        { message: 'Сумма весов набора должна быть равна 100' },
    )
    .refine(
        (items) => new Set(items.map((item) => item.creativeUuid)).size === items.length,
        { message: 'Креатив не может входить в набор дважды' },
    );

// Применение списка разрешённых доменов: off — не проверять, monitor — принимать
// показ с отметкой нарушения, block — отклонять показ с чужого домена
export const DomainEnforcementSchema = z.enum([
    'off',
    'monitor',
    'block',
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

    // Формат и подтип размещения. Заменяют mode, на время перехода отдаются вместе с ним
    format: PlacementFormatSchema.nullable(),
    subtype: PlacementSubtypeSchema.nullable(),

    plcmt: PlcmtSchema.nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),

    // Параметры закреплённого видео
    stickyCorner: StickyCornerSchema.nullable(),
    stickyOffsetX: z.number().int().min(0).nullable(),
    stickyOffsetY: z.number().int().min(0).nullable(),
    stickyWidth: z.number().int().positive().nullable(),
    stickyHeight: z.number().int().positive().nullable(),
    autoplayMode: AutoplayModeSchema.nullable(),
    initialMuted: z.boolean(),

    // true — значение задано пользователем, false — выведено из формата размещения
    initialMutedOverridden: z.boolean(),

    skippable: z.boolean(),
    skipOffsetSec: z.number().min(0).nullable(),
    allowedDomains: z.array(
        z.string().min(1).max(253).regex(DOMAIN_REGEX),
    ).nullable(),

    // Режим применения allowedDomains и переопределение домена площадки
    domainEnforcement: DomainEnforcementSchema,
    publisherDomain: z.string().min(1).max(253).regex(DOMAIN_REGEX).nullable(),

    slotId: z.string().regex(SLOT_ID_REGEX).nullable(),
    videoSelector: z.string().min(1).max(VIDEO_SELECTOR_MAX_LENGTH).nullable(),
    clickUrl: z.string().url().nullable(),

    // Закреплённая версия констант сбора. null — используется версия по умолчанию
    tagConstantsConfigId: TagConstantsConfigIdSchema.nullable(),
    tagConstantsVersion: z.string().nullable(),

    // Порядок выбора ролика и сам набор. Пустой набор — один креатив плейсмента
    rotationMode: RotationModeSchema,
    creativeSet: z.array(z.object({
        creativeUuid: z.string().uuid(),
        creativeName: z.string(),
        weightPct: z.number(),
        displayOrder: z.number().int(),
    })),

    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

// Создание placement
export const CreatePlacementPayloadSchema = z.object({
    campaignUuid: z.string().uuid(),
    creativeUuid: z.string().uuid(),
    mode: DeliveryModeSchema,

    // Формат и подтип. Без них выводятся из mode на сервере
    format: PlacementFormatSchema.optional(),
    subtype: PlacementSubtypeSchema.optional(),

    plcmt: PlcmtSchema.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    stickyCorner: StickyCornerSchema.optional(),
    stickyOffsetX: z.number().int().min(0).optional(),
    stickyOffsetY: z.number().int().min(0).optional(),
    stickyWidth: z.number().int().positive().optional(),
    stickyHeight: z.number().int().positive().optional(),
    autoplayMode: AutoplayModeSchema.optional(),
    rotationMode: RotationModeSchema.optional(),
    creativeSet: PlacementCreativeSetSchema.optional(),

    // Без значения умолчание выводится из формата размещения на сервере
    initialMuted: z.boolean().optional(),

    skippable: z.boolean().default(false),
    skipOffsetSec: z.number().min(0).optional(),
    allowedDomains: z.array(
        z.string().min(1).max(253).regex(DOMAIN_REGEX),
    ).optional(),
    domainEnforcement: DomainEnforcementSchema.optional(),
    publisherDomain: z.string().min(1).max(253).regex(DOMAIN_REGEX).optional(),
    slotId: z.string().regex(SLOT_ID_REGEX).optional(),
    videoSelector: z.string().min(1).max(VIDEO_SELECTOR_MAX_LENGTH).optional(),
    clickUrl: z.string().url().optional(),
    tagConstantsConfigId: TagConstantsConfigIdSchema.optional(),
});

// Обновление placement — минимум одно поле обязательно
export const UpdatePlacementPayloadSchema = z.object({
    mode: DeliveryModeSchema.optional(),
    format: PlacementFormatSchema.optional(),
    subtype: PlacementSubtypeSchema.nullable().optional(),
    plcmt: PlcmtSchema.nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    stickyCorner: StickyCornerSchema.nullable().optional(),
    stickyOffsetX: z.number().int().min(0).nullable().optional(),
    stickyOffsetY: z.number().int().min(0).nullable().optional(),
    stickyWidth: z.number().int().positive().nullable().optional(),
    stickyHeight: z.number().int().positive().nullable().optional(),
    autoplayMode: AutoplayModeSchema.nullable().optional(),
    rotationMode: RotationModeSchema.optional(),
    creativeSet: PlacementCreativeSetSchema.optional(),
    initialMuted: z.boolean().optional(),
    skippable: z.boolean().optional(),
    skipOffsetSec: z.number().min(0).nullable().optional(),
    allowedDomains: z.array(
        z.string().min(1).max(253).regex(DOMAIN_REGEX),
    ).nullable().optional(),
    domainEnforcement: DomainEnforcementSchema.optional(),
    publisherDomain: z.string().min(1).max(253).regex(DOMAIN_REGEX).nullable().optional(),
    slotId: z.string().regex(SLOT_ID_REGEX).nullable().optional(),
    videoSelector: z.string().min(1).max(VIDEO_SELECTOR_MAX_LENGTH).nullable().optional(),
    clickUrl: z.string().url().nullable().optional(),

    // null снимает закрепление — плейсмент переходит на версию по умолчанию
    tagConstantsConfigId: TagConstantsConfigIdSchema.nullable().optional(),
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

export type { DeliveryMode };
export type Plcmt = z.infer<typeof PlcmtSchema>;
export type AutoplayMode = z.infer<typeof AutoplayModeSchema>;
export type DomainEnforcement = z.infer<typeof DomainEnforcementSchema>;
export type RotationMode = z.infer<typeof RotationModeSchema>;
export type PlacementCreativeSetItem = z.infer<typeof PlacementCreativeSetItemSchema>;
export type PlacementRow = z.infer<typeof PlacementRowSchema>;
export type CreatePlacementPayload = z.infer<typeof CreatePlacementPayloadSchema>;
export type UpdatePlacementPayload = z.infer<typeof UpdatePlacementPayloadSchema>;
export type PlacementListResponse = z.infer<typeof PlacementListResponseSchema>;
export type PlacementUuidParam = z.infer<typeof PlacementUuidParamSchema>;