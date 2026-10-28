import { z } from 'zod';
import { AdSessionIdSchema } from './delivery.js';
import { TagUuidSchema } from './tag.js';
import { CreativeTypeSchema, DeviceTypeSchema } from './creative.js';

const SAFE_ID_REGEX = /^[A-Za-zА-Яа-яЁё0-9_-]+$/u;

/**
 * Показ, измеренный через OMID без доступа к странице издателя.
 *
 * Отдельный контракт, а не расширение ImpressionPayload: основной путь приёма
 * и его схема остаются нетронутыми. Набор сигналов здесь заведомо неполный —
 * прокрутки, курсора и окружения рекламы в таких режимах не существует,
 * поэтому S3, S5 в полном виде, S7 и присутствие отсутствуют по построению,
 * а не по ошибке.
 *
 * Имена полей совпадают с каноническими из ImpressionPayload: signals_raw
 * должен оставаться сопоставимым между режимами измерения.
 */

// Уровень доступа, фактически выданный плеером площадки
export const OmidAccessLevelSchema = z.enum([
    'full_page',
    'creative',
    'limited',
    'not_executed',
]);

export const OmidPartialS1Schema = z.object({
    time_in_view_sec: z.number().min(0),
    max_continuous_view_sec: z.number().min(0),
    visible_pixels_pct: z.number().int().min(0).max(100),
}).strict();

export const OmidPartialS2Schema = z.object({
    share_of_screen_avg_pct: z.number().min(0).max(100),
    share_of_screen_max_pct: z.number().min(0).max(100),
}).strict();

export const OmidPartialS4Schema = z.object({
    tab_active_time_ms: z.number().min(0),
    tab_total_time_ms: z.number().min(0),
    tab_switches_count: z.number().int().min(0),
}).strict();

// Единственный признак взаимодействия, доступный без доступа к странице
export const OmidPartialS5Schema = z.object({
    clicked: z.boolean(),
}).strict();

export const OmidPartialS6Schema = z.object({
    play_initiated: z.boolean(),
    quartile_25: z.boolean(),
    quartile_50: z.boolean(),
    quartile_75: z.boolean(),
    completion: z.boolean(),
    pause_initiated: z.boolean(),
    skipped: z.boolean(),
    volume_level: z.number().int().min(0).max(100),
    muted_status: z.enum(['muted', 'unmuted', 'mixed']),
    audible_time_sec: z.number().min(0),
    duration_sec: z.number().min(0).nullable(),
    no_output_device: z.boolean(),
}).strict();

export const OmidPartialImpressionSchema = z
    .object({
        omid_runtime_version: z.string().min(1).max(32),
        access_level: OmidAccessLevelSchema,

        // Ложь при полном уровне доступа означает, что ветка коллекторов
        // не догрузилась: такой показ не выдаётся за полное измерение
        page_collectors_loaded: z.boolean(),

        sid: AdSessionIdSchema,
        tag_uuid: TagUuidSchema,
        tag_constants_version: z.string().min(1),
        campaign_id: z.string().min(1).max(255).regex(SAFE_ID_REGEX),
        creative_id: z.string().min(1).max(255).regex(SAFE_ID_REGEX),
        creative_type: CreativeTypeSchema,
        placement_uuid: z.string().uuid(),
        creative_version_uuid: z.string().uuid(),
        delivery_kind: z.enum(['inline', 'wrapper']),
        device_type: DeviceTypeSchema,

        timestamp_start: z.number().positive(),
        timestamp_end: z.number().positive(),

        signals: z.object({
            s1: OmidPartialS1Schema,
            s2: OmidPartialS2Schema,
            s4: OmidPartialS4Schema,
            s5: OmidPartialS5Schema,
            s6: OmidPartialS6Schema,
        }).strict(),
    })
    .strict()
    .refine(
        (data) => data.timestamp_end >= data.timestamp_start,
        {
            path: ['timestamp_end'],
            message: 'timestamp_end must be greater than or equal to timestamp_start',
        },
    );

export type OmidAccessLevel = z.infer<typeof OmidAccessLevelSchema>;
export type OmidPartialImpression = z.infer<typeof OmidPartialImpressionSchema>;
