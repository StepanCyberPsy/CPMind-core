import { eq, isNull, and } from 'drizzle-orm';
import {
  DEFAULT_TAG_CONSTANTS,
  DEFAULT_WEIBULL_PARAMS,
  DEFAULT_LOGISTIC_PARAMS,
  DEFAULT_S4_CONFIGS,
  DEFAULT_S5_DESKTOP, DEFAULT_S5_MOBILE_TABLET,
  DEFAULT_S6_LOGISTIC_PARAMS,
  DEFAULT_S7_THRESHOLDS,
} from '@cpmind/shared';
import { db } from '../db/index.js';
import {
  users,
  tags,
  impressions,
  tagConstantsConfigs,
  s1WeibullConfigs,
  s3LogisticConfigs,
  s4Configs,
  s5LogisticConfigs,
  s6LogisticConfigs,
  s7QuantileConfigs,
} from '../db/schema.js';
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

// Вставляет дефолтные конфиги S4 по всем сегментам если таблица пуста.
// Гарантирует что S4-нормализация работает из коробки без первой калибровки.
// Идемпотентно: при существующих записях ничего не делает
export async function bootstrapS4Default(): Promise<void> {
  const [existing] = await db
    .select({ id: s4Configs.id })
    .from(s4Configs)
    .limit(1);

  if (existing) return;

  const segments = [
    { segmentKey: 'desktop_banner', lambda: DEFAULT_S4_CONFIGS['desktop_banner']!.lambda, tRefMs: DEFAULT_S4_CONFIGS['desktop_banner']!.tRefMs },
    { segmentKey: 'mobile_banner', lambda: DEFAULT_S4_CONFIGS['mobile_banner']!.lambda, tRefMs: DEFAULT_S4_CONFIGS['mobile_banner']!.tRefMs },
    { segmentKey: 'desktop_video', lambda: DEFAULT_S4_CONFIGS['desktop_video']!.lambda, tRefMs: DEFAULT_S4_CONFIGS['desktop_video']!.tRefMs },
    { segmentKey: 'mobile_video', lambda: DEFAULT_S4_CONFIGS['mobile_video']!.lambda, tRefMs: DEFAULT_S4_CONFIGS['mobile_video']!.tRefMs },
    { segmentKey: 'default', lambda: DEFAULT_S4_CONFIGS['default']!.lambda, tRefMs: DEFAULT_S4_CONFIGS['default']!.tRefMs },
  ];

  await db.insert(s4Configs).values(
    segments.map((s) => ({
      segmentKey: s.segmentKey,
      version: 'v1.0_uncalibrated',
      lambda: s.lambda,
      tRefMs: s.tRefMs,
      sampleSize: 0,
      isActive: true,
    })),
  );
}

// Вставляет дефолтные логистические конфиги S5 для desktop и mobile_tablet если таблица пуста.
// Гарантирует что S5-нормализация работает из коробки без первой калибровки.
// Идемпотентно: при существующих записях ничего не делает
export async function bootstrapS5Default(): Promise<void> {
  const [existing] = await db
    .select({ id: s5LogisticConfigs.id })
    .from(s5LogisticConfigs)
    .limit(1);

  if (existing) return;

  await db.insert(s5LogisticConfigs).values([
    {
      segmentKey: 'desktop',
      tagConstantsVersion: 'v0',
      coefficients: {
        beta0: DEFAULT_S5_DESKTOP.beta0,
        beta1: DEFAULT_S5_DESKTOP.beta1,
        beta2: DEFAULT_S5_DESKTOP.beta2,
        beta3: DEFAULT_S5_DESKTOP.beta3,
        beta4: DEFAULT_S5_DESKTOP.beta4,
      },
      sampleSize: 0,
      isActive: true,
    },
    {
      segmentKey: 'mobile_tablet',
      tagConstantsVersion: 'v0',
      coefficients: {
        beta0: DEFAULT_S5_MOBILE_TABLET.beta0,
        beta1: DEFAULT_S5_MOBILE_TABLET.beta1,
        beta2: DEFAULT_S5_MOBILE_TABLET.beta2,
        beta3: DEFAULT_S5_MOBILE_TABLET.beta3,
        beta4: DEFAULT_S5_MOBILE_TABLET.beta4,
      },
      sampleSize: 0,
      isActive: true,
    },
  ]);
}

// Вставляет дефолтные логистические конфиги S6 для всех 6 сегментов если таблица пуста.
// Гарантирует что S6-нормализация работает из коробки для video_creative без первой калибровки.
// Для баннеров S6=null вне зависимости от конфигов — bootstrap не влияет на banner-показы.
// Идемпотентно: при существующих записях ничего не делает
export async function bootstrapS6Default(): Promise<void> {
  const [existing] = await db
    .select({ id: s6LogisticConfigs.id })
    .from(s6LogisticConfigs)
    .limit(1);

  if (existing) return;

  const segments = [
    'desktop|skippable',
    'desktop|non_skippable',
    'mobile|skippable',
    'mobile|non_skippable',
    'tablet|skippable',
    'tablet|non_skippable',
  ];

  await db.insert(s6LogisticConfigs).values(
    segments.map((segmentKey) => ({
      segmentKey,
      tagConstantsVersion: 'v0',
      coefficients: {
        beta0: DEFAULT_S6_LOGISTIC_PARAMS.beta0,
        beta1: DEFAULT_S6_LOGISTIC_PARAMS.beta1,
        beta2: DEFAULT_S6_LOGISTIC_PARAMS.beta2,
        beta3: DEFAULT_S6_LOGISTIC_PARAMS.beta3,
        beta4: DEFAULT_S6_LOGISTIC_PARAMS.beta4,
        beta5: DEFAULT_S6_LOGISTIC_PARAMS.beta5,
        beta6: DEFAULT_S6_LOGISTIC_PARAMS.beta6,
        beta7: DEFAULT_S6_LOGISTIC_PARAMS.beta7,
        beta8: DEFAULT_S6_LOGISTIC_PARAMS.beta8,
      },
      featureMeans: DEFAULT_S6_LOGISTIC_PARAMS.featureMeans,
      featureStds: DEFAULT_S6_LOGISTIC_PARAMS.featureStds,
      sampleSize: 0,
      isActive: true,
    })),
  );
}

// Вставляет дефолтные квантильные конфиги S7 для desktop, mobile, tablet если таблица пуста.
// Гарантирует что S7-нормализация работает из коробки без первой калибровки.
// Идемпотентно: при существующих записях ничего не делает.
export async function bootstrapS7Default(): Promise<void> {
  const [existing] = await db
    .select({ id: s7QuantileConfigs.id })
    .from(s7QuantileConfigs)
    .limit(1);

  if (existing) return;

  const deviceTypes = ['desktop', 'mobile', 'tablet'] as const;

  await db.insert(s7QuantileConfigs).values(
    deviceTypes.map((deviceType) => ({
      deviceType,
      relativeYLow: DEFAULT_S7_THRESHOLDS[deviceType].relativeYLow,
      relativeYMid: DEFAULT_S7_THRESHOLDS[deviceType].relativeYMid,
      clutterMid: DEFAULT_S7_THRESHOLDS[deviceType].clutterMid,
      clutterHigh: DEFAULT_S7_THRESHOLDS[deviceType].clutterHigh,
      sampleSize: 0,
      isActive: true,
    })),
  );
}