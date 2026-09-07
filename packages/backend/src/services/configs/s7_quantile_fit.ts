/**
 * Квантильная калибровка порогов S7 (Page Context).
 *
 * В отличие от S1 (Weibull MLE) и S3/S5/S6 (логистическая регрессия IRLS),
 * для S7 не решается оптимизационная задача — только прямой расчёт перцентилей
 * на эмпирическом распределении признаков.
 *
 * Обоснование: вес сигнала S7 = 0.05 — инвестиция в MLE-инфраструктуру
 * непропорциональна отдаче (S7_master §3.5, §11.1).
 *
 * Живёт в backend/services (не в shared) по той же логике что s4_fit.ts:
 * используется только backend-джобом, не требует переиспользования в shared.
 */

export interface S7RawObservation {
  relativeY: number;
  isAboveTheFold: boolean;
  competingAdsVisible: number;
}

export interface S7QuantileFitResult {
  deviceType: 'desktop' | 'mobile' | 'tablet';
  relativeYLow: number;
  relativeYMid: number;
  clutterMid: number;
  clutterHigh: number;
  sampleSize: number;
}

/**
 * Линейная интерполяция между двумя ближайшими элементами отсортированного массива.
 * Эквивалент PostgreSQL percentile_cont — стандартный метод непрерывного перцентиля.
 */
function percentileContinuous(sortedValues: number[], q: number): number {
  const n = sortedValues.length;
  if (n === 0) throw new Error('Empty array for percentile calculation');
  if (n === 1) return sortedValues[0]!;

  const h = (n - 1) * q;
  const lower = Math.floor(h);
  const upper = Math.ceil(h);

  if (lower === upper) return sortedValues[lower]!;

  const fraction = h - lower;
  return sortedValues[lower]! + fraction * (sortedValues[upper]! - sortedValues[lower]!);
}

/**
 * Вычисляет квантильные пороги S7 для одного сегмента device_type.
 *
 * relativeYLow = p33 relativeY среди ATF-показов (верхняя треть самых заметных позиций)
 * relativeYMid = p67 relativeY среди BTF-показов (нижняя треть менее заметных позиций)
 * clutterMid   = p50 competingAdsVisible (медиана замусоренности)
 * clutterHigh  = p80 competingAdsVisible (высокий уровень замусоренности)
 *
 * Fallback на общий relativeY если в сегменте нет ATF- или BTF-наблюдений.
 */
export function fitS7Quantiles(
  deviceType: 'desktop' | 'mobile' | 'tablet',
  observations: S7RawObservation[],
): S7QuantileFitResult {
  if (observations.length === 0) {
    throw new Error(`No observations for S7 quantile calibration (device_type=${deviceType})`);
  }

  const allRelativeY = observations
    .map((o) => o.relativeY)
    .sort((a, b) => a - b);

  const atfRelativeY = observations
    .filter((o) => o.isAboveTheFold)
    .map((o) => o.relativeY)
    .sort((a, b) => a - b);

  const btfRelativeY = observations
    .filter((o) => !o.isAboveTheFold)
    .map((o) => o.relativeY)
    .sort((a, b) => a - b);

  const clutterValues = observations
    .map((o) => o.competingAdsVisible)
    .sort((a, b) => a - b);

  const relativeYLow = atfRelativeY.length > 0
    ? percentileContinuous(atfRelativeY, 0.33)
    : percentileContinuous(allRelativeY, 0.33);

  const relativeYMid = btfRelativeY.length > 0
    ? percentileContinuous(btfRelativeY, 0.67)
    : percentileContinuous(allRelativeY, 0.67);

  const clutterMid = percentileContinuous(clutterValues, 0.50);
  const clutterHigh = percentileContinuous(clutterValues, 0.80);

  return {
    deviceType,
    relativeYLow,
    relativeYMid,
    clutterMid,
    clutterHigh,
    sampleSize: observations.length,
  };
}