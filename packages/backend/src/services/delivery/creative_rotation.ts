import type { PlacementFormat } from '@cpmind/shared';

// Порядок выбора ролика из набора
export type RotationMode =
    | 'weighted_random'
    | 'sequential';

const ROTATION_MODE_VALUES: ReadonlySet<string> = new Set([
    'weighted_random',
    'sequential',
]);

// Значение из БД ограничено CHECK, приведение выполняется на границе слоя данных
export function toRotationMode(value: string): RotationMode {
    return ROTATION_MODE_VALUES.has(value)
        ? value as RotationMode
        : 'weighted_random';
}

export interface RotationCandidate {
    creativeId: string;
    weightPct: number;
    displayOrder: number;
}

export interface RotationInput {
    candidates: readonly RotationCandidate[];
    format: PlacementFormat;
    mode: RotationMode;

    // Порядковый номер следующего показа в рекламной сессии, начиная с нуля
    showIndex: number;

    // Ролик предыдущего показа — исключается из розыгрыша, чтобы не повторяться подряд
    previousCreativeId: string | null;

    // Источник случайности в диапазоне [0, 1). Передаётся явно: скрытая зависимость
    // от Math.random сделала бы выбор невоспроизводимым в тестах
    random: () => number;
}

// Взвешенный розыгрыш по нормализованным долям. Сумма весов приводится к фактической:
// погрешность вещественного типа не должна приводить к отказу выбора
function pickWeighted(
    candidates: readonly RotationCandidate[],
    random: () => number,
): RotationCandidate {
    const totalWeight = candidates.reduce(
        (sum, candidate) => sum + candidate.weightPct,
        0,
    );

    const first = candidates[0]!;

    if (totalWeight <= 0) return first;

    let threshold = random() * totalWeight;

    for (const candidate of candidates) {
        threshold -= candidate.weightPct;
        if (threshold < 0) return candidate;
    }

    // Недостижимо при корректных весах: накопленная погрешность суммы
    return candidates[candidates.length - 1]!;
}

/**
 * Выбирает ролик для очередного показа. In-stream получает один ролик на рекламную
 * возможность взвешенным розыгрышем. Out-stream проигрывает набор по кругу либо
 * взвешенно случайно без повтора подряд — зацикливание не прекращается.
 * Пустой набор означает, что плейсмент работает с одним креативом.
 */
export function selectRotationCreative(
    input: RotationInput,
): RotationCandidate | null {
    const {
        candidates,
        format,
        mode,
        showIndex,
        previousCreativeId,
        random,
    } = input;

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0]!;

    // Последовательный порядок применяется только к out-stream: in-stream получает
    // одну рекламную возможность, проигрывать набор по кругу в ней негде
    if (format === 'outstream' && mode === 'sequential') {
        const ordered = [...candidates].sort(
            (a, b) => a.displayOrder - b.displayOrder ||
                a.creativeId.localeCompare(b.creativeId),
        );

        const position = ((showIndex % ordered.length) + ordered.length) % ordered.length;
        return ordered[position]!;
    }

    // Повтор подряд исключается, пока в наборе остаётся выбор
    const pool = previousCreativeId !== null
        ? candidates.filter((candidate) => candidate.creativeId !== previousCreativeId)
        : candidates;

    return pickWeighted(pool.length > 0 ? pool : candidates, random);
}