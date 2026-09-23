import { describe, expect, it } from 'vitest';
import {
    S6_PLACEMENT_GROUPS,
    S6_PLACEMENT_GROUP_FILTERS,
    buildS6SegmentKey,
    resolveS6PlacementGroup,
    resolveS6SegmentKeys,
} from '../src/scoring/segments.js';

describe('resolveS6SegmentKeys', () => {
    it('возвращает прежний сегмент для показа legacy-тега', () => {
        expect(resolveS6SegmentKeys('desktop', null, true)).toEqual(['desktop|skippable']);
        expect(resolveS6SegmentKeys('tablet', null, false)).toEqual(['tablet|non_skippable']);
    });

    it('разделяет in-stream по признаку пропуска с откатом на прежний сегмент', () => {
        expect(resolveS6SegmentKeys('desktop', 'instream', true)).toEqual([
            'desktop|instream_skippable',
            'desktop|skippable',
        ]);
        expect(resolveS6SegmentKeys('mobile', 'instream', false)).toEqual([
            'mobile|instream_non_skippable',
            'mobile|non_skippable',
        ]);
    });

    it('игнорирует признак пропуска для out-stream', () => {
        expect(resolveS6SegmentKeys('mobile', 'outstream', true)).toEqual([
            'mobile|outstream',
            'mobile|non_skippable',
        ]);
        expect(resolveS6SegmentKeys('desktop', 'outstream', false)).toEqual([
            'desktop|outstream',
            'desktop|non_skippable',
        ]);
    });

    it('не относит баннерный формат к группе видео', () => {
        expect(resolveS6PlacementGroup('banner', true)).toBeNull();
        expect(resolveS6SegmentKeys('desktop', 'banner', false)).toEqual(['desktop|non_skippable']);
    });

    // Точка вставки in-stream и способ закрепления out-stream не меняют характер
    // вовлечённости, по которому обучается модель — сегмент определяет только формат
    it('не различает подтипы внутри формата', () => {
        expect(resolveS6SegmentKeys('desktop', 'instream', true))
            .toEqual(resolveS6SegmentKeys('desktop', 'instream', true));
        expect(resolveS6PlacementGroup('outstream', true))
            .toBe(resolveS6PlacementGroup('outstream', false));
    });
});

describe('S6_PLACEMENT_GROUP_FILTERS', () => {
    it('согласован с определением группы по формату', () => {
        for (const group of S6_PLACEMENT_GROUPS) {
            const filter = S6_PLACEMENT_GROUP_FILTERS[group];
            const skippable = filter.skippable ?? false;

            expect(resolveS6PlacementGroup(filter.format, skippable)).toBe(group);

            expect(resolveS6SegmentKeys('desktop', filter.format, skippable)[0])
                .toBe(buildS6SegmentKey('desktop', group));
        }
    });
});