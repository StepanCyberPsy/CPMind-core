import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FULL_BRANCH_GLOBAL, getFullBranchKey, publishFullBranch, readFullBranch } from '../src/global.js';
import { loadFullBranch } from '../src/loader.js';

const version = 'access-test';
const branch = { start: () => null };
const holder = (target: object): Record<string, unknown> => target as Record<string, unknown>;

function page() {
    const scripts: HTMLScriptElement[] = [];
    const append = vi.fn((script: HTMLScriptElement) => {
        scripts.push(script);
        return script;
    });
    const create = vi.fn(() => Object.assign(new EventTarget(), {
        src: '', async: false, remove: vi.fn(),
    }) as unknown as HTMLScriptElement);
    const target = {
        document: { createElement: create, head: { appendChild: append } },
        setTimeout: vi.fn((callback: () => void, ms: number) => setTimeout(callback, ms)),
        clearTimeout: vi.fn((id: ReturnType<typeof setTimeout>) => clearTimeout(id)),
    } as unknown as Window;
    return { target, scripts, append, create };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('OMID_RUNTIME_VERSION', version);
    vi.stubGlobal('CDN_BASE_URL', 'https://cdn.cpmind.test');
});

afterEach(() => {
    delete holder(globalThis)[getFullBranchKey(version)];
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('контракт фабрики', () => {
    it('публикует фабрику в собственном окне с версией runtime', () => {
        expect(readFullBranch(globalThis as unknown as Window, version)).toBeNull();
        publishFullBranch(branch, version);
        expect(readFullBranch(globalThis as unknown as Window, version)).toBe(branch);
    });

    it('не смешивает окна, версии и старый глобал', () => {
        const first = page().target;
        const second = page().target;
        holder(first)[getFullBranchKey('old')] = branch;
        holder(first)[FULL_BRANCH_GLOBAL] = branch;
        expect(readFullBranch(first, version)).toBeNull();
        holder(first)[getFullBranchKey(version)] = branch;
        expect(readFullBranch(first, version)).toBe(branch);
        expect(readFullBranch(second, version)).toBeNull();
    });

    it('отклоняет посторонние объекты и исключения доступа', () => {
        const target = page().target;
        for (const value of [null, undefined, 42, 'branch', {}, { start: 'нет' }]) {
            holder(target)[getFullBranchKey(version)] = value;
            expect(readFullBranch(target, version)).toBeNull();
        }
        const denied = new Proxy({}, { get() { throw new Error('SecurityError'); } });
        expect(readFullBranch(denied as Window, version)).toBeNull();
    });
});

describe('загрузка в проверенное окно', () => {
    it('использует документ и фабрику выбранного окна для двух одновременных клиентов', async () => {
        const { target, scripts, create } = page();
        const first = loadFullBranch(target);
        const second = loadFullBranch(target);
        expect(second).toBe(first);
        expect(create).toHaveBeenCalledOnce();
        expect(create).toHaveBeenCalledWith('script');
        expect(scripts).toHaveLength(1);
        expect(scripts[0]!.src).toBe('https://cdn.cpmind.test/runtime/cpmind-omid-full_vaccess-test.min.js');
        holder(target)[getFullBranchKey(version)] = branch;
        scripts[0]!.dispatchEvent(new Event('load'));
        await expect(first).resolves.toBe(branch);
        await expect(second).resolves.toBe(branch);
        expect(target.clearTimeout).toHaveBeenCalledOnce();
        expect(scripts[0]!.remove).toHaveBeenCalledOnce();
    });

    it('переиспользует только уже загруженную подходящую версию', async () => {
        const { target, create } = page();
        holder(target)[getFullBranchKey(version)] = branch;
        await expect(loadFullBranch(target)).resolves.toBe(branch);
        expect(create).not.toHaveBeenCalled();
    });

    it('не использует старую версию или фабрику другого окна', async () => {
        const { target, scripts } = page();
        publishFullBranch(branch, version);
        holder(target)[getFullBranchKey('old')] = branch;
        const result = loadFullBranch(target);
        expect(scripts).toHaveLength(1);
        scripts[0]!.dispatchEvent(new Event('load'));
        await expect(result).resolves.toBeNull();
    });

    it('ошибка загрузки допускает следующую попытку', async () => {
        const { target, scripts } = page();
        const failed = loadFullBranch(target);
        scripts[0]!.dispatchEvent(new Event('error'));
        await expect(failed).resolves.toBeNull();
        const retry = loadFullBranch(target);
        expect(scripts).toHaveLength(2);
        holder(target)[getFullBranchKey(version)] = branch;
        scripts[1]!.dispatchEvent(new Event('load'));
        await expect(retry).resolves.toBe(branch);
    });

    it('таймаут завершает всех ожидающих, поздний load не меняет результат', async () => {
        const { target, scripts } = page();
        const first = loadFullBranch(target);
        const second = loadFullBranch(target);
        vi.advanceTimersByTime(5000);
        await expect(first).resolves.toBeNull();
        await expect(second).resolves.toBeNull();
        holder(target)[getFullBranchKey(version)] = branch;
        scripts[0]!.dispatchEvent(new Event('load'));
        await expect(first).resolves.toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('отказ вставки скрипта и отказ чтения окна возвращают partial', async () => {
        const { target, append } = page();
        append.mockImplementation(() => { throw new Error('CSP'); });
        await expect(loadFullBranch(target)).resolves.toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        const denied = new Proxy({}, { get() { throw new Error('SecurityError'); } });
        await expect(loadFullBranch(denied as Window)).resolves.toBeNull();
    });
});
