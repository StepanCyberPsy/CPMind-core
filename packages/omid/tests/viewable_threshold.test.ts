import { describe, expect, it } from 'vitest';
import { DEFAULT_TAG_CONSTANTS } from '@cpmind/shared';
import { VIEWABLE_PERCENT, MAX_INTERVAL_MS } from '../src/limited.js';

describe('порог видимости', () => {

    // Константа продублирована в пакете, чтобы не тянуть zod и схемы в бандл
    // стороннего плеера. Тест — единственное, что удерживает значения вместе
    it('совпадает с порогом S1 из констант тега', () => {
        const thresholds = DEFAULT_TAG_CONSTANTS.S1_VIEWPORT_THRESHOLDS
            .filter((t) => t > 0 && t < 1);

        expect(thresholds).toHaveLength(1);
        expect(VIEWABLE_PERCENT).toBe(thresholds[0]! * 100);
    });
});

describe('потолок интервала наблюдения', () => {

    // Интервал длиннее порога присутствия не может быть непрерывным просмотром:
    // по определению продукта зрителя за экраном уже нет
    it('совпадает с порогом присутствия из констант тега', () => {
        expect(MAX_INTERVAL_MS).toBe(DEFAULT_TAG_CONSTANTS.PRESENCE_IDLE_TIMEOUT_MS);
    });
});
