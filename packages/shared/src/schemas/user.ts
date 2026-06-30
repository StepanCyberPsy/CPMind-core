import { z } from 'zod';

// Роль пользователя
export const UserRoleSchema = z.enum(['admin', 'user']);

export type UserRole = z.infer<typeof UserRoleSchema>;

// Внешний идентификатор пользователя, branded — не пересекается по типу с TagUuid
export const UserUuidSchema = z.string().uuid().brand<'UserUuid'>();

export type UserUuid = z.infer<typeof UserUuidSchema>;

// Пользователь — публичный контракт ответа API, без passwordHash и внутреннего id
export const UserSchema = z.object({
  uuid: UserUuidSchema,
  login: z.string(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type User = z.infer<typeof UserSchema>;

export const UserListResponseSchema = z.array(UserSchema);

export type UserListResponse = z.infer<typeof UserListResponseSchema>;

// Агрегированная статистика по пользователю для страницы выбора юзера
// campaignsCount/creativesCount — COUNT(DISTINCT campaign_id/creative_id) по impressions, impressionsCount — COUNT(*), avgScore — AVG(score_final), null при отсутствии импрешенов у пользователя
export const UserStatsRowSchema = UserSchema.extend({
  tagUuid: z.string().uuid().nullable(),
  campaignsCount: z.number().int().min(0),
  creativesCount: z.number().int().min(0),
  impressionsCount: z.number().int().min(0),
  avgScore: z.number().nullable(),
});

export type UserStatsRow = z.infer<typeof UserStatsRowSchema>;

export const UserStatsListResponseSchema = z.array(UserStatsRowSchema);

export type UserStatsListResponse = z.infer<typeof UserStatsListResponseSchema>;

// Агрегированная статистика по кампаниям текущего пользователя для user dashboard
export const UserCampaignStatsRowSchema = z.object({
  campaignId: z.string(),
  impressionsCount: z.number().int().min(0),
  creativesCount: z.number().int().min(0),
  avgScore: z.number().nullable(),
  desktopRatioPct: z.number().min(0).max(100),
  mobileRatioPct: z.number().min(0).max(100),
  tabletRatioPct: z.number().min(0).max(100),
  latestImpressionAt: z.string(),
});

export type UserCampaignStatsRow = z.infer<typeof UserCampaignStatsRowSchema>;

export const UserCampaignStatsListResponseSchema = z.array(UserCampaignStatsRowSchema);

export type UserCampaignStatsListResponse = z.infer<typeof UserCampaignStatsListResponseSchema>;

// Логин — ограниченный набор символов, исключает проблемы с URL-кодированием и отображением
const UserLoginInputSchema = z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/);

// Подсчет длины строки в байтах UTF-8 без зависимости от TextEncoder/Buffer — переносимо между Node и браузером независимо от lib в tsconfig
function getUtf8ByteLength(value: string): number {
  let length = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint <= 0x7f) length += 1;
    else if (codePoint <= 0x7ff) length += 2;
    else if (codePoint <= 0xffff) length += 3;
    else length += 4;
  }
  return length;
}

// Пароль задается администратором вручную. Ограничение по байтам UTF-8, не по символам — bcrypt обрезает по 72 байтам, кириллица и эмодзи многобайтовые
const UserPasswordInputSchema = z.string().min(12).refine(
  (password) => getUtf8ByteLength(password) <= 72,
  {
    message: 'Password must not exceed 72 bytes when UTF-8 encoded',
  },
);

// Создание пользователя администратором
export const CreateUserPayloadSchema = z.object({
  login: UserLoginInputSchema,
  password: UserPasswordInputSchema,
  role: UserRoleSchema.optional().default('user'),
});

export type CreateUserPayload = z.infer<typeof CreateUserPayloadSchema>;

// Обновление пользователя — деактивация и/или смена пароля, минимум одно поле обязательно
export const UpdateUserPayloadSchema = z.object({
  isActive: z.boolean().optional(),
  password: UserPasswordInputSchema.optional(),
}).refine(
  (data) => data.isActive !== undefined || data.password !== undefined,
  {
    message: 'At least one field must be provided',
  },
);

export type UpdateUserPayload = z.infer<typeof UpdateUserPayloadSchema>;

// Параметр маршрута :userUuid
export const UserUuidParamSchema = z.object({
  userUuid: UserUuidSchema,
});

export type UserUuidParam = z.infer<typeof UserUuidParamSchema>;