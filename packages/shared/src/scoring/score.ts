import type { ImpressionPayload } from '../schemas/impression.js';
import { applyAnomalyCapping } from './capping.js';
import {
  normalizeAll,
  getS5TopEventLabel,
  type NormalizedSignals,
} from './normalize.js';
import type {
    WeibullParams,
    LogisticParams,
    S4Config,
    S5LogisticParams,
    S6LogisticParams,
    S7Thresholds,
} from './signal_defaults.js';
import {
  computeEffectiveWeights,
  detectNullSignals,
  type WeightsConfig,
  type EffectiveWeights,
} from './weights.js';

export interface RecomputeScoreResult {
  score_final: number;
  effective_weights: EffectiveWeights;
}

export interface ScoreResult {
  normalized: NormalizedSignals;
  effective_weights: EffectiveWeights;
  f_presence: 0 | 1;
  score_final: number;
  weights_version: string;
  no_events: boolean;
  tab_mostly_hidden: boolean;
  anomaly_duration: boolean;
  is_suspicious: boolean;
  s1_raw_time_in_view: number;
  s2_raw_share_of_screen: number;
  s3_raw_scroll_speed: number | null;
  s4_raw_active_time_pct: number;
  s5_raw_top_event: string;
  s6_raw_completion_rate: number | null;
  s7_raw_persistence: number;
}

/**
 * Полный pipeline расчета CPMind Score:
 *   кэппинг -> нормализация -> F_Presence -> перераспределение весов -> Score -> флаги
 *
 * Единственная функция, которую вызывает backend (services/scoring.ts).
 * Все промежуточные функции — pure, без side effects.
 *
 * @param payload — raw ImpressionPayload от тега (не мутируется)
 * @param weights — активная или дефолтная конфигурация весов для категории креатива
 */

export function computeScore(
  payload: ImpressionPayload,
  weights: WeightsConfig,
  weibullParams: WeibullParams,
  s3Params: LogisticParams,
  s4Config: S4Config,
  s5Params: S5LogisticParams,
  s6Params: S6LogisticParams,
  s7Thresholds: S7Thresholds,
  presenceIdleThresholdMs: number,
): ScoreResult {

  // 1. Кэппинг аномалий (time_in_view_sec > 3600 до кэппинга)
  const { payload: capped, anomaly_duration } = applyAnomalyCapping(payload);

  // 2. Нормализация (S1 — Weibull CDF, S3 — логистика, S4 — нелинейная функция, S5 — логистика по device_type, S6 — логистика по device×skippable)
  const normalized = normalizeAll(
    capped,
    weibullParams,
    s3Params,
    s4Config,
    s5Params,
    s6Params,
    s7Thresholds,
  );

  // 3. Перераспределение весов: Null-сигнал (только S3 в MVP) -> его вес пропорционально переходит к остальным
  const nullSignals = detectNullSignals(normalized);
  const effective_weights = computeEffectiveWeights(nullSignals, weights);

  // 4. F_Presence мультипликатор presence_failed: ни одного события И последнее событие было > порога назад (порог из активной версии констант тега, см. tag_constants.ts) -> пользователь физически не у экрана -> импрешен невалиден -> Score = 0
  const presence = capped.presence;
  const presenceFailed = presence.time_since_last_event_ms > presenceIdleThresholdMs;
  const f_presence: 0 | 1 = presenceFailed ? 0 : 1;

  // 5. CPMind Score §4.8
  // Score = (S1×w1 + S2×w2 + S3×w3 + S4×w4 + S5×w5 + S6×w6 + S7×w7) × F_Presence
  // Null-сигналы: effective_weight = 0 -> (null ?? 0) × 0 = 0 — корректно
  // Диапазон: Si ∈ [0, 100], Σwi = 1.0 -> weightedSum ∈ [0, 100]
  // F_Presence ∈ {0, 1} -> score_final ∈ [0, 100]
  const weightedSum =
    normalized.s1 * effective_weights.s1 +
    normalized.s2 * effective_weights.s2 +
    (normalized.s3 ?? 0) * effective_weights.s3 +
    normalized.s4 * effective_weights.s4 +
    normalized.s5 * effective_weights.s5 +
    (normalized.s6 ?? 0) * effective_weights.s6 +
    normalized.s7 * effective_weights.s7;

  const score_final = weightedSum * f_presence;

  const no_events = capped.presence.events_count_during_impression === 0;

  // tab_mostly_hidden: вкладка неактивна более 80% времени показа ≡ (tab_active_time_ms / tab_total_time_ms) < 0.20
  const { tab_active_time_ms, tab_total_time_ms } = capped.signals.s4;
  const tab_mostly_hidden =
    tab_total_time_ms > 0
      ? (tab_active_time_ms / tab_total_time_ms) < 0.20
      : false;

  // is_suspicious: хотя бы один флаг true
  const is_suspicious = no_events || tab_mostly_hidden || anomaly_duration;

  // 7. Raw-поля для колонок таблицы
  const origS4 = payload.signals.s4;
  const s4_raw_active_time_pct =
    origS4.tab_total_time_ms > 0
      ? (origS4.tab_active_time_ms / origS4.tab_total_time_ms) * 100
      : 0;

  return {
    normalized,
    effective_weights,
    f_presence,
    score_final,
    weights_version: weights.version,

    no_events,
    tab_mostly_hidden,
    anomaly_duration,
    is_suspicious,

    s1_raw_time_in_view: payload.signals.s1.time_in_view_sec,
    s2_raw_share_of_screen: payload.signals.s2.share_of_screen_avg_pct,
    s3_raw_scroll_speed: payload.signals.s3?.scroll_speed_avg_px_s ?? null,
    s4_raw_active_time_pct,
    s5_raw_top_event: getS5TopEventLabel(payload.signals.s5),
    s6_raw_completion_rate: payload.signals.s6?.completion_rate_pct ?? null,
    s7_raw_persistence: payload.signals.s7.viewability_persistence_pct,
  };
}

/**
 * Пересчет CPMind Score на новых весах для уже существующего импрешена.
 * Используется только калибровкой (services/calibrations.ts) — берет уже
 * сохраненные normalized-значения и f_presence из БД, не трогает сырые
 * сигналы и не повторяет кэппинг/нормализацию: эти шаги не зависят от весов
 * и их результат не меняется при смене весов (см. computeScore §1–2).
 *
 * @param normalized — сохраненные signals_normalized импрешена (s3 может быть null — cross-domain iframe)
 * @param fPresence  — сохраненный f_presence импрешена, не пересчитывается
 * @param weights    — целевая конфигурация весов батча калибровки
 */
export function recomputeScoreFromNormalized(
  normalized: NormalizedSignals,
  fPresence: 0 | 1,
  fIvt: 0 | 1,
  weights: WeightsConfig,
): RecomputeScoreResult {
  const nullSignals = detectNullSignals(normalized);
  const effective_weights = computeEffectiveWeights(nullSignals, weights);

  const weightedSum =
    normalized.s1 * effective_weights.s1 +
    normalized.s2 * effective_weights.s2 +
    (normalized.s3 ?? 0) * effective_weights.s3 +
    normalized.s4 * effective_weights.s4 +
    normalized.s5 * effective_weights.s5 +
    (normalized.s6 ?? 0) * effective_weights.s6 +
    normalized.s7 * effective_weights.s7;

  return {
    score_final: weightedSum * fPresence * fIvt,
    effective_weights,
  };
}