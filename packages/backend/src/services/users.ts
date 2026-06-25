import bcrypt from 'bcryptjs';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { insertTagForUser } from './tags.js';
import type {
  User,
  UserUuid,
  UserRole,
  TagUuid,
  CreateUserPayload,
  UpdateUserPayload,
} from '@cpmind/shared';

const PASSWORD_HASH_ROUNDS = 10;
const UNIQUE_VIOLATION_CODE = '23505';

export class LoginAlreadyExistsError extends Error {
  constructor(login: string) {
    super(`Login already exists: ${login}`);
    this.name = 'LoginAlreadyExistsError';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}

interface UserRow {
  uuid: string;
  login: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

const USER_SELECT_COLUMNS = {
  id: users.id,
  uuid: users.uuid,
  login: users.login,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

function toApiUser(row: UserRow): User {
  return {
    uuid: row.uuid as UserUuid,
    login: row.login,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CreateUserResult {
  user: User;
  tagUuid: TagUuid;
}

// Создание пользователя и его единственного тега в одной транзакции. Гонка на уникальность логина закрыта на уровне unique-индекса, а не только предварительной проверкой
export async function createUser(
  payload: CreateUserPayload,
): Promise<CreateUserResult> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.login, payload.login))
    .limit(1);

  if (existing) {
    throw new LoginAlreadyExistsError(payload.login);
  }

  const passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);

  try {
    return await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          login: payload.login,
          passwordHash,
          role: payload.role,
        })
        .returning(USER_SELECT_COLUMNS);

      if (!createdUser) {
        throw new Error('Failed to create user');
      }

      const createdTag = await insertTagForUser(tx, createdUser.id, null);

      return {
        user: toApiUser(createdUser),
        tagUuid: createdTag.uuid as TagUuid,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new LoginAlreadyExistsError(payload.login);
    }
    throw err;
  }
}

// Полный список пользователей, без пагинации — кардинальность низкая (ручное создание администратором), сортировка по дате создания
export async function listUsers(): Promise<User[]> {
  const rows = await db
    .select(USER_SELECT_COLUMNS)
    .from(users)
    .orderBy(desc(users.createdAt));

  return rows.map(toApiUser);
}

// Деактивация и/или смена пароля. Возвращает null, если пользователь с таким uuid не найден — роут должен ответить 404
export async function updateUserByUuid(
  userUuid: UserUuid,
  payload: UpdateUserPayload,
): Promise<User | null> {
  const updateValues: Partial<typeof users.$inferInsert> = {};

  if (payload.isActive !== undefined) {
    updateValues.isActive = payload.isActive;
  }

  if (payload.password !== undefined) {
    updateValues.passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);
  }

  const [updatedUser] = await db
    .update(users)
    .set(updateValues)
    .where(eq(users.uuid, userUuid))
    .returning(USER_SELECT_COLUMNS);

  if (!updatedUser) return null;

  return toApiUser(updatedUser);
}