import type { CpmindOmidFullBranch } from './types.js';

/**
 * Префикс контракта фабрики. Версия runtime входит в ключ: загрузчик новой
 * версии не должен переиспользовать старую фабрику на той же странице.
 */
export const FULL_BRANCH_GLOBAL = '__cpmindOmidFullV1';

export function getFullBranchKey(runtimeVersion: string): string {
    return FULL_BRANCH_GLOBAL + '_' + runtimeVersion;
}

export function readFullBranch(targetWindow: Window, runtimeVersion: string): CpmindOmidFullBranch | null {
    try {
        const holder = targetWindow as unknown as Record<string, unknown>;
        const candidate = holder[getFullBranchKey(runtimeVersion)];
        if (candidate === undefined || candidate === null) return null;
        if (typeof (candidate as CpmindOmidFullBranch).start !== 'function') return null;

        return candidate as CpmindOmidFullBranch;
    } catch {
        return null;
    }
}

export function publishFullBranch(branch: CpmindOmidFullBranch, runtimeVersion: string): void {
    const holder = globalThis as unknown as Record<string, unknown>;
    holder[getFullBranchKey(runtimeVersion)] = branch;
}
