import {
  eq,
  isNull,
  and,
  desc,
} from 'drizzle-orm';
import {
  DEFAULT_TAG_CONSTANTS,
  DEFAULT_WEIBULL_PARAMS,
  DEFAULT_S2_PARAMS,
  DEFAULT_LOGISTIC_PARAMS,
  DEFAULT_S4_CONFIGS,
  DEFAULT_S5_DESKTOP,
  DEFAULT_S5_MOBILE_TABLET,
  DEFAULT_S6_INSTREAM_LOGISTIC_PARAMS,
  DEFAULT_S6_OUTSTREAM_LOGISTIC_PARAMS,
  DEFAULT_S7_THRESHOLDS,
  DEFAULT_WEIGHTS_BY_CATEGORY,
  CREATIVE_CATEGORIES,
} from '@cpmind/shared';
import {
  S6_MODES,
  S6_PLACEMENT_GROUPS,
  buildS6SegmentKey,
  buildS6ModeSegmentKey,
  buildS6ModeGlobalSegmentKey,
} from '@cpmind/shared';
import type {
  DeviceType,
  TagConstantsConfigId,
  TagConstantsValues,
} from '@cpmind/shared';
import { db } from '../db/index.js';
import {
  users,
  tags,
  impressions,
  tagConstantsConfigs,
  weightConfigs,
  s1WeibullConfigs,
  s2Configs,
  s3LogisticConfigs,
  s4Configs,
  s5LogisticConfigs,
  s6LogisticConfigs,
  s7QuantileConfigs,
} from '../db/schema.js';
import {
  createTagConstantsConfig,
  setDefaultTagConstantsConfig,
} from './tag/tag_constants.js';
import { buildTagArtifact, hasTagArtifact } from './tag/tag_builder.js';

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

// Создает v0 с исходными хардкод-значениями при пустой таблице и назначает её версией
// по умолчанию — гарантирует, что после деплоя всегда существует рабочая версия констант,
// идентичная по поведению уже размещенному у клиентов нативному тегу. При существующих
// записях файл повторно не собирается; если версия по умолчанию отсутствует, ею становится
// последняя активная версия — восстановление после ручного вмешательства в БД
export async function bootstrapTagConstants(): Promise<void> {
  const [existing] = await db
    .select({ id: tagConstantsConfigs.id })
    .from(tagConstantsConfigs)
    .limit(1);

  if (!existing) {
    const created = await createTagConstantsConfig(
      {
        constants: DEFAULT_TAG_CONSTANTS,
        description: 'Бутстрап-версия: значения, действовавшие до введения версионирования',
      },
      null,
    );

    await setDefaultTagConstantsConfig(created.id, null);
    return;
  }

  const [defaultRow] = await db
    .select({ id: tagConstantsConfigs.id })
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.isDefault, true))
    .limit(1);

  if (defaultRow) return;

  const [latestActive] = await db
    .select({ id: tagConstantsConfigs.id })
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.isActive, true))
    .orderBy(desc(tagConstantsConfigs.createdAt))
    .limit(1);

  if (!latestActive) {
    throw new Error('No active tag constants version available to become the default version');
  }

  await setDefaultTagConstantsConfig(latestActive.id as TagConstantsConfigId, null);
}

// Восстанавливает физические артефакты активных версий тега. buildTagArtifact
// вызывается только по действию оператора (создание либо реактивация версии), поэтому
// при пересоздании volume tag_dist записи в БД остаются, а файлы исчезают навсегда —
// <script src> у издателей отдает 404. Сверка выполняется на старте и идемпотентна:
// существующие артефакты не пересобираются. Ошибка одной версии не прерывает остальные
export async function reconcileTagBundles(): Promise<void> {
  const rows = await db
    .select({
      id: tagConstantsConfigs.id,
      version: tagConstantsConfigs.version,
      constants: tagConstantsConfigs.constants,
    })
    .from(tagConstantsConfigs)
    .where(eq(tagConstantsConfigs.isActive, true));

  for (const row of rows) {
    if (await hasTagArtifact(row.version)) continue;

    try {
      const artifact = await buildTagArtifact(
        row.version,
        row.constants as TagConstantsValues,
      );

      await db
        .update(tagConstantsConfigs)
        .set({
          scriptPath: artifact.scriptPath,
          fileSizeBytes: artifact.fileSizeBytes,
        })
        .where(eq(tagConstantsConfigs.id, row.id));

      console.log(`[CPMind] Tag bundle rebuilt: ${row.version} (${artifact.fileSizeBytes} bytes)`);
    } catch (err) {
      console.error(`[CPMind] Tag bundle rebuild failed for ${row.version}:`, err);
    }
  }
}

// Сегменты, для которых в таблице уже есть запись в любом состоянии. Наличие проверяется
// по каждому сегменту отдельно: сегмент, добавленный в код позже, должен появиться и на
// инсталляции, где конфигурации созданы предыдущей версией. Сегмент с существующими
// черновиками не пересоздаётся — деактивированная оператором конфигурация не возвращается
function toSegmentSet(rows: readonly { segmentKey: string }[]): Set<string> {
  return new Set(rows.map((row) => row.segmentKey));
}

// Вставляет глобальный дефолтный конфиг Weibull (k=1.0, λ=5.0) если таблица пуста.
// Гарантирует что S1-нормализация работает из коробки без первой калибровки.
// Идемпотентно: при существующем global-конфиге ничего не делает
export async function bootstrapS1WeibullDefault(): Promise<void> {
  const [existing] = await db
    .select({ id: s1WeibullConfigs.id })
    .from(s1WeibullConfigs)
    .where(and(
      eq(s1WeibullConfigs.segmentKey, 'global'),
      eq(s1WeibullConfigs.isActive, true),
    ))
    .limit(1);

  if (existing) return;

  await db.insert(s1WeibullConfigs).values({
    segmentKey: 'global',
    k: DEFAULT_WEIBULL_PARAMS.k,
    lambda: DEFAULT_WEIBULL_PARAMS.lambda,
    sampleSize: 0,
    isActive: true,
  });
}

// Вставляет глобальный дефолтный конфиг квантилей S2 если активного global-конфига нет.
// Опорные значения дефолта повторяют формулу, действовавшую до введения модели, поэтому
// до первой калибровки нормализация не меняется, а исторические значения остаются
// сопоставимыми с новыми. Идемпотентно: при существующем global-конфиге ничего не делает
export async function bootstrapS2Default(): Promise<void> {
  const [existing] = await db
    .select({ id: s2Configs.id })
    .from(s2Configs)
    .where(and(
      eq(s2Configs.segmentKey, 'global'),
      eq(s2Configs.isActive, true),
    ))
    .limit(1);

  if (existing) return;

  await db.insert(s2Configs).values({
    segmentKey: 'global',
    quantileLevels: DEFAULT_S2_PARAMS.quantileLevels,
    quantileValues: DEFAULT_S2_PARAMS.quantileValues,
    sampleSize: 0,
    isActive: true,
  });
}

// Вставляет глобальный дефолтный логистический конфиг S3 (все β=0, sigmoid(0)=0.5 → S3=50)
// если таблица пуста. Гарантирует что S3-нормализация работает из коробки.
// Идемпотентно: при существующем global-конфиге ничего не делает
export async function bootstrapS3LogisticDefault(): Promise<void> {
  const [existing] = await db
    .select({ id: s3LogisticConfigs.id })
    .from(s3LogisticConfigs)
    .where(and(
      eq(s3LogisticConfigs.segmentKey, 'global'),
      eq(s3LogisticConfigs.isActive, true),
    ))
    .limit(1);

  if (existing) return;

  await db.insert(s3LogisticConfigs).values({
    segmentKey: 'global',
    tagConstantsVersion: 'v0',
    coefficients: {
      beta0: DEFAULT_LOGISTIC_PARAMS.beta0,
      beta1: DEFAULT_LOGISTIC_PARAMS.beta1,
      beta2: DEFAULT_LOGISTIC_PARAMS.beta2,
      beta3: DEFAULT_LOGISTIC_PARAMS.beta3,
      beta4: DEFAULT_LOGISTIC_PARAMS.beta4,
      beta5: DEFAULT_LOGISTIC_PARAMS.beta5,
      beta6: DEFAULT_LOGISTIC_PARAMS.beta6,
      beta7: DEFAULT_LOGISTIC_PARAMS.beta7,
    },
    featureMeans: DEFAULT_LOGISTIC_PARAMS.featureMeans,
    featureStds: DEFAULT_LOGISTIC_PARAMS.featureStds,
    sampleSize: 0,
    isActive: true,
  });
}

// Вставляет дефолтные конфиги S4 для сегментов, которых ещё нет в таблице.
// Гарантирует что S4-нормализация работает из коробки без первой калибровки.
// Идемпотентно: существующие записи не изменяются, повторный вызов ничего не вставляет
export async function bootstrapS4Default(): Promise<void> {
  const present = toSegmentSet(
    await db
      .select({ segmentKey: s4Configs.segmentKey })
      .from(s4Configs),
  );

  const missing = Object.entries(DEFAULT_S4_CONFIGS)
    .filter(([segmentKey]) => !present.has(segmentKey));

  if (missing.length === 0) return;

  await db
    .insert(s4Configs)
    .values(missing.map(([segmentKey, config]) => ({
      segmentKey,
      version: 'v0',
      lambda: config.lambda,
      tRefMs: config.tRefMs,
      sampleSize: 0,
      isActive: true,
    })))
    .onConflictDoNothing();
}

// Вставляет дефолтные логистические конфиги S5 для сегментов, которых ещё нет в таблице.
// Гарантирует что S5-нормализация работает из коробки без первой калибровки.
// Идемпотентно: существующие записи не изменяются, повторный вызов ничего не вставляет
export async function bootstrapS5Default(): Promise<void> {
  const seeds = [
    DEFAULT_S5_DESKTOP,
    DEFAULT_S5_MOBILE_TABLET,
  ];

  const present = toSegmentSet(
    await db
      .select({ segmentKey: s5LogisticConfigs.segmentKey })
      .from(s5LogisticConfigs),
  );

  const missing = seeds.filter((params) => !present.has(params.segmentKey));

  if (missing.length === 0) return;

  await db
    .insert(s5LogisticConfigs)
    .values(missing.map((params) => ({
      segmentKey: params.segmentKey,
      tagConstantsVersion: 'v0',
      coefficients: {
        beta0: params.beta0,
        beta1: params.beta1,
        beta2: params.beta2,
        beta3: params.beta3,
        beta4: params.beta4,
      },
      sampleSize: 0,
      isActive: true,
    })))
    .onConflictDoNothing();
}

// Нулевые коэффициенты режима. Ключ сегмента определяет режим: уровень без префикса —
// сегмент предыдущей схемы, у его показов собран признак пропуска, но не признак закрытия
function resolveS6SeedParams(
  segmentKey: string,
): typeof DEFAULT_S6_INSTREAM_LOGISTIC_PARAMS | typeof DEFAULT_S6_OUTSTREAM_LOGISTIC_PARAMS {
  return segmentKey.startsWith('outstream')
    ? DEFAULT_S6_OUTSTREAM_LOGISTIC_PARAMS
    : DEFAULT_S6_INSTREAM_LOGISTIC_PARAMS;
}

// Вставляет дефолтные логистические конфиги S6 для сегментов, которых ещё нет в таблице.
// Гарантирует что S6-нормализация работает из коробки для video_creative без первой калибровки.
// Для баннеров S6=null вне зависимости от конфигов — bootstrap не влияет на banner-показы.
// Идемпотентно: существующие записи не изменяются, повторный вызов ничего не вставляет
export async function bootstrapS6Default(): Promise<void> {
  const deviceTypes: DeviceType[] = [
    'desktop',
    'mobile',
    'tablet',
  ];

  // Уровни цепочки выбора модели: группа размещения, режим с устройством, режим целиком.
  // Последним уровнем идут сегменты предыдущей схемы — модели показов legacy-тега
  const segments: string[] = [];

  for (const deviceType of deviceTypes) {
    for (const group of S6_PLACEMENT_GROUPS) {
      segments.push(buildS6SegmentKey(deviceType, group));
    }

    for (const mode of S6_MODES) {
      segments.push(buildS6ModeSegmentKey(deviceType, mode));
    }

    segments.push(`${deviceType}|skippable`);
    segments.push(`${deviceType}|non_skippable`);
  }

  for (const mode of S6_MODES) {
    segments.push(buildS6ModeGlobalSegmentKey(mode));
  }

  const present = toSegmentSet(
    await db
      .select({ segmentKey: s6LogisticConfigs.segmentKey })
      .from(s6LogisticConfigs),
  );

  const missing = segments.filter((segmentKey) => !present.has(segmentKey));

  if (missing.length === 0) return;

  await db
    .insert(s6LogisticConfigs)
    .values(missing.map((segmentKey) => {
      const params = resolveS6SeedParams(segmentKey);

      return {
        segmentKey,
        tagConstantsVersion: 'v0',
        coefficients: {
          beta0: params.beta0,
          beta1: params.beta1,
          beta2: params.beta2,
          beta3: params.beta3,
          beta4: params.beta4,
          beta5: params.beta5,
          beta6: params.beta6,
          beta7: params.beta7,
          beta8: params.beta8,
        },
        featureMeans: params.featureMeans,
        featureStds: params.featureStds,
        sampleSize: 0,
        isActive: true,
      };
    }))
    .onConflictDoNothing();
}

// Вставляет дефолтные квантильные конфиги S7 для устройств, которых ещё нет в таблице.
// Гарантирует что S7-нормализация работает из коробки без первой калибровки.
// Сегмент global не создаётся: пороги специфичны для устройства, общего набора не существует,
// и запись global перехватывала бы ступень DEFAULT_S7_THRESHOLDS[deviceType]
// Идемпотентно: существующие записи не изменяются, повторный вызов ничего не вставляет
export async function bootstrapS7Default(): Promise<void> {
  const deviceTypes = ['desktop', 'mobile', 'tablet'] as const;

  const rows = await db
    .select({ deviceType: s7QuantileConfigs.deviceType })
    .from(s7QuantileConfigs);

  const present = new Set(rows.map((row) => row.deviceType));
  const missing = deviceTypes.filter((deviceType) => !present.has(deviceType));

  if (missing.length === 0) return;

  await db
    .insert(s7QuantileConfigs)
    .values(missing.map((deviceType) => ({
      deviceType,
      relativeYLow: DEFAULT_S7_THRESHOLDS[deviceType].relativeYLow,
      relativeYMid: DEFAULT_S7_THRESHOLDS[deviceType].relativeYMid,
      clutterMid: DEFAULT_S7_THRESHOLDS[deviceType].clutterMid,
      clutterHigh: DEFAULT_S7_THRESHOLDS[deviceType].clutterHigh,
      sampleSize: 0,
      isActive: true,
    })))
    .onConflictDoNothing();
}

// Описание профиля категории для записи, создаваемой при отсутствии активной
const WEIGHTS_DESCRIPTIONS: Readonly<Record<string, string>> = {
  banner: 'Стартовые экспертные веса для баннеров, не подтверждённые данными',
  video: 'Стартовые экспертные веса для видео, не подтверждённые данными',
  video_instream: 'Стартовые экспертные веса для in-stream видео, не подтверждённые данными',
  video_outstream: 'Стартовые экспертные веса для out-stream видео, не подтверждённые данными',
};

// Создаёт стартовый профиль каждой категории, у которой нет активной конфигурации.
// Проверка по категории, а не по непустоте таблицы: категория, добавленная позже,
// должна появиться и на инсталляции, где профили созданы предыдущей версией.
// Существующие записи не изменяются — версия профиля остаётся в weights_version
// исторических показов и в снимках калибровки
export async function bootstrapDefaultWeights(): Promise<void> {
  const rows = await db
    .select({ configType: weightConfigs.configType })
    .from(weightConfigs)
    .where(eq(weightConfigs.isActive, true));

  const present = new Set(rows.map((row) => row.configType));
  const missing = CREATIVE_CATEGORIES.filter((category) => !present.has(category));

  if (missing.length === 0) return;

  await db
    .insert(weightConfigs)
    .values(missing.map((category) => {
      const weights = DEFAULT_WEIGHTS_BY_CATEGORY[category];

      return {
        version: weights.version,
        configType: category,
        weights: {
          s1: weights.s1,
          s2: weights.s2,
          s3: weights.s3,
          s4: weights.s4,
          s5: weights.s5,
          s6: weights.s6,
          s7: weights.s7,
        } as unknown as Record<string, unknown>,
        description: WEIGHTS_DESCRIPTIONS[category] ?? null,
        isActive: true,
      };
    }))
    .onConflictDoNothing();
}