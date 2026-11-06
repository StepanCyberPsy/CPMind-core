import type { OmidContext } from './types.js';

/**
 * Фактический уровень доступа, выданный плеером площадки.
 * Значение записывается в показ и определяет, какой набор сигналов собирается.
 */
export type AccessLevel = 'full_page' | 'creative' | 'limited' | 'not_executed';

/**
 * Разбор контекста сессии в уровень доступа.
 *
 * accessMode: full допускает как полный доступ, так и доступ только к креативу.
 * Различие подтверждается чтением верхнего документа, а не наличием
 * friendlyToTop: диагностические скрипты IAB вычисляют это поле самостоятельно.
 *
 * "domain" помечен IAB как устаревший с февраля 2025 и работает как песочница,
 * поэтому приравнивается к limited. Неизвестное значение трактуется так же:
 * занижение уровня безопаснее завышения — при завышении коллекторы измерили бы
 * документ iframe и выдали бы правдоподобные, но неверные значения S2 и S7.
 */
export function resolveAccessLevel(
    context: OmidContext | undefined,
    topWindow: Window | null,
): AccessLevel {
    if (context === undefined) return 'limited';

    if (context.accessMode === 'full') {
        return topWindow !== null ? 'full_page' : 'creative';
    }

    return 'limited';
}

/**
 * Запускать ли коллекторы @cpmind/sdk, измеряющие страницу.
 *
 * Строго только при подтверждённом доступе к верхнему окну. Саму ветку также
 * необходимо загрузить в это окно: доступ к нему не меняет текущий document.
 */
export function shouldUsePageCollectors(level: AccessLevel): boolean {
    return level === 'full_page';
}

// Вызывается только для объявленного full; исключение доступа оставляет
// измерение частичным. Возвращаем окно, чтобы загрузчик использовал тот же DOM.
export function getAccessibleTopWindow(currentWindow: Window = window): Window | null {
    try {
        const topWindow = currentWindow.top;
        if (topWindow === null || !topWindow.document.documentElement) return null;
        return topWindow;
    } catch {
        return null;
    }
}
