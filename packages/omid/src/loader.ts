import { readFullBranch } from './global.js';
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
 * Вызывается только при подтверждённом доступе к верхнему окну, поэтому вставка
 * тега script допустима: мы находимся в документе издателя. Политика безопасности
 * площадки может её запретить — тогда отказ возвращается честно, и показ
 * остаётся на ограниченной ветке.
 */
export function loadFullBranch(): Promise<CpmindOmidFullBranch | null> {
    const existing = readFullBranch();
    if (existing !== null) return Promise.resolve(existing);

    return new Promise<CpmindOmidFullBranch | null>((resolve) => {
        let settled = false;

        const finish = (branch: CpmindOmidFullBranch | null): void => {
            if (settled) return;
            settled = true;
            resolve(branch);
        };

        const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);

        try {
            const script = document.createElement('script');
            script.src = buildFullBranchUrl();
            script.async = true;

            script.addEventListener('load', () => {
                clearTimeout(timer);
                finish(readFullBranch());
            });

            script.addEventListener('error', () => {
                clearTimeout(timer);
                finish(null);
            });

            const parent = document.head ?? document.documentElement;
            parent.appendChild(script);
        } catch {
            clearTimeout(timer);
            finish(null);
        }
    });
}
