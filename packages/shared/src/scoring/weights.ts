/**
 * Стартовые веса для баннерных креативов — v1.0_uncalibrated_banner.
 * S6 = 0.0: баннеры не содержат видео, вес не перераспределяется
 * (null-сигнал с нулевым базовым весом добавляет 0 к availableSum).
 * Сумма весов = 1.00.
 */
export const DEFAULT_BANNER_WEIGHTS: WeightsValues = {
  version: 'v1.0_uncalibrated_banner',
  s1: 0.30,
  s2: 0.20,
  s3: 0.15,
  s4: 0.15,
  s5: 0.15,
  s6: 0.00,
  s7: 0.05,
};

/**
 * Стартовые веса для видео-креативов — v1.0_uncalibrated_video.
 * S6 доминирует (0.40) как основной измеритель вовлечённости в видео.
 * Сумма весов = 1.00.
 * Профиль предшествует разделению по режиму показа: остаётся для показов,
 * у которых режим не определён, и для сопоставимости исторических значений Score
 */
export const DEFAULT_VIDEO_WEIGHTS: WeightsValues = {
  version: 'v1.0_uncalibrated_video',
  s1: 0.15,
  s2: 0.10,
  s3: 0.10,
  s4: 0.10,
  s5: 0.10,
  s6: 0.40,
  s7: 0.05,
};

/**
 * Стартовые веса для in-stream видео — v1.0_uncalibrated_video_instream.
 * Значения перенесены из профиля, действовавшего до разделения по режиму:
 * расхождение вносится после калибровки, а не на старте
 */
export const DEFAULT_VIDEO_INSTREAM_WEIGHTS: WeightsValues = {
  version: 'v1.0_uncalibrated_video_instream',
  s1: 0.15,
  s2: 0.10,
  s3: 0.10,
  s4: 0.10,
  s5: 0.10,
  s6: 0.40,
  s7: 0.05,
};

/**
 * Стартовые веса для out-stream видео — v1.0_uncalibrated_video_outstream.
 * Значения совпадают с in-stream до определения собственных: профиль заводится
 * заранее, чтобы разделение весов не требовало изменения схемы
 */
export const DEFAULT_VIDEO_OUTSTREAM_WEIGHTS: WeightsValues = {
  version: 'v1.0_uncalibrated_video_outstream',
  s1: 0.15,
  s2: 0.10,
  s3: 0.10,
  s4: 0.10,
  s5: 0.10,
  s6: 0.40,
  s7: 0.05,
};

export interface WeightsValues {
  version: string;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s6: number;
  s7: number;
}

export type WeightsConfig = WeightsValues;
export type SignalKey = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7';

// Категории профилей весов. video предшествует разделению по режиму показа
// и сохраняется для показов, у которых режим не определён
export const CREATIVE_CATEGORIES = [
  'banner',
  'video',
  'video_instream',
  'video_outstream',
] as const;

export type CreativeCategory = typeof CREATIVE_CATEGORIES[number];

/**
 * Стартовые веса категории. Таблица исчерпывающая по типу: категория, добавленная
 * без записи здесь, даёт ошибку сборки — иначе она молча получила бы баннерные веса
 * с нулевым S6, и сигнал исчез бы из Score видеопоказа
 */
export const DEFAULT_WEIGHTS_BY_CATEGORY: Readonly<Record<CreativeCategory, WeightsValues>> = {
  banner: DEFAULT_BANNER_WEIGHTS,
  video: DEFAULT_VIDEO_WEIGHTS,
  video_instream: DEFAULT_VIDEO_INSTREAM_WEIGHTS,
  video_outstream: DEFAULT_VIDEO_OUTSTREAM_WEIGHTS,
};

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
  s6: number;
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
  weights: WeightsConfig,
): EffectiveWeights {
  const nullSet = new Set<SignalKey>(nullSignals);
  const allKeys: SignalKey[] = [
    's1',
    's2',
    's3',
    's4',
    's5',
    's6',
    's7'
  ];

  const availableSum = allKeys.reduce<number>((sum, key) => {
    return nullSet.has(key) ? sum : sum + weights[key];
  }, 0);

  if (availableSum === 0) {
    return { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0 };
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
  s6: number | null;
  s7: number;
}): SignalKey[] {
  const nullKeys: SignalKey[] = [];
  if (normalized.s3 === null) nullKeys.push('s3');
  if (normalized.s6 === null) nullKeys.push('s6');

  return nullKeys;
}