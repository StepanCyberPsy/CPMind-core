import { describe, expect, it } from 'vitest';
import { splitDeterministically } from '../src/jobs/sample_split.js';

const KEYS = Array.from({ length: 100 }, (_, index) => `impression-${index}`);

describe('splitDeterministically', () => {
    it('не зависит от порядка входных данных', () => {
        const direct = splitDeterministically(KEYS, (key) => key, 0.2);
        const reversed = splitDeterministically([...KEYS].reverse(), (key) => key, 0.2);

        expect(reversed.test).toEqual(direct.test);
        expect(reversed.train).toEqual(direct.train);
    });

    it('выделяет тестовую выборку по доле', () => {
        const split = splitDeterministically(KEYS, (key) => key, 0.2);

        expect(split.test).toHaveLength(20);
        expect(split.train).toHaveLength(80);
    });

    it('не теряет и не дублирует элементы', () => {
        const split = splitDeterministically(KEYS, (key) => key, 0.2);
        const merged = [...split.train, ...split.test].sort();

        expect(merged).toEqual([...KEYS].sort());
    });

    it('оставляет тестовую выборку непустой для малого входа', () => {
        const split = splitDeterministically(['a', 'b'], (key) => key, 0.2);

        expect(split.test).toHaveLength(1);
        expect(split.train).toHaveLength(1);
    });
});