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
import type {
  WeibullParams,
  LogisticParams,
  S4Config,
  S5LogisticParams,
  S6LogisticParams,
  S7Thresholds,
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
 * S2 = min(100, sqrt(share_of_screen_avg_pct) × 10)
 *
 * Контрольные значения (из ТЗ):
 *   5% -> ~22.4
 *   15% -> ~38.7
 *   25% -> 50
 *   50% -> ~70.7
 *   100% -> 100
 */

export function normalizeS2(s2: SignalsS2): number {
  return Math.min(100, Math.sqrt(s2.share_of_screen_avg_pct) * 10);
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

/**
 * S6 = min(100, P(engaged) × 100)
 * P(engaged) = sigmoid(β·x), признаки нормализованы z-score по сегменту.
 *
 * Feature vector:
 *   [intercept, completionZ, quartileZ, audibleZ, muted, unmuted, replayZ, skipped, completionZ×audibleZ]
 *
 * completionRate: числовой % если доступен, иначе ordinal-квартиль (fallback).
 * audibleRatio: audible_time_sec / duration_sec, 0 если duration недоступен.
 * replayLog: log(1 + replay_count) перед z-score.
 * Терм взаимодействия completionZ×audibleZ моделирует нелинейный эффект:
 *   "completion со звуком" vs "completion без звука" (§4.1, Audion 2025).
 *
 * Возвращает null для баннеров (s6 === null).
 * Источник: IAB/MRC Attention Guidelines (2025), Marketing Dive (2025), Audion (2025).
 */

export function normalizeS6(
  s6: SignalsS6 | null,
  params: S6LogisticParams,
): number | null {
  if (s6 === null) return null;

  const fm = params.featureMeans;
  const fs = params.featureStds;

  const completionRate = s6.completion_rate_pct ?? quartileOrdinal(s6);
  const quartile = quartileOrdinal(s6);
  const audibleRatio = s6.audible_time_sec !== null && s6.duration_sec !== null && s6.duration_sec > 0
    ? s6.audible_time_sec / s6.duration_sec
    : 0;
  const replayLog = Math.log(1 + s6.replay_count);

  const completionZ = fs['completion'] !== 0
    ? (completionRate - (fm['completion'] ?? 0)) / (fs['completion'] ?? 1)
    : 0;
  const quartileZ = fs['quartile'] !== 0
    ? (quartile - (fm['quartile'] ?? 0)) / (fs['quartile'] ?? 1)
    : 0;
  const audibleZ = fs['audible'] !== 0
    ? (audibleRatio - (fm['audible'] ?? 0)) / (fs['audible'] ?? 1)
    : 0;
  const replayZ = fs['replay'] !== 0
    ? (replayLog - (fm['replay'] ?? 0)) / (fs['replay'] ?? 1)
    : 0;

  const muted = s6.muted_throughout ? 1 : 0;
  const unmuted = s6.unmuted_by_user ? 1 : 0;
  const skipped = s6.skipped ? 1 : 0;

  const z =
    params.beta0 +
    params.beta1 * completionZ +
    params.beta2 * quartileZ +
    params.beta3 * audibleZ +
    params.beta4 * muted +
    params.beta5 * unmuted +
    params.beta6 * replayZ +
    params.beta7 * skipped +
    params.beta8 * (completionZ * audibleZ);

  const pEngaged = 1 / (1 + Math.exp(-z));
  return Math.min(100, pEngaged * 100);
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
  s3Params: LogisticParams,
  s4Config: S4Config,
  s5Params: S5LogisticParams,
  s6Params: S6LogisticParams,
  s7Thresholds: S7Thresholds,
): NormalizedSignals {
  return {
    s1: normalizeS1(payload.signals.s1, weibullParams),
    s2: normalizeS2(payload.signals.s2),
    s3: normalizeS3(payload.signals.s3, s3Params),
    s4: normalizeS4(payload.signals.s4, s4Config),
    s5: normalizeS5(payload.signals.s5, s5Params),
    s6: normalizeS6(payload.signals.s6 ?? null, s6Params),
    s7: normalizeS7(payload.signals.s7, payload.device_type, s7Thresholds),
  };
}