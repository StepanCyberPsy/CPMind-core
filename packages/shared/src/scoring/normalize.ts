import type {
  SignalsS1,
  SignalsS2,
  SignalsS3,
  SignalsS4,
  SignalsS5,
  SignalsS6,
  SignalsS7,
  ImpressionPayload,
} from '../schemas/impression.js';
import {
  DEFAULT_S2_PARAMS,
  type WeibullParams,
  type S2Params,
  type LogisticParams,
  type S4Config,
  type S5LogisticParams,
  type S6LogisticParams,
  type S6InstreamLogisticParams,
  type S6OutstreamLogisticParams,
  type S7Thresholds,
} from './signal_defaults.js';

/**
 * S1 = min(100, CDF(t) × 100)
 * CDF(t) = 1 − exp(−(t / λ)^k)
 *
 * t — time_in_view_sec, прошедший фильтр порога видимости в теге.
 * k, λ — параметры активной Weibull-конфигурации сегмента device_type × creative_group.
 * Источник: Liu, C.; White, R. W.; Dumais, S. (2010). SIGIR'10. DOI: 10.1145/1835449.1835513.
 */
export function normalizeS1(
  s1: SignalsS1,
  weibullParams: WeibullParams,
): number {
  const t = s1.time_in_view_sec;
  const { k, lambda } = weibullParams;
  const cdf = 1 - Math.exp(-Math.pow(t / lambda, k));
  return Math.min(100, cdf * 100);
}

/**
 * Значение эмпирической функции распределения в точке по опорным квантилям сегмента.
 * Между соседними квантилями — линейная интерполяция, за крайними — продление к границам
 * диапазона доли экрана: ниже первого квантиля к нулю, выше последнего к ста процентам.
 * Совпадающие соседние значения означают вырожденный участок распределения — возвращается
 * верхний уровень, монотонность сохраняется.
 */
function interpolateCdf(
  value: number,
  levels: readonly number[],
  values: readonly number[],
): number {
  const lastIndex = levels.length - 1;
  const firstValue = values[0] ?? 0;
  const firstLevel = levels[0] ?? 0;
  const lastValue = values[lastIndex] ?? 100;
  const lastLevel = levels[lastIndex] ?? 1;

  if (value <= firstValue) {
    return firstValue <= 0 ? 0 : (value / firstValue) * firstLevel;
  }

  if (value >= lastValue) {
    return lastValue >= 100
      ? 1
      : lastLevel + ((value - lastValue) / (100 - lastValue)) * (1 - lastLevel);
  }

  for (let i = 1; i <= lastIndex; i++) {
    const upperValue = values[i] ?? 0;
    if (value > upperValue) continue;

    const lowerValue = values[i - 1] ?? 0;
    const lowerLevel = levels[i - 1] ?? 0;
    const upperLevel = levels[i] ?? 0;
    const span = upperValue - lowerValue;

    if (span <= 0) return upperLevel;

    return lowerLevel + ((value - lowerValue) / span) * (upperLevel - lowerLevel);
  }

  return lastLevel;
}

/**
 * S2 = 100 × F(share_of_screen_avg_pct)
 *
 * F — эмпирическая функция распределения доли экрана в сегменте device_type × creative_group,
 * заданная опорными квантилями активной конфигурации. Показ оценивается относительно
 * типичной экспозиции своего сегмента, а не по абсолютной величине: доля, высокая для
 * одного формата, может быть рядовой для другого.
 * Структурно непригодная конфигурация — меньше двух опорных точек либо несовпадающая
 * длина массивов — заменяется дефолтом: нормализация остаётся определённой на любом входе.
 * Источник: §4 ТЗ S2, аналог нормализации S1 через CDF времени в поле зрения.
 */

export function normalizeS2(
  s2: SignalsS2,
  params: S2Params,
): number {
  const usable =
    params.quantileLevels.length >= 2 &&
    params.quantileLevels.length === params.quantileValues.length;

  const cdf = usable
    ? interpolateCdf(s2.share_of_screen_avg_pct, params.quantileLevels, params.quantileValues)
    : interpolateCdf(
      s2.share_of_screen_avg_pct,
      DEFAULT_S2_PARAMS.quantileLevels,
      DEFAULT_S2_PARAMS.quantileValues,
    );

  return Math.max(0, Math.min(100, cdf * 100));
}

/**
 * Возвращает null если s3 === null (cross-domain iframe -> backend перераспределяет веса §6.2).
 * S3 = min(100, P(engaged) × 100), где P(engaged) = sigmoid(β·x_z).
 * Признаки нормируются z-score по featureMeans/featureStds активного сегмента.
 */

function zScore(
  value: number,
  mean: number,
  std: number,
): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

export function normalizeS3(
  s3: SignalsS3,
  params: LogisticParams,
): number | null {
  if (s3 === null) return null;

  const fm = params.featureMeans;
  const fs = params.featureStds;

  const speedZ = zScore(s3.scroll_speed_avg_px_s ?? 0, fm.speed ?? 0, fs.speed ?? 1);
  const stddevZ = zScore(s3.scroll_speed_std_dev ?? 0, fm.stddev ?? 0, fs.stddev ?? 1);
  const pauseZ = zScore(s3.pause_count ?? 0, fm.pause ?? 0, fs.pause ?? 1);
  const directionZ = zScore(s3.direction_changes ?? 0, fm.direction ?? 0, fs.direction ?? 1);
  const streakZ = zScore(s3.scroll_streaks ?? 0, fm.streak ?? 0, fs.streak ?? 1);
  const reading = s3.reading_pattern_detected === true ? 1 : 0;
  const momentum = s3.is_momentum_scroll === true ? 1 : 0;

  const z =
    params.beta0 +
    params.beta1 * speedZ +
    params.beta2 * stddevZ +
    params.beta3 * pauseZ +
    params.beta4 * directionZ +
    params.beta5 * streakZ +
    params.beta6 * reading +
    params.beta7 * momentum;

  const pEngaged = 1 / (1 + Math.exp(-z));
  return Math.min(100, pEngaged * 100);
}

/**
 * S4 = clamp(activeRatio × 100 × freqPenalty × durationFactor, 0, 100)
 *
 * freqPenalty    = exp(-λ × tabSwitchesCount)         ∈ (0, 1]
 * durationFactor = min(1, avgSessionMs / tRefMs)       ∈ [0, 1]
 * avgSessionMs   = tabActiveTimeMs / (tabSwitchesCount + 1)
 *
 * Guard: tabTotalTimeMs ≤ 0 → 0.
 * Guard: tRefMs ≤ 0 → durationFactor = 1 (штраф по длительности не применяется).
 * Источник: Grusky et al. (2017), Liu & Dumais (2010), Bruns et al. (2025).
 */

export function normalizeS4(
  s4: SignalsS4,
  config: S4Config,
): number {
  if (s4.tab_total_time_ms <= 0) return 0;

  const activeRatio = Math.min(1, Math.max(0,
    s4.tab_active_time_ms / s4.tab_total_time_ms,
  ));
  const sessionCount = Math.max(1, s4.tab_switches_count + 1);
  const avgSessionMs = s4.tab_active_time_ms / sessionCount;

  const freqPenalty = Math.exp(-config.lambda * s4.tab_switches_count);
  const durationFactor = config.tRefMs <= 0 ? 1 : Math.min(1, avgSessionMs / config.tRefMs);

  return Math.min(100, Math.max(0,
    Math.round(activeRatio * 100 * freqPenalty * durationFactor * 10) / 10,
  ));
}

function normDesktopFeatures(s5: SignalsS5): {
  hoverDurationNorm: number;
  hoverCountNorm: number;
  proximityNorm: number;
} {
  const hoverDurationNorm = Math.min(
    1,
    Math.log((s5.hover_duration_max_ms ?? 0) + 1) / Math.log(10001),
  );
  const hoverCountNorm = Math.min(s5.hover_count ?? 0, 10) / 10;
  const proximityNorm = s5.cursor_proximity_min_px !== null
    ? 1 - Math.min(s5.cursor_proximity_min_px, 200) / 200
    : 0;
  return { hoverDurationNorm, hoverCountNorm, proximityNorm };
}

function normMobileFeatures(s5: SignalsS5): {
  tapCountNorm: number;
  swipeCountNorm: number;
} {
  const tapCountNorm = Math.min(s5.tap_count ?? 0, 5) / 5;
  const swipeCountNorm = Math.min(s5.swipe_count ?? 0, 3) / 3;
  return { tapCountNorm, swipeCountNorm };
}

/**
 * S5 = min(100, round(P(engaged) × 100))
 * P(engaged) = sigmoid(β·x), признаки нормализованы по сегменту device_type.
 *
 * Desktop: x = [1, clicked, hoverDurationNorm, hoverCountNorm, proximityNorm]
 * Mobile/tablet: x = [1, clicked, zoom, tapCountNorm, swipeCountNorm]
 *
 * hoverDurationNorm = min(1, log(hoverMax+1) / log(10001)) — clamp защищает от выхода за [0,1].
 * proximityNorm инвертирована: меньше px → ближе курсор → выше значение.
 * Источник: Joachims et al. (2005), Leiva & Arapakis (2020).
 */

export function normalizeS5(
  s5: SignalsS5,
  params: S5LogisticParams,
): number {
  const clicked = s5.clicked ? 1 : 0;
  let z: number;

  if (params.segmentKey === 'desktop') {
    const f = normDesktopFeatures(s5);
    z =
      params.beta0 +
      params.beta1 * clicked +
      params.beta2 * f.hoverDurationNorm +
      params.beta3 * f.hoverCountNorm +
      params.beta4 * f.proximityNorm;
  } else {
    const f = normMobileFeatures(s5);
    const zoom = s5.zoom === true ? 1 : 0;
    z =
      params.beta0 +
      params.beta1 * clicked +
      params.beta2 * zoom +
      params.beta3 * f.tapCountNorm +
      params.beta4 * f.swipeCountNorm;
  }

  const pEngaged = 1 / (1 + Math.exp(-z));
  return Math.min(100, Math.round(pEngaged * 100));
}

/**
 * Текстовая метка наивысшего события
 */

export function getS5TopEventLabel(s5: SignalsS5): string {
  if (s5.clicked) return 'clicked';
  if (s5.zoom === true || (s5.swipe_count ?? 0) > 0) return 'zoom/swipe';

  const hoverMax = s5.hover_duration_max_ms ?? 0;

  if (hoverMax > 3000) return 'hover_3000ms+';
  if (hoverMax > 1000) return 'hover_1000ms';
  if (hoverMax > 500) return 'hover_500ms';
  if ((s5.tap_count ?? 0) > 0) return 'tap';
  if ((s5.hover_count ?? 0) > 0) return 'hover';
  if ((s5.cursor_proximity_min_px ?? Infinity) < 50) return 'proximity_50px';

  return 'none';
}

/**
 * Возвращает ordinal-квартиль как число: 100/75/50/25/10/0.
 * Используется как fallback для completionRate когда completion_rate_pct = null,
 * и как самостоятельный признак quartileReached в feature-векторе.
 */
function quartileOrdinal(s6: SignalsS6): number {
  if (s6.completion) return 100;
  if (s6.quartile_75) return 75;
  if (s6.quartile_50) return 50;
  if (s6.quartile_25) return 25;
  if (s6.play_initiated) return 10;
  return 0;
}

interface S6SharedFeatures {
  completionZ: number;
  quartileZ: number;
  audibleZ: number;
  replayZ: number;
  muted: number;
  unmuted: number;
}

/**
 * Признаки, общие для обеих моделей S6.
 *
 * completionRate: числовой % если доступен, иначе ordinal-квартиль (fallback).
 * audibleRatio: audible_time_sec / duration_sec, ограничено [0, 1] — поля капаются
 * независимо друг от друга, и повторное воспроизведение даёт отношение больше единицы.
 * replayLog: log(1 + replay_count) перед z-score.
 */
function buildS6SharedFeatures(
  s6: SignalsS6,
  featureMeans: Record<string, number>,
  featureStds: Record<string, number>,
): S6SharedFeatures {
  const fm = featureMeans;
  const fs = featureStds;

  const completionRate = s6.completion_rate_pct ?? quartileOrdinal(s6);
  const quartile = quartileOrdinal(s6);
  const audibleRatio = s6.duration_sec !== null && s6.duration_sec > 0
    ? Math.min(1, Math.max(0, s6.audible_time_sec / s6.duration_sec))
    : 0;
  const replayLog = Math.log(1 + s6.replay_count);

  return {
    completionZ: fs['completion'] !== 0
      ? (completionRate - (fm['completion'] ?? 0)) / (fs['completion'] ?? 1)
      : 0,
    quartileZ: fs['quartile'] !== 0
      ? (quartile - (fm['quartile'] ?? 0)) / (fs['quartile'] ?? 1)
      : 0,
    audibleZ: fs['audible'] !== 0
      ? (audibleRatio - (fm['audible'] ?? 0)) / (fs['audible'] ?? 1)
      : 0,
    replayZ: fs['replay'] !== 0
      ? (replayLog - (fm['replay'] ?? 0)) / (fs['replay'] ?? 1)
      : 0,
    muted: s6.muted_throughout ? 1 : 0,
    unmuted: s6.unmuted_by_user ? 1 : 0,
  };
}

function sigmoidToScore(z: number): number {
  const pEngaged = 1 / (1 + Math.exp(-z));
  return Math.min(100, pEngaged * 100);
}

/**
 * S6 in-stream = min(100, P(engaged) × 100)
 * P(engaged) = sigmoid(β·x), признаки нормализованы z-score по сегменту.
 *
 * Feature vector:
 *   [intercept, completionZ, quartileZ, audibleZ, muted, unmuted, replayZ, skipped, completionZ×audibleZ]
 *
 * Реклама стартует со звуком внутри контента: mutedThroughout означает заглушение
 * зрителем, отказ от показа выражается пропуском.
 * Терм взаимодействия completionZ×audibleZ моделирует нелинейный эффект:
 *   "completion со звуком" vs "completion без звука" (§4.1, Audion 2025).
 * Источник: IAB/MRC Attention Guidelines (2025), Marketing Dive (2025), Audion (2025).
 */
export function normalizeS6Instream(
  s6: SignalsS6,
  params: S6InstreamLogisticParams,
): number {
  const f = buildS6SharedFeatures(s6, params.featureMeans, params.featureStds);
  const skipped = s6.skipped ? 1 : 0;

  const z =
    params.beta0 +
    params.beta1 * f.completionZ +
    params.beta2 * f.quartileZ +
    params.beta3 * f.audibleZ +
    params.beta4 * f.muted +
    params.beta5 * f.unmuted +
    params.beta6 * f.replayZ +
    params.beta7 * skipped +
    params.beta8 * (f.completionZ * f.audibleZ);

  return sigmoidToScore(z);
}

/**
 * S6 out-stream = min(100, P(engaged) × 100)
 * P(engaged) = sigmoid(β·x), признаки нормализованы z-score по сегменту.
 *
 * Feature vector:
 *   [intercept, completionZ, quartileZ, audibleZ, muted, unmuted, replayZ, closed, completionZ×audibleZ]
 *
 * Реклама стартует без звука в потоке страницы: mutedThroughout означает бездействие
 * зрителя, unmutedByUser — явный интерес, отказ от показа выражается закрытием
 * поверхности. Кнопки пропуска нет, признак пропуска в модель не входит.
 * Бандлы, собранные до введения признака закрытия, его не отправляют — отсутствующее
 * значение читается как отсутствие действия.
 */
export function normalizeS6Outstream(
  s6: SignalsS6,
  params: S6OutstreamLogisticParams,
): number {
  const f = buildS6SharedFeatures(s6, params.featureMeans, params.featureStds);
  const closed = s6.closed_by_user === true ? 1 : 0;

  const z =
    params.beta0 +
    params.beta1 * f.completionZ +
    params.beta2 * f.quartileZ +
    params.beta3 * f.audibleZ +
    params.beta4 * f.muted +
    params.beta5 * f.unmuted +
    params.beta6 * f.replayZ +
    params.beta7 * closed +
    params.beta8 * (f.completionZ * f.audibleZ);

  return sigmoidToScore(z);
}

/**
 * Нормализация S6 по режиму активной конфигурации. Возвращает null для баннеров
 * (s6 === null) — вес сигнала перераспределяется между остальными.
 */
export function normalizeS6(
  s6: SignalsS6 | null,
  params: S6LogisticParams,
): number | null {
  if (s6 === null) return null;

  return params.mode === 'instream'
    ? normalizeS6Instream(s6, params)
    : normalizeS6Outstream(s6, params);
}

/**
 * S7 = clamp(positionScore + clutterPenalty + persistenceBonus, 0, 100)
 *
 * positionScore (устраняет двойной счёт ATF+relativeY из as-is формулы):
 *   is_above_the_fold = true:
 *     relativeY < relativeYLow -> 55
 *     иначе                   -> 45
 *   is_above_the_fold = false:
 *     relativeY < relativeYMid -> 30
 *     иначе                    -> 15
 *
 * clutterPenalty (по competing_ads_visible, пороги — квантили реального трафика):
 *   ≤ clutterMid  ->   0
 *   ≤ clutterHigh -> −12
 *   иначе         -> −25
 *
 * persistenceBonus (по viewability_persistence_pct):
 *   > 80% -> +5
 *   < 20% -> −5
 *   иначе ->  0
 *
 * Пороги relativeYLow/Mid, clutterMid/High специфичны для device_type,
 * резолвятся через getActiveS7Thresholds(deviceType) в routes/impressions.ts.
 * Источник: Nielsen Norman Group (ATF/BTF), Hammer et al. (ad clutter), S7_master §4.2.
 */
export function normalizeS7(
  s7: SignalsS7,
  deviceType: 'desktop' | 'mobile' | 'tablet',
  thresholds: S7Thresholds,
): number {
  const relativeY = s7.creative_position_y_px / s7.page_height_total_px;

  const positionScore = s7.is_above_the_fold
    ? (relativeY < thresholds.relativeYLow ? 55 : 45)
    : (relativeY < thresholds.relativeYMid ? 30 : 15);

  const clutter = s7.competing_ads_visible;
  const clutterPenalty =
    clutter <= thresholds.clutterMid ? 0 :
      clutter <= thresholds.clutterHigh ? -12 :
        -25;

  const persistence = s7.viewability_persistence_pct;
  const persistenceBonus =
    persistence > 80 ? 5 :
      persistence < 20 ? -5 :
        0;

  return Math.max(0, Math.min(100,
    positionScore + clutterPenalty + persistenceBonus,
  ));
}

export interface NormalizedSignals {
  s1: number;
  s2: number;
  s3: number | null;
  s4: number;
  s5: number;
  s6: number | null;
  s7: number;
}

export function normalizeAll(
  payload: ImpressionPayload,
  weibullParams: WeibullParams,
  s2Params: S2Params,
  s3Params: LogisticParams,
  s4Config: S4Config,
  s5Params: S5LogisticParams,
  s6Params: S6LogisticParams,
  s7Thresholds: S7Thresholds,
): NormalizedSignals {
  return {
    s1: normalizeS1(payload.signals.s1, weibullParams),
    s2: normalizeS2(payload.signals.s2, s2Params),
    s3: normalizeS3(payload.signals.s3, s3Params),
    s4: normalizeS4(payload.signals.s4, s4Config),
    s5: normalizeS5(payload.signals.s5, s5Params),
    s6: normalizeS6(payload.signals.s6 ?? null, s6Params),
    s7: normalizeS7(payload.signals.s7, payload.device_type, s7Thresholds),
  };
}