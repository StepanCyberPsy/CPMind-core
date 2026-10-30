import { describe, expect, it } from 'vitest';
import {
    S6_PLACEMENT_GROUPS,
    S6_PLACEMENT_GROUP_FILTERS,
    buildS6SegmentKey,
    buildS6ModeSegmentKey,
    buildS6ModeGlobalSegmentKey,
    resolveS6Mode,
    resolveS6PlacementGroup,
    resolveS6SegmentKeys,
} from '../src/scoring/segments.js';

describe('resolveS6PlacementGroup', () => {

    it('делит in-stream по признаку пропуска', () => {
        expect(resolveS6PlacementGroup('instream', 'preroll', true)).toBe('instream_skippable');
        expect(resolveS6PlacementGroup('instream', 'preroll', false)).toBe('instream_non_skippable');
    });

    it('не различает точки вставки in-stream', () => {
        // Характер вовлечённости от точки вставки не зависит — группу задаёт формат
        for (const subtype of ['preroll', 'midroll', 'postroll'] as const) {
            expect(resolveS6PlacementGroup('instream', subtype, true)).toBe('instream_skippable');
        }
    });

    it('делит out-stream по подтипу и игнорирует признак пропуска', () => {
        expect(resolveS6PlacementGroup('outstream', 'sticky', true)).toBe('outstream_sticky');
        expect(resolveS6PlacementGroup('outstream', 'sticky', false)).toBe('outstream_sticky');
        expect(resolveS6PlacementGroup('outstream', 'inpage', true)).toBe('outstream_inpage');
        expect(resolveS6PlacementGroup('outstream', 'inpage', false)).toBe('outstream_inpage');
    });

    it('не относит баннер и out-stream без подтипа к группе видео', () => {
        expect(resolveS6PlacementGroup('banner', null, true)).toBeNull();
        expect(resolveS6PlacementGroup('outstream', null, true)).toBeNull();
        expect(resolveS6PlacementGroup(null, null, true)).toBeNull();
    });
});

describe('resolveS6SegmentKeys', () => {

    it('показ legacy-тега получает только сегмент прежней схемы', () => {
        // Формат у такого показа неизвестен, цепочка режима неприменима
        expect(resolveS6SegmentKeys('desktop', null, null, true)).toEqual(['desktop|skippable']);
        expect(resolveS6SegmentKeys('tablet', null, null, false)).toEqual(['tablet|non_skippable']);
    });

    it('строит цепочку приоритета для in-stream', () => {
        expect(resolveS6SegmentKeys('desktop', 'instream', 'preroll', true)).toEqual([
            'instream|desktop|skippable',
            'instream|desktop',
            'instream|global',
            'desktop|skippable',
        ]);

        expect(resolveS6SegmentKeys('mobile', 'instream', 'midroll', false)).toEqual([
            'instream|mobile|non_skippable',
            'instream|mobile',
            'instream|global',
            'mobile|non_skippable',
        ]);
    });

    it('строит цепочку приоритета для out-stream', () => {
        expect(resolveS6SegmentKeys('mobile', 'outstream', 'sticky', true)).toEqual([
            'outstream_sticky|mobile',
            'outstream|mobile',
            'outstream|global',
            'mobile|non_skippable',
        ]);

        expect(resolveS6SegmentKeys('desktop', 'outstream', 'inpage', false)).toEqual([
            'outstream_inpage|desktop',
            'outstream|desktop',
            'outstream|global',
            'desktop|non_skippable',
        ]);
    });

    it('признак пропуска не влияет на цепочку out-stream', () => {
        expect(resolveS6SegmentKeys('desktop', 'outstream', 'sticky', true))
            .toEqual(resolveS6SegmentKeys('desktop', 'outstream', 'sticky', false));
    });

    it('цепочки режимов не пересекаются', () => {
        // Показ in-stream никогда не получает модель, обученную на out-stream
        const instream = resolveS6SegmentKeys('desktop', 'instream', 'preroll', true);
        const outstream = resolveS6SegmentKeys('desktop', 'outstream', 'inpage', true);

        expect(instream.some((key) => key.startsWith('outstream'))).toBe(false);
        expect(outstream.some((key) => key.startsWith('instream'))).toBe(false);
    });

    it('формат без группы сводится к сегменту прежней схемы', () => {
        expect(resolveS6SegmentKeys('desktop', 'banner', null, false)).toEqual(['desktop|non_skippable']);
    });
});

describe('S6_PLACEMENT_GROUP_FILTERS', () => {

    it('согласован с определением группы', () => {
        for (const group of S6_PLACEMENT_GROUPS) {
            const filter = S6_PLACEMENT_GROUP_FILTERS[group];
            const skippable = filter.skippable ?? false;

            expect(resolveS6PlacementGroup(filter.format, filter.subtype, skippable)).toBe(group);

            expect(resolveS6SegmentKeys('desktop', filter.format, filter.subtype, skippable)[0])
                .toBe(buildS6SegmentKey('desktop', group));
        }
    });

    it('каждая группа отнесена к своему режиму', () => {
        for (const group of S6_PLACEMENT_GROUPS) {
            const mode = resolveS6Mode(group);
            expect(group.startsWith(mode)).toBe(true);

            const keys = resolveS6SegmentKeys(
                'desktop',
                S6_PLACEMENT_GROUP_FILTERS[group].format,
                S6_PLACEMENT_GROUP_FILTERS[group].subtype,
                S6_PLACEMENT_GROUP_FILTERS[group].skippable ?? false,
            );

            expect(keys[1]).toBe(buildS6ModeSegmentKey('desktop', mode));
            expect(keys[2]).toBe(buildS6ModeGlobalSegmentKey(mode));
        }
    });
});
