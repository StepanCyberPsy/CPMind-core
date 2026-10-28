import type { OmidContext } from './types.js';

/**
 * Фактический уровень доступа, выданный плеером площадки.
 * Значение записывается в показ и определяет, какой набор сигналов собирается.
 */
export type AccessLevel = 'full_page' | 'creative' | 'limited' | 'not_executed';

/**
 * Разбор контекста сессии в уровень доступа.
 *
 * В API OMID значений режима всего два — "full" и "limited". Различие между
 * полным доступом к странице и доступом только к элементу креатива в accessMode
 * не выражено: оно зависит от того, изолирован ли плеер площадки в iframe.
 * Единственный достоверный признак — friendlyToTop (OMID 1.5, sessionStart).
 *
 * "domain" помечен IAB как устаревший с февраля 2025 и работает как песочница,
 * поэтому приравнивается к limited. Неизвестное значение трактуется так же:
 * занижение уровня безопаснее завышения — при завышении коллекторы измерили бы
 * документ iframe и выдали бы правдоподобные, но неверные значения S2 и S7.
 */
export function resolveAccessLevel(context: OmidContext | undefined): AccessLevel {
    if (context === undefined) return 'limited';

    if (context.accessMode === 'full') {
        return context.friendlyToTop === true ? 'full_page' : 'creative';
    }

    return 'limited';
}

/**
 * Запускать ли коллекторы @cpmind/sdk, измеряющие страницу.
 *
 * Строго только при подтверждённом доступе к верхнему окну. Это требование
 * корректности, а не полноты: в любом другом режиме глобальные window и document
 * принадлежат не странице издателя, и те же коллекторы вернут геометрию iframe.
 */
export function shouldUsePageCollectors(level: AccessLevel): boolean {
    return level === 'full_page';
}

// Дополнительная проверка перед запуском коллекторов: контекст может объявлять
// доступ к верхнему окну, а фактического доступа не быть
export function isTopWindowReachable(): boolean {
    try {
        if (window.self === window.top) return true;
        return window.top?.document !== undefined;
    } catch {
        return false;
    }
}
