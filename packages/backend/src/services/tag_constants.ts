import { eq, desc, sql } from 'drizzle-orm';
import type {
  TagConstantsConfigId,
  TagConstantsValues,
  TagConstantsConfig,
  CreateTagConstantsPayload,
} from '@cpmind/shared';
import { db } from '../db/index.js';
import { tagConstantsConfigs } from '../db/schema.js';
import { buildTagArtifact, removeTagArtifact } from './tag_builder.js';

export class TagConstantsServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'TagConstantsServiceError';
  }
}

interface ConfigRow {
  id: string;
  version: string;
  constants: unknown;
  description: string | null;
  isActive: boolean;
  scriptPath: string | null;
  fileSizeBytes: number | null;
  createdAt: Date;
}

function toApiConfig(row: ConfigRow): TagConstantsConfig {
  return {
    id: row.id as TagConstantsConfigId,
    version: row.version,
    constants: row.constants as TagConstantsValues,
    description: row.description,
    isActive: row.isActive,
    scriptPath: row.scriptPath ?? '',
    fileSizeBytes: row.fileSizeBytes ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

// Следующее значение версии из общей последовательности. Возвращается как 'v0', 'v1'...
// nextval вызывается ровно один раз на создание — повторный вызов в той же транзакции
// дал бы другое число, поэтому версия резолвится один раз и передается дальше как значение
async function getNextVersion(): Promise<string> {
  const result = await db.execute<{ next_version: number }>(
    sql`SELECT nextval('tag_constants_version_seq') AS next_version`,
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error('Failed to obtain next tag constants version');
  }

  return `v${row.next_version}`;
}

// Создает новую неизменяемую версию констант и сразу собирает для нее файл.
// Откатывает запись в БД, если сборка esbuild провалилась — версия не должна
// существовать в БД без соответствующего физического артефакта
export async function createTagConstantsConfig(
  payload: CreateTagConstantsPayload,
): Promise<TagConstantsConfig> {
  const version = await getNextVersion();

  const [createdRow] = await db
    .insert(tagConstantsConfigs)
    .values({
      version,
      constants: payload.constants as unknown as Record<string, unknown>,
      description: payload.description ?? null,
      isActive: true,
    })
    .returning();

  if (!createdRow) {
    throw new Error('Failed to create tag constants config');
  }

  try {
    const artifact = await buildTagArtifact(version, payload.constants);

    const [updatedRow] = await db
      .update(tagConstantsConfigs)
      .set({
        scriptPath: artifact.scriptPath,
        fileSizeBytes: artifact.fileSizeBytes,
      })
      .where(eq(tagConstantsConfigs.id, createdRow.id))
      .returning();

    return toApiConfig(updatedRow!);
  } catch (err) {
    await db
      .delete(tagConstantsConfigs)
      .where(eq(tagConstantsConfigs.id, createdRow.id));

    throw new TagConstantsServiceError(
      'Не удалось собрать файл тега для новой версии констант',
      500,
      'TAG_BUILD_FAILED',
    );
  }
}

export async function listTagConstantsConfigs(): Promise<TagConstantsConfig[]> {
  const rows = await db
    .select()
    .from(tagConstantsConfigs)
    .orderBy(desc(tagConstantsConfigs.createdAt));

  return rows.map(toApiConfig);
}

export async function getTagConstantsConfig(
  id: TagConstantsConfigId,
): Promise<TagConstantsConfig | null> {
  const [row] = await db
    .select()
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.id, id))
    .limit(1);

  if (!row) return null;

  return toApiConfig(row);
}

// Реактивация пересобирает файл заново из уже сохраненных в БД constants —
// детерминированно восстанавливает тот же артефакт, что существовал до деактивации
export async function activateTagConstantsConfig(
  id: TagConstantsConfigId,
): Promise<TagConstantsConfig> {
  const [row] = await db
    .select()
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.id, id))
    .limit(1);

  if (!row) {
    throw new TagConstantsServiceError(
      'Версия констант тега не найдена',
      404,
      'TAG_CONSTANTS_NOT_FOUND',
    );
  }

  const artifact = await buildTagArtifact(row.version, row.constants as TagConstantsValues);

  const [updatedRow] = await db
    .update(tagConstantsConfigs)
    .set({
      isActive: true,
      scriptPath: artifact.scriptPath,
      fileSizeBytes: artifact.fileSizeBytes,
    })
    .where(eq(tagConstantsConfigs.id, id))
    .returning();

  return toApiConfig(updatedRow!);
}

// Деактивация удаляет физический файл — новые загрузки страницы получат 404 на
// <script src>, /api/collect жестко отклоняет любые показы с этой версией (см. routes/impressions.ts)
export async function deactivateTagConstantsConfig(
  id: TagConstantsConfigId,
): Promise<TagConstantsConfig> {
  const [row] = await db
    .select()
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.id, id))
    .limit(1);

  if (!row) {
    throw new TagConstantsServiceError(
      'Версия констант тега не найдена',
      404,
      'TAG_CONSTANTS_NOT_FOUND',
    );
  }

  await removeTagArtifact(row.version);

  const [updatedRow] = await db
    .update(tagConstantsConfigs)
    .set({
      isActive: false,
      scriptPath: null,
      fileSizeBytes: null,
    })
    .where(eq(tagConstantsConfigs.id, id))
    .returning();

  return toApiConfig(updatedRow!);
}

export interface ActiveTagConstantsResolution {
  presenceIdleThresholdMs: number;
}

// Резолв версии для /api/collect. Жесткий отказ при отсутствующей либо неактивной
// версии — то же по духу решение, что и для tag_uuid в resolveActiveTagOwner.
// Возвращает presence-порог именно той версии, которую заявил конкретный показ —
// полная синхронизация тега и backend по этому параметру (см. score.ts)
export async function resolveActiveTagConstantsVersion(
  version: string,
): Promise<ActiveTagConstantsResolution | null> {
  const [row] = await db
    .select({ isActive: tagConstantsConfigs.isActive, constants: tagConstantsConfigs.constants })
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.version, version))
    .limit(1);

  if (!row || !row.isActive) return null;

  const constants = row.constants as TagConstantsValues;

  return { presenceIdleThresholdMs: constants.PRESENCE_IDLE_TIMEOUT_MS };
}