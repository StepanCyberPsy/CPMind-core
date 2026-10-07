import {
    isInstreamFormat,
    isSelfMountedFormat,
    type PlacementFormat,
    type PlacementSubtype,
} from '../schemas/delivery.js';
import type { DeviceType } from '../schemas/creative.js';

// Группы размещения видео для сегментации моделей S6. In-stream стартует со звуком
// и имеет кнопку пропуска. Закреплённое окно out-stream видно с момента монтирования
// и прокрутку не покидает, встроенное уходит из области просмотра и встаёт на паузу —
// досмотр в них распределён по-разному и общая нормировка исказила бы обе выборки
export const S6_PLACEMENT_GROUPS = [
    'instream_skippable',
    'instream_non_skippable',
    'outstream_sticky',
    'outstream_inpage',
] as const;

export type S6PlacementGroup = typeof S6_PLACEMENT_GROUPS[number];

// Режим показа. Модели режимов независимы: выборка одного в обучение другого не входит
export const S6_MODES = [
    'instream',
    'outstream',
] as const;

export type S6Mode = typeof S6_MODES[number];

const GROUP_MODES: Readonly<Record<S6PlacementGroup, S6Mode>> = {
    instream_skippable: 'instream',
    instream_non_skippable: 'instream',
    outstream_sticky: 'outstream',
    outstream_inpage: 'outstream',
};

// Критерии отбора показов группы. skippable = null — признак пропуска не участвует
// в отборе, subtype = null — подтип не участвует
export interface S6PlacementGroupFilter {
    format: PlacementFormat;
    subtype: PlacementSubtype | null;
    skippable: boolean | null;
}

export const S6_PLACEMENT_GROUP_FILTERS: Readonly<Record<S6PlacementGroup, S6PlacementGroupFilter>> = {
    instream_skippable: {
        format: 'instream',
        subtype: null,
        skippable: true,
    },
    instream_non_skippable: {
        format: 'instream',
        subtype: null,
        skippable: false,
    },
    outstream_sticky: {
        format: 'outstream',
        subtype: 'sticky',
        skippable: null,
    },
    outstream_inpage: {
        format: 'outstream',
        subtype: 'inpage',
        skippable: null,
    },
};

// Сегмент предыдущей схемы для каждой группы — модели, обученные до разделения по режиму.
// Показы legacy-тега обслуживаются только этим уровнем: формат у них не определён
const LEGACY_SKIPPABLE_PART: Readonly<Record<S6PlacementGroup, 'skippable' | 'non_skippable'>> = {
    instream_skippable: 'skippable',
    instream_non_skippable: 'non_skippable',
    outstream_sticky: 'non_skippable',
    outstream_inpage: 'non_skippable',
};

function buildLegacyS6SegmentKey(
    deviceType: DeviceType,
    skippable: boolean,
): string {
    return `${deviceType}|${skippable ? 'skippable' : 'non_skippable'}`;
}

/**
 * Ключ сегмента модели S6 для группы размещения. Единственный источник формата ключа
 * для расчёта Score и для задачи рекалибровки.
 */
export function buildS6SegmentKey(
    deviceType: DeviceType,
    group: S6PlacementGroup,
): string {
    if (group === 'instream_skippable') return `instream|${deviceType}|skippable`;
    if (group === 'instream_non_skippable') return `instream|${deviceType}|non_skippable`;
    return `${group}|${deviceType}`;
}

/**
 * Ключ уровня режима и устройства. Модель этого уровня обучается на объединённой выборке
 * групп режима и применяется, пока у группы нет собственной активной модели.
 */
export function buildS6ModeSegmentKey(
    deviceType: DeviceType,
    mode: S6Mode,
): string {
    return `${mode}|${deviceType}`;
}

/**
 * Ключ уровня режима без устройства — последний обучаемый уровень цепочки режима.
 */
export function buildS6ModeGlobalSegmentKey(mode: S6Mode): string {
    return `${mode}|global`;
}

export function resolveS6Mode(group: S6PlacementGroup): S6Mode {
    return GROUP_MODES[group];
}

/**
 * Группа размещения видео по формату и подтипу. null — показ legacy-тега либо формат
 * без группы. У out-stream нет кнопки пропуска, признак skippable для него не учитывается.
 * Подтип in-stream на группу не влияет: точка вставки рекламы в контент издателя
 * не меняет характер вовлечённости, по которому обучается модель.
 * Подтип out-stream группу задаёт: закреплённое окно не покидает область просмотра,
 * встроенное уходит из неё вместе с содержимым страницы.
 */
export function resolveS6PlacementGroup(
    format: PlacementFormat | null,
    subtype: PlacementSubtype | null,
    skippable: boolean,
): S6PlacementGroup | null {
    if (format === null) return null;

    if (isInstreamFormat(format)) {
        return skippable ? 'instream_skippable' : 'instream_non_skippable';
    }

    if (isSelfMountedFormat(format)) {
        if (subtype === 'sticky') return 'outstream_sticky';
        if (subtype === 'inpage') return 'outstream_inpage';
        return null;
    }

    return null;
}

/**
 * Ключи сегментов модели S6 в порядке приоритета выбора: группа размещения, режим
 * с устройством, режим целиком, сегмент предыдущей схемы. Цепочки режимов независимы —
 * показ in-stream никогда не получает модель, обученную на out-stream.
 * Показ legacy-тега получает только сегмент предыдущей схемы: режим у него неизвестен.
 */
export function resolveS6SegmentKeys(
    deviceType: DeviceType,
    format: PlacementFormat | null,
    subtype: PlacementSubtype | null,
    skippable: boolean,
): string[] {
    const group = resolveS6PlacementGroup(format, subtype, skippable);

    if (group === null) {
        return [buildLegacyS6SegmentKey(deviceType, skippable)];
    }

    const mode = GROUP_MODES[group];

    return [
        buildS6SegmentKey(deviceType, group),
        buildS6ModeSegmentKey(deviceType, mode),
        buildS6ModeGlobalSegmentKey(mode),
        `${deviceType}|${LEGACY_SKIPPABLE_PART[group]}`,
    ];
}