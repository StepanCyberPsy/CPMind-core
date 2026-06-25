import { z } from 'zod';
import { UserUuidSchema } from './user.js';

// Внешний идентификатор тега, branded — не пересекается по типу с UserUuid
export const TagUuidSchema = z.string().uuid().brand<'TagUuid'>();

export type TagUuid = z.infer<typeof TagUuidSchema>;

// Произвольное название тега для админа, не отображается пользователю
const TagLabelSchema = z.string().min(1).max(255);

// Тег — публичный контракт ответа API
export const TagSchema = z.object({
  uuid: TagUuidSchema,
  userUuid: UserUuidSchema,
  label: TagLabelSchema.nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Tag = z.infer<typeof TagSchema>;

export const TagListResponseSchema = z.array(TagSchema);

export type TagListResponse = z.infer<typeof TagListResponseSchema>;

// Создание дополнительного тега для существующего пользователя. userUuid обязателен и типизирован как UserUuid, не raw string — нельзя по ошибке передать TagUuid на месте владельца
export const CreateTagPayloadSchema = z.object({
  userUuid: UserUuidSchema,
  label: TagLabelSchema.optional(),
});

export type CreateTagPayload = z.infer<typeof CreateTagPayloadSchema>;

// Обновление тега — деактивация и/или переименование, минимум одно поле обязательно
export const UpdateTagPayloadSchema = z.object({
  isActive: z.boolean().optional(),
  label: TagLabelSchema.nullable().optional(),
}).refine(
  (data) => data.isActive !== undefined || data.label !== undefined,
  {
    message: 'At least one field must be provided',
  },
);

export type UpdateTagPayload = z.infer<typeof UpdateTagPayloadSchema>;

// Параметр маршрута :tagUuid
export const TagUuidParamSchema = z.object({
  tagUuid: TagUuidSchema,
});

export type TagUuidParam = z.infer<typeof TagUuidParamSchema>;