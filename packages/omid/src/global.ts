import type { CpmindOmidFullBranch } from './types.js';

/**
 * Имя глобала, через который ветка коллекторов страницы отдаёт себя загрузчику.
 * Скрипт исполняется в окне издателя рядом с чужим кодом, поэтому имя
 * уникально и несёт версию контракта
 */
export const FULL_BRANCH_GLOBAL = '__cpmindOmidFullV1';

export function readFullBranch(): CpmindOmidFullBranch | null {
    const holder = globalThis as unknown as Record<string, unknown>;
    const candidate = holder[FULL_BRANCH_GLOBAL];

    if (candidate === undefined || candidate === null) return null;
    if (typeof (candidate as CpmindOmidFullBranch).start !== 'function') return null;

    return candidate as CpmindOmidFullBranch;
}

export function publishFullBranch(branch: CpmindOmidFullBranch): void {
    const holder = globalThis as unknown as Record<string, unknown>;
    holder[FULL_BRANCH_GLOBAL] = branch;
}
