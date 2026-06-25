import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import type { UserUuid, UserRole } from '@cpmind/shared';

const JWT_EXPIRY = '7d';

// Заглушка для constant-time сравнения при отсутствии логина в БД
// Не привязана к какому-либо реальному аккаунту, вычисляется один раз при старте процесса из случайного значения
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomUUID(), 10);

export interface JwtPayload {
  uuid: UserUuid;
  id: number;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  uuid: UserUuid;
  id: number;
  role: UserRole;
}

export async function verifyCredentials(
  login: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const [user] = await db
    .select({
      id: users.id,
      uuid: users.uuid,
      role: users.role,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.login, login))
    .limit(1);

  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !user.isActive || !passwordMatches) return null;

  return {
    uuid: user.uuid as UserUuid,
    id: user.id,
    role: user.role,
  };
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET env var not set');
  return secret;
}

export function signToken(payload: Pick<JwtPayload, 'uuid' | 'id' | 'role'>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}