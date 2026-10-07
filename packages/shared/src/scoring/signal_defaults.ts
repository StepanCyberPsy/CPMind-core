// Weibull (S1)

export interface WeibullParams {
  k: number;
  lambda: number;
}

/**
 * Нейтральные параметры Weibull для fallback при отсутствии активной конфигурации сегмента.
 * k=1.0 вырождает Weibull в экспоненциальное распределение — наименее предвзятый prior.
 * λ=5.0 соответствует медиане ≈3.5 сек — разумное начальное приближение для рекламных показов.
 */
export const DEFAULT_WEIBULL_PARAMS: WeibullParams = {
  k: 1.0,
  lambda: 5.0,
};

// Quantile CDF (S2)

export interface S2Params {
  quantileLevels: number[];
  quantileValues: number[];
}

/**
 * Опорные квантили доли экрана для fallback при отсутствии активной конфигурации сегмента.
 * Значения подобраны из тождества 100 × p = sqrt(x) × 10, то есть x = 100 × p²:
 * до первой калибровки нормализация повторяет формулу, действовавшую до введения модели,
 * и исторические значения остаются сопоставимыми с новыми.
 * quantileLevels — вероятности по возрастанию, quantileValues — доля экрана в процентах
 * на тех же позициях, неубывающая.
 */
export const DEFAULT_S2_PARAMS: S2Params = {
  quantileLevels: [
    0.01,
    0.10,
    0.20,
    0.30,
    0.40,
    0.50,
    0.60,
    0.70,
    0.80,
    0.90,
    0.99
  ],
  quantileValues: [
    0.01,
    1,
    4,
    9,
    16,
    25,
    36,
    49,
    64,
    81,
    98.01
  ],
};

// Logistic (S3)

export interface LogisticParams {
  beta0: number;
  beta1: number;
  beta2: number;
  beta3: number;
  beta4: number;
  beta5: number;
  beta6: number;
  beta7: number;
  featureMeans: Record<string, number>;
  featureStds: Record<string, number>;
}

/**
 * Нейтральные параметры логистической регрессии для fallback при отсутствии активной конфигурации сегмента.
 * Все β=0: sigmoid(0)=0.5 → S3=50 для любого паттерна скролла.
 * featureMeans=0, featureStds=1: z-score является identity-трансформацией.
 */
export const DEFAULT_LOGISTIC_PARAMS: LogisticParams = {
  beta0: 0,
  beta1: 0,
  beta2: 0,
  beta3: 0,
  beta4: 0,
  beta5: 0,
  beta6: 0,
  beta7: 0,
  featureMeans: { speed: 0, stddev: 0, pause: 0, direction: 0, streak: 0 },
  featureStds: { speed: 1, stddev: 1, pause: 1, direction: 1, streak: 1 },
};

// S4Config (S4)

export interface S4Config {
  lambda: number;
  tRefMs: number;
}

/**
 * Дефолтные параметры штрафной функции S4 по сегментам device_type × creative_group.
 * λ — крутизна экспоненциального штрафа за переключения вкладок.
 * tRefMs — референсная длина «полноценной» сессии в мс (медиана по сегменту без переключений).
 * Источник: Grusky et al. (2017), Liu & Dumais (2010), Bruns et al. (2025).
 */
export const DEFAULT_S4_CONFIGS: Record<string, S4Config> = {
  desktop_banner: { lambda: 0.08, tRefMs: 5000 },
  mobile_banner: { lambda: 0.06, tRefMs: 3000 },
  desktop_video: { lambda: 0.10, tRefMs: 8000 },
  mobile_video: { lambda: 0.08, tRefMs: 5000 },
  default: { lambda: 0.08, tRefMs: 5000 },
};

// S5LogisticParams (S5)

export interface S5LogisticParams {
  segmentKey: 'desktop' | 'mobile_tablet';
  beta0: number;
  beta1: number;
  beta2: number;
  beta3: number;
  beta4: number;
}

/**
 * Экспертный стартовый prior для desktop до первой калибровки.
 * β1 (clicked) доминирует, β2 (hoverDuration) и β4 (proximity) усиливают сигнал.
 * Источник: §9, Joachims et al. (2005), Leiva & Arapakis (2020).
 */
export const DEFAULT_S5_DESKTOP: S5LogisticParams = {
  segmentKey: 'desktop',
  beta0: -2.5,
  beta1: 3.8,
  beta2: 2.2,
  beta3: 0.8,
  beta4: 1.5,
};

/**
 * Экспертный стартовый prior для mobile/tablet до первой калибровки.
 * β2 (zoom) выше β3 (tap) — zoom требует явного намерения, tap может быть случайным.
 * Источник: §9, §3.5.
 */
export const DEFAULT_S5_MOBILE_TABLET: S5LogisticParams = {
  segmentKey: 'mobile_tablet',
  beta0: -2.0,
  beta1: 3.5,
  beta2: 2.8,
  beta3: 1.2,
  beta4: 0.9,
};

// S6LogisticParams (S6)

/**
 * Параметры модели in-stream. Реклама стартует со звуком внутри контента, который
 * зритель смотрит намеренно: mutedThroughout означает заглушение зрителем,
 * отказ от показа выражается пропуском.
 */
export interface S6InstreamLogisticParams {
  mode: 'instream';
  beta0: number;
  beta1: number; // completionRate (z)
  beta2: number; // quartileReached (z)
  beta3: number; // audibleRatio (z)
  beta4: number; // mutedThroughout (0/1)
  beta5: number; // unmutedByUser (0/1)
  beta6: number; // replayCount log-z
  beta7: number; // skipped (0/1)
  beta8: number; // interaction: completionZ × audibleZ
  featureMeans: Record<string, number>;
  featureStds: Record<string, number>;
}

/**
 * Параметры модели out-stream. Реклама стартует без звука в потоке страницы:
 * mutedThroughout означает бездействие зрителя, unmutedByUser — явный интерес,
 * отказ от показа выражается закрытием поверхности. Кнопки пропуска нет.
 */
export interface S6OutstreamLogisticParams {
  mode: 'outstream';
  beta0: number;
  beta1: number; // completionRate (z)
  beta2: number; // quartileReached (z)
  beta3: number; // audibleRatio (z)
  beta4: number; // mutedThroughout (0/1)
  beta5: number; // unmutedByUser (0/1)
  beta6: number; // replayCount log-z
  beta7: number; // closedByUser (0/1)
  beta8: number; // interaction: completionZ × audibleZ
  featureMeans: Record<string, number>;
  featureStds: Record<string, number>;
}

/**
 * Параметры модели S6 любого режима. Поле mode различает структурно одинаковые наборы
 * коэффициентов: без него параметры out-stream подошли бы функции in-stream по типу,
 * и β7 читался бы как другой признак.
 */
export type S6LogisticParams =
  | S6InstreamLogisticParams
  | S6OutstreamLogisticParams;

/**
 * Нейтральные параметры логистической регрессии in-stream для fallback при отсутствии
 * активной конфигурации. Все β=0: sigmoid(0)=0.5 → S6=50 для любой комбинации признаков.
 * featureMeans=0, featureStds=1: z-score является identity-трансформацией.
 * Применяется также к показам legacy-тега: режим у них неизвестен, а признак пропуска
 * собирается, в отличие от признака закрытия поверхности.
 */
export const DEFAULT_S6_INSTREAM_LOGISTIC_PARAMS: S6InstreamLogisticParams = {
  mode: 'instream',
  beta0: 0,
  beta1: 0,
  beta2: 0,
  beta3: 0,
  beta4: 0,
  beta5: 0,
  beta6: 0,
  beta7: 0,
  beta8: 0,
  featureMeans: { completion: 0, quartile: 0, audible: 0, replay: 0 },
  featureStds: { completion: 1, quartile: 1, audible: 1, replay: 1 },
};

/**
 * Нейтральные параметры логистической регрессии out-stream для fallback при отсутствии
 * активной конфигурации. Все β=0: sigmoid(0)=0.5 → S6=50 для любой комбинации признаков.
 */
export const DEFAULT_S6_OUTSTREAM_LOGISTIC_PARAMS: S6OutstreamLogisticParams = {
  mode: 'outstream',
  beta0: 0,
  beta1: 0,
  beta2: 0,
  beta3: 0,
  beta4: 0,
  beta5: 0,
  beta6: 0,
  beta7: 0,
  beta8: 0,
  featureMeans: { completion: 0, quartile: 0, audible: 0, replay: 0 },
  featureStds: { completion: 1, quartile: 1, audible: 1, replay: 1 },
};

// S7Thresholds (S7)

export interface S7Thresholds {
  relativeYLow: number;  // ~p33 relativeY среди ATF-показов сегмента
  relativeYMid: number;  // ~p67 relativeY среди BTF-показов сегмента
  clutterMid: number;    // ~p50 competingAdsVisible сегмента
  clutterHigh: number;   // ~p80 competingAdsVisible сегмента
}

/**
 * Дефолтные квантильные пороги S7 по device_type до первой калибровки.
 * Хранятся как Record — резолвятся в s7_quantile_config.ts по device_type.
 * В normalize.ts, score.ts, routes/impressions.ts не импортируются напрямую:
 * только через getActiveS7Thresholds(deviceType) который инкапсулирует fallback-цепочку.
 *
 * Пороги подобраны консервативно относительно as-is формулы (§4.2):
 * убирают двойной счёт ATF+relativeY без резкой просадки скора при первой активации.
 * Источник: S7_Page_Context_master.md §7.2.
 */
export const DEFAULT_S7_THRESHOLDS: Record<'desktop' | 'mobile' | 'tablet', S7Thresholds> = {
  desktop: { relativeYLow: 0.20, relativeYMid: 0.55, clutterMid: 3, clutterHigh: 6 },
  mobile:  { relativeYLow: 0.15, relativeYMid: 0.45, clutterMid: 2, clutterHigh: 5 },
  tablet:  { relativeYLow: 0.18, relativeYMid: 0.50, clutterMid: 3, clutterHigh: 6 },
};