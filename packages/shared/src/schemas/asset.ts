import { z } from 'zod';

// Класс ассета
export const AssetClassSchema = z.enum([
    'source',
    'image',
    'animated_image',
    'video',
    'video_poster',
    'html_file',
    'svg',
]);

// Статус обработки
export const AssetStatusSchema = z.enum([
    'pending',
    'ready',
    'failed',
]);

// Тип аудиосоединения
export const AudioConnectionSchema = z.enum([
    'bluetooth',
    'wired_headphones',
    'built_in_speaker',
    'external_speaker',
    'unknown',
    'none',
]);

// Ассет
export const AssetRowSchema = z.object({
    id: z.string().uuid(),
    sha256: z.string().length(64),
    mime_type: z.string().min(1),
    extension: z.string().min(1),
    size_bytes: z.number().int().positive(),
    storage_key: z.string().min(1),
    asset_class: AssetClassSchema,
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    duration_sec: z.number().positive().nullable(),
    codec: z.string().nullable(),
    bitrate_bps: z.number().int().positive().nullable(),
    status: AssetStatusSchema,
    processing_profile_version: z.string().nullable(),
    created_at: z.string(),
});

export type AssetClass = z.infer<typeof AssetClassSchema>;
export type AssetStatus = z.infer<typeof AssetStatusSchema>;
export type AudioConnection = z.infer<typeof AudioConnectionSchema>;
export type AssetRow = z.infer<typeof AssetRowSchema>;