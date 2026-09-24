/**
 * Общие проверки и метрики качества логистических моделей S3, S5 и S6.
 *
 * Вырожденная метка — выборка, где почти все наблюдения одного класса — даёт
 * модель, предсказывающую константу. Точность на такой выборке равна доле
 * большего класса и выглядит высокой, не измеряя ничего: совпадение
 * гарантировано. Отличить выученную модель от константной позволяет только
 * площадь под ROC-кривой.
 */

// Допустимая доля положительных в обучающей выборке. За пределами диапазона
// обучение не запускается: метка сломана, а не данные однородны
export const MIN_POSITIVE_RATE = 0.05;
export const MAX_POSITIVE_RATE = 0.95;

// Сила L2-штрафа для IRLS. Удерживает коэффициенты от разбегания при почти
// вырожденных данных; intercept не штрафуется
export const L2_LAMBDA = 1.0;

export function calculatePositiveRate(labels: readonly number[]): number {
    if (labels.length === 0) return 0;

    const positives = labels.reduce(
        (sum, label) => sum + (label === 1 ? 1 : 0),
        0,
    );

    return positives / labels.length;
}

/**
 * Вероятность положительного класса. Ветвление по знаку z предотвращает
 * переполнение Math.exp при больших по модулю линейных комбинациях
 */
export function predictProbability(
    features: readonly number[],
    beta: readonly number[],
): number {
    const z = features.reduce(
        (sum, value, index) => sum + value * (beta[index] ?? 0),
        0,
    );

    if (z >= 0) {
        return 1 / (1 + Math.exp(-z));
    }

    const expZ = Math.exp(z);
    return expZ / (1 + expZ);
}

export function calculateAccuracy(
    probabilities: readonly number[],
    labels: readonly number[],
): number {
    if (
        probabilities.length === 0 ||
        probabilities.length !== labels.length
    ) {
        throw new Error('calculateAccuracy: некорректные размеры выборки');
    }

    let correct = 0;

    for (let i = 0; i < probabilities.length; i++) {
        const probability = probabilities[i];
        const label = labels[i];

        if (probability === undefined || label === undefined) {
            throw new Error('calculateAccuracy: внутренняя ошибка индексации');
        }

        const prediction = probability >= 0.5 ? 1 : 0;

        if (prediction === label) {
            correct++;
        }
    }

    return correct / probabilities.length;
}

/**
 * Площадь под ROC-кривой через статистику Манна — Уитни: сумма рангов
 * положительных наблюдений. Совпадающим вероятностям присваивается средний ранг
 * группы — при вырожденных коэффициентах предсказания совпадают у всех строк,
 * и без этого AUC оказался бы завышен.
 *
 * null для выборки одного класса: кривая не определена.
 */
export function calculateRocAuc(
    probabilities: readonly number[],
    labels: readonly number[],
): number | null {
    if (
        probabilities.length === 0 ||
        probabilities.length !== labels.length
    ) {
        return null;
    }

    const rows = probabilities
        .map((probability, index) => ({
            probability,
            label: labels[index] ?? 0,
        }))
        .sort((a, b) => a.probability - b.probability);

    const positiveCount = rows.reduce(
        (sum, row) => sum + (row.label === 1 ? 1 : 0),
        0,
    );
    const negativeCount = rows.length - positiveCount;

    if (positiveCount === 0 || negativeCount === 0) {
        return null;
    }

    let positiveRankSum = 0;
    let start = 0;

    while (start < rows.length) {
        let end = start + 1;
        const score = rows[start]!.probability;

        while (
            end < rows.length &&
            rows[end]!.probability === score
        ) {
            end++;
        }

        const averageRank = (start + 1 + end) / 2;

        for (let i = start; i < end; i++) {
            if (rows[i]!.label === 1) {
                positiveRankSum += averageRank;
            }
        }

        start = end;
    }

    const auc = (
        positiveRankSum -
        positiveCount * (positiveCount + 1) / 2
    ) / (
            positiveCount * negativeCount
        );

    return Math.max(0, Math.min(1, auc));
}