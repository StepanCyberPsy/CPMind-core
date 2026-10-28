import { describe, expect, it } from 'vitest';
import { resolveAccessLevel, shouldUsePageCollectors } from '../src/gate.js';
import type { OmidContext } from '../src/types.js';

function ctx(partial: Partial<OmidContext>): OmidContext {
    return { environment: 'web', ...partial };
}

describe('resolveAccessLevel', () => {

    it('полный доступ к странице — только при подтверждённом верхнем окне', () => {
        expect(resolveAccessLevel(ctx({ accessMode: 'full', friendlyToTop: true })))
            .toBe('full_page');
    });

    it('full без верхнего окна — это доступ только к креативу', () => {
        expect(resolveAccessLevel(ctx({ accessMode: 'full', friendlyToTop: false })))
            .toBe('creative');

        // Поле может отсутствовать — повышать уровень на догадке нельзя
        expect(resolveAccessLevel(ctx({ accessMode: 'full' })))
            .toBe('creative');
    });

    it('песочница и устаревший domain сводятся к ограниченному уровню', () => {
        expect(resolveAccessLevel(ctx({ accessMode: 'limited' }))).toBe('limited');
        expect(resolveAccessLevel(ctx({ accessMode: 'domain' }))).toBe('limited');
    });

    it('неизвестный или отсутствующий контекст трактуется консервативно', () => {
        expect(resolveAccessLevel(undefined)).toBe('limited');
        expect(resolveAccessLevel(ctx({}))).toBe('limited');
        expect(resolveAccessLevel(ctx({ accessMode: 'unknown' as never }))).toBe('limited');
    });

    it('domain с friendlyToTop не повышается до полного уровня', () => {
        expect(resolveAccessLevel(ctx({ accessMode: 'domain', friendlyToTop: true })))
            .toBe('limited');
    });
});

describe('shouldUsePageCollectors', () => {

    it('коллекторы страницы запускаются исключительно на полном уровне', () => {
        expect(shouldUsePageCollectors('full_page')).toBe(true);

        for (const level of ['creative', 'limited', 'not_executed'] as const) {
            expect(shouldUsePageCollectors(level)).toBe(false);
        }
    });
});
