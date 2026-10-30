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

// Создание видеокреатива из стороннего VAST-тега. Файла нет: ролик остаётся
// у адсервера клиента, CPMind отдаёт Wrapper поверх указанного адреса.
// Версия создаётся сразу готовой — обработка media-worker не выполняется
export const CreateExternalVastCreativeSchema = z.object({
    campaignUuid: z.string().uuid(),
    name: z.string().min(1).max(255),
    vastTagUrl: z.string().min(1).max(2048),
    creativeKey: z.string().min(1).max(255).regex(/^[A-Za-zА-Яа-яЁё0-9_-]+$/u).optional(),
    clickUrl: z.string().url().max(2048).optional(),
}).strict();

export type CreateExternalVastCreative = z.infer<typeof CreateExternalVastCreativeSchema>;
