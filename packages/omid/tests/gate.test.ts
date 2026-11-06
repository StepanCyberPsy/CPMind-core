import { describe, expect, it } from 'vitest';
import { getAccessibleTopWindow, resolveAccessLevel, shouldUsePageCollectors } from '../src/gate.js';
import type { OmidContext } from '../src/types.js';

function ctx(partial: Partial<OmidContext>): OmidContext {
    return { environment: 'web', ...partial };
}

const topWindow = { document: { documentElement: {} } } as unknown as Window;

describe('resolveAccessLevel', () => {
    it.each([undefined, false, true])('использует фактический доступ при friendlyToTop=%s', (friendlyToTop) => {
        const context = ctx({
            accessMode: 'full',
            ...(friendlyToTop === undefined ? {} : { friendlyToTop }),
        });
        expect(resolveAccessLevel(context, topWindow)).toBe('full_page');
    });

    it.each([undefined, false, true])('не доверяет диагностике без доступного документа: %s', (friendlyToTop) => {
        expect(resolveAccessLevel(ctx({
            accessMode: 'full',
            ...(friendlyToTop === undefined ? {} : { friendlyToTop }),
        }), null)).toBe('creative');
    });

    it.each(['limited', 'domain', 'unknown', undefined])('не повышает режим %s при доступном DOM', (accessMode) => {
        const context = ctx({
            ...(accessMode === undefined ? {} : { accessMode: accessMode as NonNullable<OmidContext['accessMode']> }),
            friendlyToTop: true,
        });
        expect(resolveAccessLevel(context, topWindow)).toBe('limited');
        expect(resolveAccessLevel(context, null)).toBe('limited');
    });

    it('отсутствующий контекст остаётся ограниченным', () => {
        expect(resolveAccessLevel(undefined, topWindow)).toBe('limited');
    });
});

describe('getAccessibleTopWindow', () => {
    it('возвращает верхнее окно из доступного дочернего', () => {
        expect(getAccessibleTopWindow({ top: topWindow } as Window)).toBe(topWindow);
    });

    it('поддерживает запуск в самом верхнем окне', () => {
        const direct = { document: topWindow.document } as Window;
        Object.defineProperty(direct, 'top', { value: direct });
        expect(getAccessibleTopWindow(direct)).toBe(direct);
    });

    it('отказ доступа не выбрасывает исключение', () => {
        const denied = { top: { get document() { throw new Error('SecurityError'); } } };
        expect(getAccessibleTopWindow(denied as unknown as Window)).toBeNull();
    });

    it('не принимает отсутствующее окно или документ без корневого элемента', () => {
        expect(getAccessibleTopWindow({ top: null } as unknown as Window)).toBeNull();
        expect(getAccessibleTopWindow({
            top: { document: { documentElement: null } },
        } as unknown as Window)).toBeNull();
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
