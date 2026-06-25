import { eq, isNull } from 'drizzle-orm';
import { DEFAULT_TAG_CONSTANTS } from '@cpmind/shared';
import { db } from '../db/index.js';
import { users, tags, impressions, tagConstantsConfigs } from '../db/schema.js';
import { createTagConstantsConfig } from './tag_constants.js';

const LEGACY_TAG_LABEL = 'legacy_default';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;
const LOGIN_PATTERN = /^[a-zA-Z0-9_.-]+$/;

interface BootstrapCredentials {
  login: string;
  passwordHash: string;
}

interface AdminBootstrapResult {
  userId: number;
  tagId: number;
}

function getBootstrapCredentials(): BootstrapCredentials {
  const login = process.env['ADMIN_LOGIN'];
  const passwordHash = process.env['ADMIN_PASSWORD_HASH'];

  if (!login || !passwordHash) {
    throw new Error('ADMIN_LOGIN or ADMIN_PASSWORD_HASH env vars not set');
  }

  if (!LOGIN_PATTERN.test(login)) {
    throw new Error('ADMIN_LOGIN env var contains invalid characters');
  }

  if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
    throw new Error('ADMIN_PASSWORD_HASH env var is not a valid bcrypt hash');
  }

  return { login, passwordHash };
}

async function ensureAdminUser(): Promise<AdminBootstrapResult> {
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);

  if (existingAdmin) {
    const [existingTag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.userId, existingAdmin.id))
      .limit(1);

    if (!existingTag) {
      throw new Error('Admin user exists without any tag — manual intervention required');
    }

    return { userId: existingAdmin.id, tagId: existingTag.id };
  }

  const { login, passwordHash } = getBootstrapCredentials();

  const [createdAdmin] = await db
    .insert(users)
    .values({
      login,
      passwordHash,
      role: 'admin',
    })
    .returning({ id: users.id });

  if (!createdAdmin) {
    throw new Error('Failed to create bootstrap admin user');
  }

  const [createdTag] = await db
    .insert(tags)
    .values({
      userId: createdAdmin.id,
      label: LEGACY_TAG_LABEL,
    })
    .returning({ id: tags.id });

  if (!createdTag) {
    throw new Error('Failed to create bootstrap admin tag');
  }

  return { userId: createdAdmin.id, tagId: createdTag.id };
}

async function backfillLegacyImpressions(
  adminUserId: number,
  adminTagId: number,
): Promise<void> {
  await db
    .update(impressions)
    .set({
      tagId: adminTagId,
      userId: adminUserId,
    })
    .where(isNull(impressions.tagId));
}

export async function bootstrapAdmin(): Promise<void> {
  const { userId, tagId } = await ensureAdminUser();
  await backfillLegacyImpressions(userId, tagId);
}

// Создает v0 с исходными хардкод-значениями при пустой таблице — гарантирует,
// что после деплоя версионирования всегда существует рабочая версия констант,
// идентичная по поведению уже размещенному у клиентов нативному тегу. Идемпотентно:
// при существующих записях ничего не делает, в т.ч. не пытается повторно собрать файл
export async function bootstrapTagConstants(): Promise<void> {
  const [existing] = await db
    .select({ id: tagConstantsConfigs.id })
    .from(tagConstantsConfigs)
    .limit(1);

  if (existing) return;

  await createTagConstantsConfig({
    constants: DEFAULT_TAG_CONSTANTS,
    description: 'Бутстрап-версия: значения, действовавшие до введения версионирования',
  });
}