import {
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from 'drizzle-orm';
import { pino } from 'pino';
import { TagConstantsValuesSchema } from '@cpmind/shared';
import type {
  TagConstantsConfigId,
  TagConstantsValues,
  TagConstantsConfig,
  TagConstantsDeactivationBlock,
  CreateTagConstantsPayload,
} from '@cpmind/shared';
import { db } from '../../db/index.js';
import {
  placements,
  tagConstantsConfigs,
  type TagConstantsConfigSelect,
} from '../../db/schema.js';
import { buildTagArtifact, removeTagArtifact } from './tag_builder.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  name: 'tag-constants',
});

// Сериализует смену версии по умолчанию и деактивацию: инвариант «ровно одна активная
// версия по умолчанию» не нарушается параллельными операциями администраторов
const TAG_CONSTANTS_LOCK_KEY = 7_300_421_001;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTransaction = typeof db | Transaction;

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

// Причины недоступности констант для доставки — фиксируются в логе embed/VAST
export type DeliveryTagConstantsFailure =
  | 'NO_DEFAULT_TAG_CONSTANTS'
  | 'DEFAULT_TAG_CONSTANTS_INACTIVE'
  | 'PINNED_TAG_CONSTANTS_NOT_FOUND'
  | 'PINNED_TAG_CONSTANTS_INACTIVE'
  | 'TAG_CONSTANTS_INVALID';

export type DeliveryTagConstantsResolution =
  | {
    kind: 'resolved';
    version: string;
    constants: TagConstantsValues;
    source: 'pinned' | 'default';
  }
  | {
    kind: 'unavailable';
    reason: DeliveryTagConstantsFailure;
    version: string | null;
  };

export interface TagConstantsVersionResolution {
  presenceIdleThresholdMs: number;
  isActive: boolean;
}

function resolveDeactivationBlock(
  row: TagConstantsConfigSelect,
  pinnedCount: number,
): TagConstantsDeactivationBlock | null {
  if (!row.isActive) return null;
  if (row.isDefault) return 'DEFAULT_VERSION';
  if (pinnedCount > 0) return 'PINNED_BY_PLACEMENTS';
  return null;
}

function toApiConfig(
  row: TagConstantsConfigSelect,
  pinnedCount: number,
): TagConstantsConfig {
  return {
    id: row.id as TagConstantsConfigId,
    version: row.version,
    constants: row.constants as TagConstantsValues,
    description: row.description,
    isActive: row.isActive,
    isDefault: row.isDefault,
    pinnedPlacementsCount: pinnedCount,
    deactivationBlockedReason: resolveDeactivationBlock(row, pinnedCount),
    scriptPath: row.scriptPath ?? '',
    fileSizeBytes: row.fileSizeBytes ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

// Число плейсментов с закреплённой версией. configIds = null — по всем версиям
async function loadPinnedCounts(
  executor: DbOrTransaction,
  configIds: string[] | null,
): Promise<Map<string, number>> {
  const rows = await executor
    .select({
      configId: placements.tagConstantsConfigId,
      pinned: count(),
    })
    .from(placements)
    .where(configIds === null
      ? isNotNull(placements.tagConstantsConfigId)
      : inArray(placements.tagConstantsConfigId, configIds))
    .groupBy(placements.tagConstantsConfigId);

  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.configId !== null) counts.set(row.configId, row.pinned);
  }

  return counts;
}

async function toApiConfigWithUsage(
  executor: DbOrTransaction,
  row: TagConstantsConfigSelect,
): Promise<TagConstantsConfig> {
  const counts = await loadPinnedCounts(executor, [row.id]);
  return toApiConfig(row, counts.get(row.id) ?? 0);
}

async function lockTagConstants(tx: Transaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${TAG_CONSTANTS_LOCK_KEY}::bigint)`);
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
// существовать в БД без соответствующего физического артефакта.
// Новая версия активна, но не становится версией по умолчанию — доставка не переключается
export async function createTagConstantsConfig(
  payload: CreateTagConstantsPayload,
  actorUserId: number | null,
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

    logger.info(
      {
        version,
        actorUserId,
      },
      'Tag constants version created',
    );

    return toApiConfig(updatedRow!, 0);
  } catch (err) {
    await db
      .delete(tagConstantsConfigs)
      .where(eq(tagConstantsConfigs.id, createdRow.id));

    logger.error(
      {
        err,
        version,
        actorUserId,
      },
      'Tag constants version creation failed — tag build error',
    );

    throw new TagConstantsServiceError(
      'Не удалось собрать файл тега для новой версии констант',
      500,
      'TAG_BUILD_FAILED',
    );
  }
}

export async function listTagConstantsConfigs(): Promise<TagConstantsConfig[]> {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(tagConstantsConfigs)
      .orderBy(desc(tagConstantsConfigs.createdAt)),
    loadPinnedCounts(db, null),
  ]);

  return rows.map((row) => toApiConfig(row, counts.get(row.id) ?? 0));
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

  return toApiConfigWithUsage(db, row);
}

// Реактивация пересобирает файл заново из уже сохраненных в БД constants —
// детерминированно восстанавливает тот же артефакт, что существовал до деактивации
export async function activateTagConstantsConfig(
  id: TagConstantsConfigId,
  actorUserId: number | null,
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

  logger.info(
    {
      version: row.version,
      actorUserId,
    },
    'Tag constants version activated',
  );

  return toApiConfigWithUsage(db, updatedRow!);
}

// Деактивация удаляет физический файл — новые загрузки страницы получат 404 на
// <script src>, /api/collect отклоняет новые показы с этой версией (см. routes/impressions.ts).
// Показы уже выданных ad-сессий принимаются в пределах окна приёма.
// Запрещена для версии по умолчанию и для версии, закреплённой за плейсментами:
// FOR UPDATE ожидает транзакции закрепления, которые держат FOR SHARE на этой версии
export async function deactivateTagConstantsConfig(
  id: TagConstantsConfigId,
  actorUserId: number | null,
): Promise<TagConstantsConfig> {
  const row = await db.transaction(async (tx) => {
    await lockTagConstants(tx);

    const [target] = await tx
      .select()
      .from(tagConstantsConfigs)
      .where(eq(tagConstantsConfigs.id, id))
      .for('update')
      .limit(1);

    if (!target) {
      throw new TagConstantsServiceError(
        'Версия констант тега не найдена',
        404,
        'TAG_CONSTANTS_NOT_FOUND',
      );
    }

    if (target.isDefault) {
      logger.warn(
        {
          version: target.version,
          actorUserId,
          reason: 'DEFAULT_VERSION',
        },
        'Tag constants deactivation refused',
      );

      throw new TagConstantsServiceError(
        'Нельзя деактивировать версию по умолчанию — сначала назначьте версией по умолчанию другую',
        409,
        'TAG_CONSTANTS_DEFAULT',
      );
    }

    const pinnedCount = (await loadPinnedCounts(tx, [target.id])).get(target.id) ?? 0;

    if (pinnedCount > 0) {
      logger.warn(
        {
          version: target.version,
          actorUserId,
          pinnedCount,
          reason: 'PINNED_BY_PLACEMENTS',
        },
        'Tag constants deactivation refused',
      );

      throw new TagConstantsServiceError(
        'Версия закреплена за плейсментами — сначала снимите закрепление',
        409,
        'TAG_CONSTANTS_PINNED',
      );
    }

    await removeTagArtifact(target.version);

    const [updatedRow] = await tx
      .update(tagConstantsConfigs)
      .set({
        isActive: false,
        scriptPath: null,
        fileSizeBytes: null,
      })
      .where(eq(tagConstantsConfigs.id, id))
      .returning();

    return updatedRow!;
  });

  logger.info(
    {
      version: row.version,
      actorUserId,
    },
    'Tag constants version deactivated',
  );

  return toApiConfig(row, 0);
}

// Назначает версию по умолчанию. Допустима только активная версия. Снятие признака
// с предыдущей версии и установка на новую выполняются атомарно
export async function setDefaultTagConstantsConfig(
  id: TagConstantsConfigId,
  actorUserId: number | null,
): Promise<TagConstantsConfig> {
  const result = await db.transaction(async (tx) => {
    await lockTagConstants(tx);

    const [target] = await tx
      .select()
      .from(tagConstantsConfigs)
      .where(eq(tagConstantsConfigs.id, id))
      .for('update')
      .limit(1);

    if (!target) {
      throw new TagConstantsServiceError(
        'Версия констант тега не найдена',
        404,
        'TAG_CONSTANTS_NOT_FOUND',
      );
    }

    if (!target.isActive) {
      throw new TagConstantsServiceError(
        'Версией по умолчанию может быть только активная версия',
        409,
        'TAG_CONSTANTS_INACTIVE',
      );
    }

    if (target.isDefault) {
      return {
        row: target,
        previousVersion: target.version,
      };
    }

    const [previous] = await tx
      .select({ version: tagConstantsConfigs.version })
      .from(tagConstantsConfigs)
      .where(eq(tagConstantsConfigs.isDefault, true))
      .limit(1);

    await tx
      .update(tagConstantsConfigs)
      .set({ isDefault: false })
      .where(eq(tagConstantsConfigs.isDefault, true));

    const [updatedRow] = await tx
      .update(tagConstantsConfigs)
      .set({ isDefault: true })
      .where(eq(tagConstantsConfigs.id, id))
      .returning();

    return {
      row: updatedRow!,
      previousVersion: previous?.version ?? null,
    };
  });

  if (result.previousVersion !== result.row.version) {
    logger.info(
      {
        version: result.row.version,
        previousVersion: result.previousVersion,
        actorUserId,
      },
      'Default tag constants version changed',
    );
  }

  return toApiConfigWithUsage(db, result.row);
}

// Резолв версии для /api/collect. Legacy-показ и показ без выданной версии требуют активной
// версии — то же по духу решение, что и для tag_uuid в resolveActiveTagOwner.
// allowInactive — версия выдана ad-сессии в пределах окна приёма: показ принимается после деактивации.
// Возвращает presence-порог именно той версии, которой собран показ (см. score.ts)
export async function resolveTagConstantsVersion(
  version: string,
  allowInactive: boolean,
): Promise<TagConstantsVersionResolution | null> {
  const [row] = await db
    .select({ isActive: tagConstantsConfigs.isActive, constants: tagConstantsConfigs.constants })
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.version, version))
    .limit(1);

  if (!row) return null;
  if (!row.isActive && !allowInactive) return null;

  const constants = row.constants as TagConstantsValues;

  return {
    presenceIdleThresholdMs: constants.PRESENCE_IDLE_TIMEOUT_MS,
    isActive: row.isActive,
  };
}

// Константы для выдачи SDK: закреплённая версия плейсмента, иначе версия по умолчанию.
// Значения проверяются схемой — неполная версия не должна попасть в браузер
export async function resolveDeliveryTagConstants(
  pinnedConfigId: string | null,
): Promise<DeliveryTagConstantsResolution> {
  const isPinned = pinnedConfigId !== null;

  const [row] = await db
    .select({
      version: tagConstantsConfigs.version,
      constants: tagConstantsConfigs.constants,
      isActive: tagConstantsConfigs.isActive,
    })
    .from(tagConstantsConfigs)
    .where(isPinned
      ? eq(tagConstantsConfigs.id, pinnedConfigId)
      : eq(tagConstantsConfigs.isDefault, true))
    .limit(1);

  if (!row) {
    return {
      kind: 'unavailable',
      reason: isPinned ? 'PINNED_TAG_CONSTANTS_NOT_FOUND' : 'NO_DEFAULT_TAG_CONSTANTS',
      version: null,
    };
  }

  if (!row.isActive) {
    return {
      kind: 'unavailable',
      reason: isPinned ? 'PINNED_TAG_CONSTANTS_INACTIVE' : 'DEFAULT_TAG_CONSTANTS_INACTIVE',
      version: row.version,
    };
  }

  const parsed = TagConstantsValuesSchema.safeParse(row.constants);

  if (!parsed.success) {
    return {
      kind: 'unavailable',
      reason: 'TAG_CONSTANTS_INVALID',
      version: row.version,
    };
  }

  return {
    kind: 'resolved',
    version: row.version,
    constants: parsed.data,
    source: isPinned ? 'pinned' : 'default',
  };
}