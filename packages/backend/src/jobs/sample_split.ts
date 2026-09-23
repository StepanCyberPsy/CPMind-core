import { createHash } from 'node:crypto';

// Наблюдение для обучения логистической модели: ключ разбиения, признаки и метка
export interface LabeledSample {
    key: string;
    x: number[];
    y: number;
}

export interface SampleSplit<T> {
    train: T[];
    test: T[];
}

/**
 * Детерминированное разбиение на обучающую и тестовую выборки по SHA-256 ключа.
 * Состав выборок не зависит от порядка строк, возвращённых БД, — метрика качества
 * воспроизводима между запусками на одних данных. Тестовая выборка непуста для непустого входа.
 */
export function splitDeterministically<T>(
    items: readonly T[],
    getKey: (item: T) => string,
    testRatio: number,
): SampleSplit<T> {
    const ordered = items
        .map((item) => {
            const key = getKey(item);
            return {
                item,
                key,
                hash: createHash('sha256').update(key).digest('hex'),
            };
        })
        .sort((a, b) => {
            const hashComparison = a.hash.localeCompare(b.hash);
            if (hashComparison !== 0) return hashComparison;
            return a.key.localeCompare(b.key);
        })
        .map(({ item }) => item);

    const testSize = ordered.length === 0
        ? 0
        : Math.max(1, Math.floor(ordered.length * testRatio));

    return {
        test: ordered.slice(0, testSize),
        train: ordered.slice(testSize),
    };
}