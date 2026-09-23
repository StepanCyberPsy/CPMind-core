import {
    describe,
    expect,
    it,
} from 'vitest';
import {
    selectRotationCreative,
    toRotationMode,
    type RotationCandidate,
} from '../src/services/delivery/creative_rotation.js';

const SET: RotationCandidate[] = [
    { creativeId: 'a', weightPct: 40, displayOrder: 0 },
    { creativeId: 'b', weightPct: 40, displayOrder: 1 },
    { creativeId: 'c', weightPct: 20, displayOrder: 2 },
];

// Источник случайности с заданной последовательностью значений
function fixedRandom(...values: number[]): () => number {
    let index = 0;
    return () => values[index++ % values.length]!;
}

describe('Приведение режима ротации', () => {

    it('допустимые значения проходят без изменения', () => {
        expect(toRotationMode('weighted_random')).toBe('weighted_random');
        expect(toRotationMode('sequential')).toBe('sequential');
    });

    it('неизвестное значение приводится к взвешенному выбору', () => {
        expect(toRotationMode('round_robin')).toBe('weighted_random');
        expect(toRotationMode('')).toBe('weighted_random');
    });
});

describe('Выбор ролика из набора', () => {

    it('пустой набор означает работу с одним креативом плейсмента', () => {
        const result = selectRotationCreative({
            candidates: [],
            format: 'outstream',
            mode: 'weighted_random',
            showIndex: 0,
            previousCreativeId: null,
            random: fixedRandom(0.5),
        });

        expect(result).toBeNull();
    });

    it('набор из одного ролика возвращает его независимо от режима', () => {
        const single = [SET[0]!];

        for (const mode of ['weighted_random', 'sequential'] as const) {
            const result = selectRotationCreative({
                candidates: single,
                format: 'outstream',
                mode,
                showIndex: 7,
                previousCreativeId: 'a',
                random: fixedRandom(0.9),
            });

            expect(result?.creativeId).toBe('a');
        }
    });
});

describe('Взвешенный случайный выбор', () => {

    it('доля розыгрыша соответствует весам', () => {
        const pick = (value: number): string => selectRotationCreative({
            candidates: SET,
            format: 'instream',
            mode: 'weighted_random',
            showIndex: 0,
            previousCreativeId: null,
            random: fixedRandom(value),
        })!.creativeId;

        // Границы долей: a — [0, 0.4), b — [0.4, 0.8), c — [0.8, 1)
        expect(pick(0)).toBe('a');
        expect(pick(0.39)).toBe('a');
        expect(pick(0.41)).toBe('b');
        expect(pick(0.79)).toBe('b');
        expect(pick(0.81)).toBe('c');
        expect(pick(0.99)).toBe('c');
    });

    it('предыдущий ролик исключается из розыгрыша', () => {
        // Без исключения значение 0.1 выбрало бы a
        const result = selectRotationCreative({
            candidates: SET,
            format: 'outstream',
            mode: 'weighted_random',
            showIndex: 1,
            previousCreativeId: 'a',
            random: fixedRandom(0.1),
        });

        expect(result?.creativeId).not.toBe('a');
    });

    it('исключение предыдущего не применяется к набору из двух при полном совпадении', () => {
        const pair: RotationCandidate[] = [
            { creativeId: 'a', weightPct: 50, displayOrder: 0 },
            { creativeId: 'b', weightPct: 50, displayOrder: 1 },
        ];

        const result = selectRotationCreative({
            candidates: pair,
            format: 'outstream',
            mode: 'weighted_random',
            showIndex: 1,
            previousCreativeId: 'a',
            random: fixedRandom(0.99),
        });

        expect(result?.creativeId).toBe('b');
    });

    it('нулевая сумма весов не приводит к отказу выбора', () => {
        const zeroed: RotationCandidate[] = [
            { creativeId: 'a', weightPct: 0, displayOrder: 0 },
            { creativeId: 'b', weightPct: 0, displayOrder: 1 },
        ];

        const result = selectRotationCreative({
            candidates: zeroed,
            format: 'outstream',
            mode: 'weighted_random',
            showIndex: 0,
            previousCreativeId: null,
            random: fixedRandom(0.5),
        });

        expect(result?.creativeId).toBe('a');
    });

    it('in-stream не использует последовательный порядок', () => {
        // Режим sequential задан, но формат in-stream разыгрывает вес
        const result = selectRotationCreative({
            candidates: SET,
            format: 'instream',
            mode: 'sequential',
            showIndex: 1,
            previousCreativeId: null,
            random: fixedRandom(0.99),
        });

        expect(result?.creativeId).toBe('c');
    });
});

describe('Последовательный порядок out-stream', () => {

    const pickAt = (showIndex: number): string => selectRotationCreative({
        candidates: SET,
        format: 'outstream',
        mode: 'sequential',
        showIndex,
        previousCreativeId: null,
        random: fixedRandom(0.5),
    })!.creativeId;

    it('проигрывает набор в заданном порядке', () => {
        expect(pickAt(0)).toBe('a');
        expect(pickAt(1)).toBe('b');
        expect(pickAt(2)).toBe('c');
    });

    it('зацикливается после последнего ролика', () => {
        expect(pickAt(3)).toBe('a');
        expect(pickAt(4)).toBe('b');
        expect(pickAt(7)).toBe('b');
    });

    it('порядок не зависит от расположения записей в наборе', () => {
        const shuffled = [SET[2]!, SET[0]!, SET[1]!];

        const result = selectRotationCreative({
            candidates: shuffled,
            format: 'outstream',
            mode: 'sequential',
            showIndex: 0,
            previousCreativeId: null,
            random: fixedRandom(0.5),
        });

        expect(result?.creativeId).toBe('a');
    });

    it('одинаковый порядок разрешается устойчиво', () => {
        const tied: RotationCandidate[] = [
            { creativeId: 'b', weightPct: 50, displayOrder: 0 },
            { creativeId: 'a', weightPct: 50, displayOrder: 0 },
        ];

        expect(selectRotationCreative({
            candidates: tied,
            format: 'outstream',
            mode: 'sequential',
            showIndex: 0,
            previousCreativeId: null,
            random: fixedRandom(0.5),
        })?.creativeId).toBe('a');

        expect(selectRotationCreative({
            candidates: tied,
            format: 'outstream',
            mode: 'sequential',
            showIndex: 1,
            previousCreativeId: null,
            random: fixedRandom(0.5),
        })?.creativeId).toBe('b');
    });
});