import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, tags } from '../db/schema.js';
import type {
  Tag,
  TagUuid,
  UserUuid,
  CreateTagPayload,
  UpdateTagPayload,
} from '@cpmind/shared';

// Тип транзакции выводится из сигнатуры db.transaction
// Единственный надежный способ получить тип tx без жесткой зависимости от внутренних типов drizzle-orm/node-postgres
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTransaction = typeof db | Transaction;

interface TagRow {
  uuid: string;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
}

const TAG_SELECT_COLUMNS = {
  uuid: tags.uuid,
  label: tags.label,
  isActive: tags.isActive,
  createdAt: tags.createdAt,
};

function toApiTag(row: TagRow, ownerUuid: UserUuid): Tag {
  return {
    uuid: row.uuid as TagUuid,
    userUuid: ownerUuid,
    label: row.label,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

// Низкоуровневая вставка тега. Принимает либо db, либо активную транзакцию — единственный источник истины для создания строки tags, используется и при автосоздании тега в createUser(), и при создании дополнительного тега ниже
export async function insertTagForUser(
  executor: DbOrTransaction,
  userId: number,
  label: string | null,
): Promise<{ id: number; uuid: string }> {
  const [createdTag] = await executor
    .insert(tags)
    .values({
      userId,
      label,
    })
    .returning({ id: tags.id, uuid: tags.uuid });

  if (!createdTag) {
    throw new Error('Failed to create tag');
  }

  return createdTag;
}

// Создание дополнительного тега для существующего пользователя. Возвращает null, если пользователь с таким uuid не найден — роут должен ответить 404
export async function createAdditionalTag(
  payload: CreateTagPayload,
): Promise<Tag | null> {
  const [targetUser] = await db
    .select({ id: users.id, uuid: users.uuid })
    .from(users)
    .where(eq(users.uuid, payload.userUuid))
    .limit(1);

  if (!targetUser) return null;

  const createdTag = await insertTagForUser(db, targetUser.id, payload.label ?? null);

  const [tagRow] = await db
    .select(TAG_SELECT_COLUMNS)
    .from(tags)
    .where(eq(tags.id, createdTag.id))
    .limit(1);

  if (!tagRow) {
    throw new Error('Failed to load created tag');
  }

  return toApiTag(tagRow, targetUser.uuid as UserUuid);
}

// Список всех тегов всех пользователей, доступен только администратору
export async function listAllTags(): Promise<Tag[]> {
  const rows = await db
    .select({
      uuid: tags.uuid,
      label: tags.label,
      isActive: tags.isActive,
      createdAt: tags.createdAt,
      ownerUuid: users.uuid,
    })
    .from(tags)
    .innerJoin(users, eq(tags.userId, users.id))
    .orderBy(desc(tags.createdAt));

  return rows.map((row) => toApiTag(row, row.ownerUuid as UserUuid));
}

// Список тегов текущего авторизованного пользователя. Владелец известен из контекста запроса (JWT), JOIN на users не требуется
export async function listMyTags(
  userId: number,
  ownerUuid: UserUuid,
): Promise<Tag[]> {
  const rows = await db
    .select(TAG_SELECT_COLUMNS)
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(desc(tags.createdAt));

  return rows.map((row) => toApiTag(row, ownerUuid));
}

export interface ActiveTagOwner {
  tagId: number;
  userId: number;
}

// Резолв владельца по tag_uuid для POST /api/collect. Тег должен быть активен, и его владелец должен быть активен — деактивация пользователя блокирует прием данных по всем его тегам без необходимости отдельно деактивировать каждый тег
export async function resolveActiveTagOwner(
  tagUuid: TagUuid,
): Promise<ActiveTagOwner | null> {
  const [row] = await db
    .select({ tagId: tags.id, userId: tags.userId })
    .from(tags)
    .innerJoin(users, eq(tags.userId, users.id))
    .where(and(
      eq(tags.uuid, tagUuid),
      eq(tags.isActive, true),
      eq(users.isActive, true),
    ))
    .limit(1);

  if (!row) return null;

  return row;
}

// Деактивация и/или переименование тега администратором. Возвращает null, если тег с таким uuid не найден
export async function updateTagByUuid(
  tagUuid: TagUuid,
  payload: UpdateTagPayload,
): Promise<Tag | null> {
  const updateValues: Partial<typeof tags.$inferInsert> = {};

  if (payload.isActive !== undefined) {
    updateValues.isActive = payload.isActive;
  }

  if (payload.label !== undefined) {
    updateValues.label = payload.label;
  }

  const [updatedTag] = await db
    .update(tags)
    .set(updateValues)
    .where(eq(tags.uuid, tagUuid))
    .returning({
      uuid: tags.uuid,
      label: tags.label,
      isActive: tags.isActive,
      createdAt: tags.createdAt,
      userId: tags.userId,
    });

  if (!updatedTag) return null;

  const [owner] = await db
    .select({ uuid: users.uuid })
    .from(users)
    .where(eq(users.id, updatedTag.userId))
    .limit(1);

  if (!owner) {
    throw new Error('Tag owner not found — data integrity violation');
  }

  return toApiTag(updatedTag, owner.uuid as UserUuid);
}