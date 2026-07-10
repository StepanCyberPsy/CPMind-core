import type { IvtListEntry, IvtThresholds, IvtVerdict } from '../schemas/ivt.js';
import type { ImpressionPayload } from '../schemas/impression.js';

export interface IvtSignal {
  rule: string;
  confidence: number;
  detail?: string;
}

export interface IvtClassification {
  ivt_verdict: IvtVerdict;
  ivt_category: string | null;
  ivt_confidence: number;
  score_reliable: boolean;
  ivt_signals: IvtSignal[];
}

// Минимальное число интервалов для статистически значимого вывода о тайминге
const TIMING_MIN_SAMPLES = 10;

function stdDev(values: number[]): number {
  if (values.length < 2) return Infinity;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function matchesUaEntry(
  ua: string,
  entry: IvtListEntry & { type: 'ua' },
): boolean {
  switch (entry.match_type) {
    case 'exact':
      return ua === entry.pattern;
    case 'substring':
      return ua.toLowerCase().includes(entry.pattern.toLowerCase());
    case 'regex': {
      try {
        return new RegExp(entry.pattern, 'i').test(ua);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

// Проверка UA против списка — O(n) по числу UA-записей
function checkUaList(
  ua: string,
  entries: IvtListEntry[],
): IvtListEntry | null {
  for (const entry of entries) {
    if (entry.type !== 'ua') continue;
    if (matchesUaEntry(ua, entry as IvtListEntry & { type: 'ua' })) {
      return entry;
    }
  }
  return null;
}

// Правило 1 — Тайминговая регулярность
// std_dev интервалов между событиями presence ниже порога → роботизированный тайминг
function checkRoboticTiming(
  payload: ImpressionPayload,
  thresholds: IvtThresholds,
): IvtSignal | null {
  if (thresholds.timing_variance_min_ms === null) return null;

  const intervals = payload.presence.event_intervals_ms;
  if (!intervals || intervals.length < TIMING_MIN_SAMPLES) return null;

  const sd = stdDev(intervals);
  if (sd < thresholds.timing_variance_min_ms) {
    return {
      rule: 'robotic_timing',
      confidence: 0.7,
      detail: `std_dev=${sd.toFixed(2)}ms threshold=${thresholds.timing_variance_min_ms}ms`,
    };
  }

  return null;
}

// Правило 2 — Энтропия курсора
// cursor_trajectory_entropy ниже порога при наличии движений → синтетическое движение
function checkSyntheticCursor(
  payload: ImpressionPayload,
  thresholds: IvtThresholds,
): IvtSignal | null {
  if (thresholds.cursor_entropy_min === null) return null;

  const s5 = payload.signals.s5;
  const entropy = s5.cursor_trajectory_entropy;

  // Только desktop: на мобильном cursor_trajectory_entropy всегда null
  if (entropy === null) return null;

  // Движения должны быть зафиксированы — иначе нет основания для вывода
  const hasCursorMovement =
    (s5.hover_count !== null && s5.hover_count > 0) ||
    (s5.cursor_proximity_min_px !== null && s5.cursor_proximity_min_px < 9999);

  if (!hasCursorMovement) return null;

  if (entropy < thresholds.cursor_entropy_min) {
    return {
      rule: 'synthetic_cursor',
      confidence: 0.65,
      detail: `entropy=${entropy.toFixed(3)} threshold=${thresholds.cursor_entropy_min}`,
    };
  }

  return null;
}

// Правило 3 — Невозможные комбинации событий
// Клик без предшествующего hover/move или time_in_view > 0 при tab_active = 0
function checkImpossibleEvents(
  payload: ImpressionPayload,
  thresholds: IvtThresholds,
): IvtSignal | null {
  if (thresholds.click_without_hover === null || !thresholds.click_without_hover) return null;

  const s5 = payload.signals.s5;
  const s4 = payload.signals.s4;
  const s1 = payload.signals.s1;

  // Клик без предшествующего hover/move — физически невозможно на desktop
  const clickWithoutHover =
    s5.clicked &&
    payload.device_type !== 'mobile' &&
    payload.device_type !== 'tablet' &&
    (s5.hover_count === null || s5.hover_count === 0) &&
    (s5.cursor_proximity_min_px === null || s5.cursor_proximity_min_px > 200);

  // time_in_view > 3s при полностью неактивной вкладке.
  // Порог 3s исключает ложные срабатывания на первый рендер:
  // IntersectionObserver в некоторых движках фиксирует пересечение
  // при первом рендере даже при document.hidden=true (аудит §3.3).
  const viewWithoutActiveTab =
    s1.time_in_view_sec > 3 &&
    s4.tab_active_time_ms === 0 &&
    s4.tab_total_time_ms > 1000;

  if (clickWithoutHover || viewWithoutActiveTab) {
    const details: string[] = [];
    if (clickWithoutHover) details.push('click_without_hover');
    if (viewWithoutActiveTab) details.push('view_without_active_tab');

    return {
      rule: 'impossible_event_sequence',
      confidence: 0.9,
      detail: details.join(', '),
    };
  }

  return null;
}

// Агрегация уверенности из набора сработавших сигналов.
// Используем вероятностное объединение вместо суммы — исключает выход за [0,1]
// при нескольких сигналах: P(A∪B) = 1 − (1−P(A)) × (1−P(B))
function aggregateConfidence(signals: IvtSignal[]): number {
  if (signals.length === 0) return 0;
  return signals.reduce((acc, s) => 1 - (1 - acc) * (1 - s.confidence), 0);
}

/**
 * Синхронная классификация IVT-вердикта для одного показа.
 * Вызывается в pipeline collect после нормализации и скоринга (шаг 8.5).
 * Pure function — не обращается к БД, не имеет side effects.
 *
 * @param payload         — валидированный ImpressionPayload от тега
 * @param activeEntries   — in-memory записи активной версии ivt_list_configs (null = список не загружен)
 * @param thresholds      — активные пороги ivt_thresholds_configs (null = пороги не настроены)
 * @param userAgent       — User-Agent из заголовка запроса (для UA-матчинга по списку)
 */
export function classifyIvtSync(
  payload: ImpressionPayload,
  activeEntries: IvtListEntry[] | null,
  thresholds: IvtThresholds | null,
  userAgent: string,
): IvtClassification {
  const signals: IvtSignal[] = [];

  // GIVT: проверка по UA-списку
  if (activeEntries !== null && userAgent.length > 0) {
    const matched = checkUaList(userAgent, activeEntries);
    if (matched !== null) {
      return {
        ivt_verdict: 'givt',
        ivt_category: matched.category,
        ivt_confidence: 1,
        score_reliable: false,
        ivt_signals: [{
          rule: 'ua_list_match',
          confidence: 1,
          detail: `pattern="${matched.pattern}" source=${matched.source ?? 'unknown'}`,
        }],
      };
    }
  }

  // SIVT: поведенческие правила (только при наличии настроенных порогов)
  if (thresholds !== null) {
    const timing = checkRoboticTiming(payload, thresholds);
    if (timing !== null) signals.push(timing);

    const cursor = checkSyntheticCursor(payload, thresholds);
    if (cursor !== null) signals.push(cursor);

    const impossible = checkImpossibleEvents(payload, thresholds);
    if (impossible !== null) signals.push(impossible);
  }

  if (signals.length === 0) {
    return {
      ivt_verdict: 'valid',
      ivt_category: null,
      ivt_confidence: 0,
      score_reliable: true,
      ivt_signals: [],
    };
  }

  const confidence = aggregateConfidence(signals);

  // Повышение до sivt_confirmed если суммарная уверенность достигает порога
  const confirmThreshold = thresholds?.confidence_confirm ?? 0.85;
  const verdict: IvtVerdict = confidence >= confirmThreshold
    ? 'sivt_confirmed'
    : 'sivt_suspected';

  return {
    ivt_verdict: verdict,
    ivt_category: signals[0]!.rule,
    ivt_confidence: confidence,
    score_reliable: false,
    ivt_signals: signals,
  };
}