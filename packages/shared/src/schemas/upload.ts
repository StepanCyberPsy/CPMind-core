import { z } from 'zod';
import { CreativeTypeSchema } from './creative.js';

const FILENAME_REGEX = /^[^/\\]+$/;
const MIME_TYPE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/;
export const ENTITY_KEY_REGEX = /^[A-Za-zА-Яа-яЁё0-9_-]+$/u;

export const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

// Статус upload-сессии
export const UploadStatusSchema = z.enum([
    'created',
    'uploading',
    'uploaded',
    'processing',
    'ready',
    'failed',
    'expired',
]);

// Стратегия загрузки
export const UploadStrategySchema = z.enum([
    'single',
    'multipart',
]);

// Создание upload-сессии. creativeKey задаётся пользователем для сверки
// с внешней системой; без него генерируется системный ключ
export const CreateUploadPayloadSchema = z.object({
    campaignUuid: z.string().uuid(),
    creativeType: CreativeTypeSchema,
    filename: z.string().min(1).max(255).regex(FILENAME_REGEX),
    sizeBytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
    mimeType: z.string().min(1).max(127).regex(MIME_TYPE_REGEX),
    creativeKey: z.string().min(1).max(255).regex(ENTITY_KEY_REGEX).optional(),
});

// Presigned URL для одной части multipart
export const UploadPartPresignedUrlSchema = z.object({
    partNumber: z.number().int().min(1).max(10000),
    uploadUrl: z.string().url(),
});

// Ответ на создание upload-сессии
export const UploadSessionResponseSchema = z.discriminatedUnion('strategy', [
    z.object({
        uploadId: z.string().uuid(),
        strategy: z.literal('single'),
        uploadUrl: z.string().url(),
        expiresAt: z.string().datetime({ offset: true }),
    }),
    z.object({
        uploadId: z.string().uuid(),
        strategy: z.literal('multipart'),
        parts: z.array(UploadPartPresignedUrlSchema).min(1),
        expiresAt: z.string().datetime({ offset: true }),
    }),
]);

// Часть multipart с ETag от Object Storage
export const CompleteMultipartPartSchema = z.object({
    partNumber: z.number().int().min(1).max(10000),
    etag: z.string().min(1),
});

// Завершение multipart-загрузки
export const CompleteUploadPayloadSchema = z.object({
    parts: z.array(CompleteMultipartPartSchema).min(1),
});

// Статус upload-сессии (polling)
export const UploadSessionStatusSchema = z.object({
    uploadId: z.string().uuid(),
    status: UploadStatusSchema,
    processingError: z.string().nullable(),
    creativeUuid: z.string().uuid().nullable(),
    creativeVersionUuid: z.string().uuid().nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export type UploadStatus = z.infer<typeof UploadStatusSchema>;
export type UploadStrategy = z.infer<typeof UploadStrategySchema>;
export type CreateUploadPayload = z.infer<typeof CreateUploadPayloadSchema>;
export type UploadPartPresignedUrl = z.infer<typeof UploadPartPresignedUrlSchema>;
export type UploadSessionResponse = z.infer<typeof UploadSessionResponseSchema>;
export type CompleteMultipartPart = z.infer<typeof CompleteMultipartPartSchema>;
export type CompleteUploadPayload = z.infer<typeof CompleteUploadPayloadSchema>;
export type UploadSessionStatus = z.infer<typeof UploadSessionStatusSchema>;