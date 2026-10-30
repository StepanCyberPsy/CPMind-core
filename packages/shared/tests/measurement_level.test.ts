import { describe, it, expect } from 'vitest';
import {
    resolveMeasurementLevel,
    MEASUREMENT_LEVEL_LABELS,
    MEASUREMENT_LEVEL_HINTS,
    USER_VISIBLE_IMPRESSION_FIELDS,
    UserImpressionRowSchema,
} from '../src/index.js';

describe('resolveMeasurementLevel', () => {
    it('считает показ с рассчитанным Score полным', () => {
        expect(resolveMeasurementLevel({ score_final: 72.4 })).toBe('full');
    });

    it('считает полным и показ с нулевым Score', () => {
        // Ноль — валидная оценка, а не отсутствие измерения
        expect(resolveMeasurementLevel({ score_final: 0 })).toBe('full');
    });

    it('считает показ без Score частичным', () => {
        expect(resolveMeasurementLevel({ score_final: null })).toBe('partial');
    });

    it('даёт подпись и пояснение для каждого уровня', () => {
        for (const level of ['full', 'partial'] as const) {
            expect(MEASUREMENT_LEVEL_LABELS[level].length).toBeGreaterThan(0);
            expect(MEASUREMENT_LEVEL_HINTS[level].length).toBeGreaterThan(0);
        }
    });
});

describe('пользовательский контракт показа', () => {
    // Уровень выводится из score_final, который пользователю уже виден.
    // Если поле исчезнет из контракта, бейдж в кабинете начнёт лгать
    it('содержит score_final — источник уровня измерения', () => {
        expect(USER_VISIBLE_IMPRESSION_FIELDS).toContain('score_final');
        expect(UserImpressionRowSchema.shape).toHaveProperty('score_final');
    });

    // Диагностика режима измерения остаётся административной: внутренние
    // идентификаторы режимов и уровней доступа OMID в кабинет не отдаются
    it('не содержит диагностических полей режима измерения', () => {
        for (const field of ['measurement_mode', 'omid_access_mode', 'vast_delivery_kind']) {
            expect(USER_VISIBLE_IMPRESSION_FIELDS as readonly string[]).not.toContain(field);
            expect(UserImpressionRowSchema.shape).not.toHaveProperty(field);
        }
    });
});
