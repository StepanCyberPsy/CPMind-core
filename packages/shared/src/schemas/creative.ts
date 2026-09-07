import { z } from 'zod';

// Тип creative
export const CreativeTypeSchema = z.enum([
    'banner_static',
    'banner_gif',
    'banner_html5',
    'video_creative',
]);

// Статус creative
export const CreativeStatusSchema = z.enum([
    'draft',
    'processing',
    'ready',
    'active',
    'archived',
    'failed',
]);

// Тип устройства пользователя
export const DeviceTypeSchema = z.enum([
    'desktop',
    'mobile',
    'tablet',
]);

export type CreativeType = z.infer<typeof CreativeTypeSchema>;
export type CreativeStatus = z.infer<typeof CreativeStatusSchema>;
export type DeviceType = z.infer<typeof DeviceTypeSchema>;