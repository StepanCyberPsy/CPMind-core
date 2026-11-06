import { getFullBranchKey, readFullBranch } from './global.js';
import type { CpmindOmidFullBranch } from './types.js';

declare const CDN_BASE_URL: string;
declare const OMID_RUNTIME_VERSION: string;

// Ветка коллекторов должна появиться до того, как показ закончится.
// Истечение срока не теряет измерение: ограниченная ветка работает параллельно
const LOAD_TIMEOUT_MS = 5_000;

export function buildFullBranchUrl(): string {
    return `${CDN_BASE_URL}/runtime/cpmind-omid-full_v${OMID_RUNTIME_VERSION}.min.js`;
}

/**
 * Подключение ветки коллекторов страницы отдельным бандлом.
 *
 * Скрипт верификации может находиться в дочернем окне. Полную ветку грузим
 * в проверенный документ страницы и читаем фабрику из того же окна.
 * Политика безопасности страницы может запретить загрузку — остаётся partial.
 */
export function loadFullBranch(targetWindow: Window): Promise<CpmindOmidFullBranch | null> {
    try {
        const version = OMID_RUNTIME_VERSION;
        const existing = readFullBranch(targetWindow, version);
        if (existing !== null) return Promise.resolve(existing);

        // Общая загрузка не хранит сессии: её используют независимые iframe
        // верификации одного окна, но только для одной версии runtime.
        const holder = targetWindow as unknown as Record<string, unknown>;
        const pendingKey = getFullBranchKey(version) + '_loading';
        const pending = holder[pendingKey] as Promise<CpmindOmidFullBranch | null> | undefined;
        if (pending && typeof pending.then === 'function') return pending;

        let resolvePending!: (branch: CpmindOmidFullBranch | null) => void;
        const promise = new Promise<CpmindOmidFullBranch | null>((resolve) => {
            resolvePending = resolve;
        });
        holder[pendingKey] = promise;
        let settled = false;
        let timer: number | undefined;
        let script: HTMLScriptElement | undefined;

        const onLoad = (): void => finish(readFullBranch(targetWindow, version));
        const onError = (): void => finish(null);
        const finish = (branch: CpmindOmidFullBranch | null): void => {
            if (settled) return;
            settled = true;
            try {
                if (timer !== undefined) targetWindow.clearTimeout(timer);
                script?.removeEventListener('load', onLoad);
                script?.removeEventListener('error', onError);
                script?.remove();
                if (holder[pendingKey] === promise) delete holder[pendingKey];
            } catch {
                // Окно могло сменить документ; результат загрузки всё равно завершаем.
            } finally {
                resolvePending(branch);
            }
        };

        try {
            // Таймер принадлежит странице, а не удаляемому iframe верификации.
            timer = targetWindow.setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
            const doc = targetWindow.document;
            script = doc.createElement('script');
            script.src = buildFullBranchUrl();
            script.async = true;
            script.addEventListener('load', onLoad);
            script.addEventListener('error', onError);
            const parent = doc.head ?? doc.documentElement;
            parent.appendChild(script);
        } catch {
            finish(null);
        }
        return promise;
    } catch {
        return Promise.resolve(null);
    }
}
