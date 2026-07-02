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

/**
 * S1 = min(100, ln(t + 1)/ln(11) × 100)
 *
 * Контрольные значения (из ТЗ):
 *   0 сек -> 0
 *   1 сек -> ~30.1
 *   3 сек -> ~57.9
 *   5 сек -> ~74.9
 *   10 сек -> 100
 */

export function normalizeS1(s1: SignalsS1): number {
  return Math.min(100, (Math.log(s1.time_in_view_sec + 1) / Math.log(11)) * 100);
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
 *
 * Специальный случай из ТЗ §4.3:
 *   scroll_speed_avg_px_s === 0 (нет скролла в зоне) -> base_speed_score = 55, НЕ 0.
 *
 * Формула:
 *   base_speed_score:
 *     null или 0 -> 55  (нет скролла / не измерили)
 *     < 300 px/s -> 55
 *     300–800 px/s -> 30
 *     > 800 px/s -> 0
 *
 *   pause_bonus = min(25, pause_count × 10)
 *   return_bonus = min(20, direction_changes × 15)
 *   streak_penalty = min(20, scroll_streaks × 8)
 *   reading_bonus = 10 если reading_pattern_detected = true, иначе 0
 *
 *   S3 = max(0, min(100, base + pause + return + reading − streak))
 */

export function normalizeS3(s3: SignalsS3): number | null {
  if (s3 === null) return null;

  const speed = s3.scroll_speed_avg_px_s;

  const baseSpeedScore: number =
    speed === null || speed === 0 ? 55 :
      speed < 300 ? 55 :
        speed <= 800 ? 30 :
          0;

  const pauseBonus = Math.min(25, (s3.pause_count ?? 0) * 10);
  const returnBonus = Math.min(20, (s3.direction_changes ?? 0) * 15);
  const streakPenalty = Math.min(20, (s3.scroll_streaks ?? 0) * 8);
  const readingBonus = s3.reading_pattern_detected === true ? 10 : 0;

  return Math.max(0, Math.min(100,
    baseSpeedScore + pauseBonus + returnBonus + readingBonus - streakPenalty,
  ));
}

/**
 * S4 = (tab_active_time_ms / tab_total_time_ms) × 100
 *
 * Guard: tab_total_time_ms === 0 -> 0 (защита от деления на ноль).
 * Результат ограничен [0, 100].
 */

export function normalizeS4(s4: SignalsS4): number {
  if (s4.tab_total_time_ms === 0) return 0;
  return Math.min(100, Math.max(0,
    (s4.tab_active_time_ms / s4.tab_total_time_ms) * 100,
  ));
}

/**
 * S5 — берется наивысший достигнутый уровень (§4.5).
 *
 * Иерархия уровней (от высшего к низшему):
 *   clicked = true -> 100
 *   zoom = true ИЛИ swipe_count > 0 ->  90
 *   hover_duration_max_ms > 3000 ->  75
 *   hover_duration_max_ms 1000–3000 ->  50
 *   hover_duration_max_ms 500–1000 ->  30
 *   tap_count > 0 ->  25
 *   hover_count > 0 ->  15
 *   cursor_proximity_min_px < 50 ->   8
 *   ни одного события ->   0
 */

export function normalizeS5(s5: SignalsS5): number {
  if (s5.clicked) return 100;

  if (s5.zoom === true || (s5.swipe_count ?? 0) > 0) return 90;

  const hoverMax = s5.hover_duration_max_ms ?? 0;
  if (hoverMax > 3000) return 75;
  if (hoverMax > 1000) return 50;
  if (hoverMax > 500) return 30;

  if ((s5.tap_count ?? 0) > 0) return 25;

  if ((s5.hover_count ?? 0) > 0) return 15;

  if ((s5.cursor_proximity_min_px ?? Infinity) < 50) return 8;

  return 0;
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
 * Возвращает null если s6 === null (баннерный креатив без видео -> backend перераспределяет веса §6.2).
 *
 * base_score — иерархия наивысшего достигнутого уровня просмотра:
 *   completion              -> 85
 *   quartile_75             -> 75
 *   quartile_50             -> 55
 *   quartile_25             -> 35
 *   play_initiated (< 25%)  -> 15
 *   skipped                 -> 5
 *   нет взаимодействия      -> 0
 *
 * audibility_modifier (аддитивно):
 *   unmuted_by_user         -> +10
 *   muted_throughout        -> −15
 *   audible_quartile_50     -> +5
 *
 * replay_bonus = min(10, replay_count × 5)
 *
 * S6 = max(0, min(100, base_score + audibility_modifier + replay_bonus))
 */
export function normalizeS6(s6: SignalsS6 | null): number | null {
  if (s6 === null) return null;

  let baseScore: number;
  if (s6.completion) {
    baseScore = 85;
  } else if (s6.quartile_75) {
    baseScore = 75;
  } else if (s6.quartile_50) {
    baseScore = 55;
  } else if (s6.quartile_25) {
    baseScore = 35;
  } else if (s6.play_initiated) {
    baseScore = 15;
  } else if (s6.skipped) {
    baseScore = 5;
  } else {
    baseScore = 0;
  }

  let audibilityModifier = 0;
  if (s6.unmuted_by_user) audibilityModifier += 10;
  if (s6.muted_throughout) audibilityModifier -= 15;
  if (s6.audible_quartile_50) audibilityModifier += 5;

  const replayBonus = Math.min(10, s6.replay_count * 5);

  return Math.max(0, Math.min(100, baseScore + audibilityModifier + replayBonus));
}

/**
 * S7 = max(0, min(100, base_position + position_bonus + clutter_penalty + persistence_bonus))
 *
 * base_position_score:
 *   is_above_the_fold = true -> 60
 *   is_above_the_fold = false -> 30
 *
 * position_bonus (по относительной Y-позиции: creative_position_y_px / page_height_total_px):
 *   < 0.25 -> +20
 *   < 0.50 -> +10
 *   < 0.75 -> 0
 *   ≥ 0.75 -> −10
 *
 * clutter_penalty (по competing_ads_visible):
 *   ≤ 2 -> 0
 *   3–5 -> −10
 *   > 5 -> −20
 *
 * persistence_bonus (по viewability_persistence_pct):
 *   > 80% -> +5
 *   < 20% -> −5
 *   иначе ->  0
 */

export function normalizeS7(s7: SignalsS7): number {
  const base = s7.is_above_the_fold ? 60 : 30;

  const relativeY = s7.creative_position_y_px / s7.page_height_total_px;
  const positionBonus =
    relativeY < 0.25 ? 20 :
      relativeY < 0.50 ? 10 :
        relativeY < 0.75 ? 0 :
          -10;

  const clutter = s7.competing_ads_visible;
  const clutterPenalty =
    clutter <= 2 ? 0 :
      clutter <= 5 ? -10 :
        -20;

  const persistence = s7.viewability_persistence_pct;
  const persistenceBonus =
    persistence > 80 ? 5 :
      persistence < 20 ? -5 :
        0;

  return Math.max(0, Math.min(100,
    base + positionBonus + clutterPenalty + persistenceBonus,
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

export function normalizeAll(payload: ImpressionPayload): NormalizedSignals {
  return {
    s1: normalizeS1(payload.signals.s1),
    s2: normalizeS2(payload.signals.s2),
    s3: normalizeS3(payload.signals.s3),
    s4: normalizeS4(payload.signals.s4),
    s5: normalizeS5(payload.signals.s5),
    s6: normalizeS6(payload.signals.s6 ?? null),
    s7: normalizeS7(payload.signals.s7),
  };
}