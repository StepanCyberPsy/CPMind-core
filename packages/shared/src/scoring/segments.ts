import {
    isInstreamFormat,
    isSelfMountedFormat,
    type PlacementFormat,
} from '../schemas/delivery.js';
import type { DeviceType } from '../schemas/creative.js';

// Группы размещения видео для сегментации модели S6. In-stream стартует со звуком и имеет
// кнопку пропуска, out-stream стартует без звука по видимости — поведение несопоставимо
export const S6_PLACEMENT_GROUPS = [
    'instream_skippable',
    'instream_non_skippable',
    'outstream',
] as const;

export type S6PlacementGroup = typeof S6_PLACEMENT_GROUPS[number];

// Критерии отбора показов группы. skippable = null — признак пропуска не участвует в отборе
export interface S6PlacementGroupFilter {
    format: PlacementFormat;
    skippable: boolean | null;
}

export const S6_PLACEMENT_GROUP_FILTERS: Readonly<Record<S6PlacementGroup, S6PlacementGroupFilter>> = {
    instream_skippable: {
        format: 'instream',
        skippable: true,
    },
    instream_non_skippable: {
        format: 'instream',
        skippable: false,
    },
    outstream: {
        format: 'outstream',
        skippable: null,
    },
};

// Сегмент предыдущей схемы для каждой группы — модели, обученные до разделения по формату
const LEGACY_SKIPPABLE_PART: Readonly<Record<S6PlacementGroup, 'skippable' | 'non_skippable'>> = {
    instream_skippable: 'skippable',
    instream_non_skippable: 'non_skippable',
    outstream: 'non_skippable',
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
    return `${deviceType}|${group}`;
}

/**
 * Группа размещения видео по формату. null — показ legacy-тега или формат без группы.
 * У out-stream нет кнопки пропуска, признак skippable для него не учитывается.
 * Подтип на группу не влияет: точка вставки in-stream и способ закрепления out-stream
 * не меняют характер вовлечённости, по которому обучается модель.
 */
export function resolveS6PlacementGroup(
    format: PlacementFormat | null,
    skippable: boolean,
): S6PlacementGroup | null {
    if (format === null) return null;

    if (isInstreamFormat(format)) {
        return skippable ? 'instream_skippable' : 'instream_non_skippable';
    }

    if (isSelfMountedFormat(format)) return 'outstream';

    return null;
}

/**
 * Ключи сегментов модели S6 в порядке приоритета выбора: сегмент группы размещения,
 * затем сегмент предыдущей схемы. Показ legacy-тега получает только сегмент предыдущей схемы.
 */
export function resolveS6SegmentKeys(
    deviceType: DeviceType,
    format: PlacementFormat | null,
    skippable: boolean,
): string[] {
    const group = resolveS6PlacementGroup(format, skippable);

    if (group === null) {
        return [buildLegacyS6SegmentKey(deviceType, skippable)];
    }

    return [
        buildS6SegmentKey(deviceType, group),
        `${deviceType}|${LEGACY_SKIPPABLE_PART[group]}`,
    ];
}