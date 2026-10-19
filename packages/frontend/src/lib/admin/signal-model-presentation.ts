import type { S2ConfigRow } from './api';
import {
    S6_PLACEMENT_GROUPS,
    S6_MODES,
    buildS6SegmentKey,
    buildS6ModeSegmentKey,
    buildS6ModeGlobalSegmentKey,
    resolveS6Mode,
} from '@cpmind/shared';
import type { S6Mode } from '@cpmind/shared';

export type S6Section = S6Mode | 'other';
export type S6DeviceTab = 'desktop' | 'mobile' | 'tablet' | 'common';

interface S6SegmentPresentation {
    section: S6Section;
    device: S6DeviceTab | null;
}

const s6Segments = new Map<string, S6SegmentPresentation>();

for (const device of ['desktop', 'mobile', 'tablet'] as const) {
    for (const group of S6_PLACEMENT_GROUPS) {
        s6Segments.set(buildS6SegmentKey(device, group), {section: resolveS6Mode(group), device});
    }
    for (const mode of S6_MODES) {
        s6Segments.set(buildS6ModeSegmentKey(device, mode), {section: mode, device});
    }
}
for (const mode of S6_MODES) {
    s6Segments.set(buildS6ModeGlobalSegmentKey(mode), {section: mode, device: 'common'});
}

export function getS6SegmentPresentation(segmentKey: string): Readonly<S6SegmentPresentation> {
    return s6Segments.get(segmentKey) ?? {section: 'other', device: null};
}

export function formatS6Rate(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
}

export function formatS6Threshold(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—';
}

type S2Quantiles = Pick<S2ConfigRow, 'quantileLevels' | 'quantileValues'>;

export function getS2QuantileLevels(configs: readonly S2Quantiles[]): number[] {
    return Array.from(new Set(configs.flatMap((config) => config.quantileLevels)))
        .filter((level) => Number.isFinite(level) && level >= 0 && level <= 1)
        .sort((a, b) => a - b);
}

export function getS2QuantileValue(config: S2Quantiles, level: number): number | null {
    if (config.quantileLevels.length !== config.quantileValues.length) return null;
    const index = config.quantileLevels.indexOf(level);
    const value = config.quantileValues[index];
    return value !== undefined && Number.isFinite(value) ? value : null;
}
