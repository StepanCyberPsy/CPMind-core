/**
 * Стартовые веса MVP — v1.0_uncalibrated.
 * Заведомо неточны до ручной калибровки командой CPMind по CSV-экспорту.
 * Меняются правкой конфигурационного файла на backend (не через UI в MVP).
 *
 * Сумма весов = 1.00.
 */

export const DEFAULT_WEIGHTS = {
  version: 'v1.0_uncalibrated',
  s1: 0.30,
  s2: 0.20,
  s3: 0.15,
  s4: 0.15,
  s5: 0.15,
  s7: 0.05,
} as const;

export interface WeightsValues {
  version: string;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s7: number;
}

export type WeightsConfig = WeightsValues;
export type SignalKey = 's1' | 's2' | 's3' | 's4' | 's5' | 's7';

/**
 * Эффективные веса после перераспределения null-сигналов.
 * Все поля всегда числа — null-сигналы получают вес 0.
 */

export interface EffectiveWeights {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s7: number;
}

/**
 * Вычисляет эффективные веса с учетом недоступных (null) сигналов §6.2.
 *
 * Алгоритм:
 *   1. Определяем множество доступных сигналов (все кроме nullSignals).
 *   2. Суммируем их базовые веса -> availableSum.
 *   3. Если availableSum === 0 (все сигналы null) -> все веса 0, score будет 0.
 *   4. Каждый доступный сигнал получает вес: baseWeight / availableSum.
 *   5. Null-сигналы получают вес 0.
 *
 * Пример из ТЗ §6.2:
 *   S3 = null, остальные доступны.
 *   availableSum = 0.30 + 0.20 + 0.15 + 0.15 + 0.05 = 0.85
 *   Новый вес S1 = 0.30 / 0.85 ≈ 0.353
 *   Новый вес S2 = 0.20 / 0.85 ≈ 0.235
 *   ... и т.д.
 *
 * @param nullSignals — массив ключей сигналов со значением null
 * @param weights     — конфигурация весов (по умолчанию DEFAULT_WEIGHTS)
 */

export function computeEffectiveWeights(
  nullSignals: SignalKey[],
  weights: WeightsConfig = DEFAULT_WEIGHTS,
): EffectiveWeights {
  const nullSet = new Set<SignalKey>(nullSignals);
  const allKeys: SignalKey[] = ['s1', 's2', 's3', 's4', 's5', 's7'];

  const availableSum = allKeys.reduce<number>((sum, key) => {
    return nullSet.has(key) ? sum : sum + weights[key];
  }, 0);

  if (availableSum === 0) {
    return { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s7: 0 };
  }

  const result = {} as EffectiveWeights;
  for (const key of allKeys) {
    result[key] = nullSet.has(key) ? 0 : weights[key] / availableSum;
  }

  return result;
}

/**
 * Возвращает массив ключей сигналов, значение которых null.
 * Используется в computeScore() для передачи в computeEffectiveWeights().
 */
export function detectNullSignals(normalized: {
  s1: number;
  s2: number;
  s3: number | null;
  s4: number;
  s5: number;
  s7: number;
}): SignalKey[] {
  const nullKeys: SignalKey[] = [];
  if (normalized.s3 === null) nullKeys.push('s3');
  
  return nullKeys;
}