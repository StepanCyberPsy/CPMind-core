import { z } from 'zod';
import { UserUuidSchema, UserRoleSchema } from './user.js';

export const LoginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export type LoginPayload = z.infer<typeof LoginSchema>;

// Ответ GET /auth/me — минимальный набор для идентификации сессии на фронтенде, без passwordHash и внутреннего id
export const MePayloadSchema = z.object({
  uuid: UserUuidSchema,
  login: z.string(),
  role: UserRoleSchema,
});

export type MePayload = z.infer<typeof MePayloadSchema>;