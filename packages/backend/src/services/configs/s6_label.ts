import type { S6Mode } from '@cpmind/shared';

/**
 * Пороги присутствия зрителя, по которым строится метка обучения S6.
 * Значения не фиксируются в коде: джоб перебирает сетку и сохраняет выбранную
 * комбинацию вместе с коэффициентами, поэтому обученная модель воспроизводима
 */
export interface S6LabelParams {
    tabAbsentMaxMs: number;
    viewportAbsentMaxMs: number;
    scrollQuietMinMs: number;
    skipParkingRatio: number;
}

/**
 * Стартовые значения порогов. Инженерные допущения, не подтверждённые данными:
 * применяются как центр сетки перебора, а не как окончательные
 */
export const DEFAULT_S6_LABEL_PARAMS: S6LabelParams = {
    tabAbsentMaxMs: 1000,
    viewportAbsentMaxMs: 2000,
    scrollQuietMinMs: 3000,
    skipParkingRatio: 0.70,
};

const TAB_ABSENT_MS_GRID = [
    500,
    1000,
    2000,
];

const VIEWPORT_ABSENT_MS_GRID = [
    1000,
    2000,
    4000,
];

const SCROLL_QUIET_MS_GRID = [
    2000,
    3000,
    5000,
];

const SKIP_PARKING_RATIO_GRID = [
    0.60,
    0.70,
    0.85,
];

/**
 * Поля показа, по которым строится метка. Все они собираются отдельно от признаков
 * модели: пересечение метки с признаками уводит коэффициенты в бесконечность (§5.1).
 * null — бандл показа поле не отправлял либо условие к формату неприменимо
 */
export interface S6LabelInput {
    subtype: string | null;
    tabAbsentMaxMs: number | null;
    windowUnfocusedMaxMs: number | null;
    surfaceAbsentMaxMs: number | null;
    scrollQuietMaxMs: number | null;
    skipZoneHoverRatio: number | null;
    skipZoneMovedOutside: boolean | null;
}

/**
 * Комбинации порогов, влияющие на метку показов режима. In-stream различает уход
 * из вкладки и ожидание на кнопке пропуска, out-stream — уход из вкладки, остановку
 * прокрутки закреплённого окна и уход из области просмотра встроенного
 */
export function buildS6LabelGrid(mode: S6Mode): S6LabelParams[] {
    const grid: S6LabelParams[] = [];

    for (const tabAbsentMaxMs of TAB_ABSENT_MS_GRID) {
        if (mode === 'instream') {
            for (const skipParkingRatio of SKIP_PARKING_RATIO_GRID) {
                grid.push({
                    ...DEFAULT_S6_LABEL_PARAMS,
                    tabAbsentMaxMs,
                    skipParkingRatio,
                });
            }
            continue;
        }

        for (const scrollQuietMinMs of SCROLL_QUIET_MS_GRID) {
            for (const viewportAbsentMaxMs of VIEWPORT_ABSENT_MS_GRID) {
                grid.push({
                    ...DEFAULT_S6_LABEL_PARAMS,
                    tabAbsentMaxMs,
                    scrollQuietMinMs,
                    viewportAbsentMaxMs,
                });
            }
        }
    }

    return grid;
}

// Присутствие зрителя у экрана: вкладка активна и окно в фокусе. Допуск общий —
// мгновенная потеря фокуса от системного уведомления уходом зрителя не является,
// по той же причине, по которой допуск введён для ухода из вкладки (§5.4)
function isViewerPresent(
    input: S6LabelInput,
    params: S6LabelParams,
): boolean {
    if (input.tabAbsentMaxMs !== null && input.tabAbsentMaxMs > params.tabAbsentMaxMs) {
        return false;
    }

    if (
        input.windowUnfocusedMaxMs !== null &&
        input.windowUnfocusedMaxMs > params.tabAbsentMaxMs
    ) {
        return false;
    }

    return true;
}

/**
 * Показ пригоден для разметки: поля жёстких условий его формата заполнены.
 * Показ без них не метится ни положительно, ни отрицательно — он выбывает
 * из выборки, и порог её размера считается по пригодным данным
 */
export function isS6Labelable(
    input: S6LabelInput,
    mode: S6Mode,
): boolean {
    if (input.tabAbsentMaxMs === null) return false;
    if (input.windowUnfocusedMaxMs === null) return false;

    if (mode === 'instream') return true;

    if (input.subtype === 'sticky') return input.scrollQuietMaxMs !== null;
    if (input.subtype === 'inpage') return input.surfaceAbsentMaxMs !== null;

    return false;
}

// Ожидание на кнопке пропуска: курсор держался в её зоне и ни разу не уходил в сторону.
// Одна доля времени такого зрителя не выделяет — тот, кто не трогает мышь, даёт ту же
// долю, поэтому второе поле обязательно. Признак неприменим без кнопки и без курсора
function isParkedOnSkip(
    input: S6LabelInput,
    params: S6LabelParams,
): boolean {
    if (input.skipZoneHoverRatio === null) return false;
    if (input.skipZoneMovedOutside !== false) return false;

    return input.skipZoneHoverRatio >= params.skipParkingRatio;
}

/**
 * Метка обучения: 1, когда выполнены все жёсткие условия присутствия формата.
 *
 * In-stream (§5.2): вкладка активна, окно в фокусе, нет ожидания на кнопке пропуска.
 * Out-stream закреплённый (§5.3): вкладка активна, окно в фокусе, прокрутка
 * остановлена не менее порога — окно область просмотра не покидает.
 * Out-stream встроенный (§6.3): вкладка активна, окно в фокусе, поверхность не уходила
 * из области просмотра дольше порога — остановка прокрутки к нему неприменима,
 * воспроизведение и так встаёт на паузу при уходе.
 */
export function computeS6Label(
    input: S6LabelInput,
    mode: S6Mode,
    params: S6LabelParams,
): number {
    if (!isViewerPresent(input, params)) return 0;

    if (mode === 'instream') {
        return isParkedOnSkip(input, params) ? 0 : 1;
    }

    if (input.subtype === 'sticky') {
        const quietMs = input.scrollQuietMaxMs ?? 0;
        return quietMs >= params.scrollQuietMinMs ? 1 : 0;
    }

    if (input.subtype === 'inpage') {
        const absentMs = input.surfaceAbsentMaxMs ?? 0;
        return absentMs <= params.viewportAbsentMaxMs ? 1 : 0;
    }

    return 0;
}