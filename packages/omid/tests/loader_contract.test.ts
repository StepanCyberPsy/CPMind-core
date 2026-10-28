import { beforeEach, describe, expect, it } from 'vitest';
import { FULL_BRANCH_GLOBAL, publishFullBranch, readFullBranch } from '../src/global.js';

const holder = globalThis as unknown as Record<string, unknown>;

describe('контракт передачи управления ветке коллекторов', () => {

    beforeEach(() => {
        delete holder[FULL_BRANCH_GLOBAL];
    });

    it('до публикации ветки её нет', () => {
        expect(readFullBranch()).toBeNull();
    });

    it('опубликованная ветка читается обратно', () => {
        const branch = { start: () => null };
        publishFullBranch(branch);
        expect(readFullBranch()).toBe(branch);
    });

    it('посторонний объект в глобале веткой не считается', () => {
        // В окне издателя рядом исполняется чужой код: имя может быть занято
        for (const value of [null, undefined, 42, 'branch', {}, { start: 'нет' }]) {
            holder[FULL_BRANCH_GLOBAL] = value;
            expect(readFullBranch()).toBeNull();
        }
    });
});
