import { describe, expect, it } from 'vitest';
import {
    classifyFrameInteraction,
    FRAME_ENGAGEMENT_WINDOW_MS,
    type FrameTrustObservation,
} from '../src/signals/frame_trust.js';

function desktop(
    overrides: Partial<FrameTrustObservation> = {},
): FrameTrustObservation {
    return {
        pointerOver: false,
        frameFocused: false,
        frameVisible: true,
        documentVisible: true,
        hoverCapable: true,
        userActivationActive: null,
        msSinceLastDirect: null,
        ...overrides,
    };
}

function touch(
    overrides: Partial<FrameTrustObservation> = {},
): FrameTrustObservation {
    return desktop({
        hoverCapable: false,
        ...overrides,
    });
}

describe('classifyFrameInteraction', () => {
    it('отклоняет любые события скрытой вкладки', () => {
        const observation = desktop({
            pointerOver: true,
            documentVisible: false,
        });

        expect(classifyFrameInteraction('click', observation)).toBe('rejected');
        expect(classifyFrameInteraction('activity', observation)).toBe('rejected');
    });

    it('подтверждает активность на desktop только курсором над iframe', () => {
        expect(classifyFrameInteraction('activity', desktop({ pointerOver: true }))).toBe('direct');
        expect(classifyFrameInteraction('activity', desktop({ frameFocused: true }))).toBe('rejected');
    });

    it('подтверждает клик на desktop курсором или фокусом при активации', () => {
        expect(classifyFrameInteraction('click', desktop({ frameFocused: true }))).toBe('direct');
        expect(classifyFrameInteraction('click', desktop({
            pointerOver: true,
            userActivationActive: true,
        }))).toBe('direct');
        expect(classifyFrameInteraction('click', desktop({
            pointerOver: true,
            userActivationActive: false,
        }))).toBe('rejected');
        expect(classifyFrameInteraction('click', desktop())).toBe('rejected');
    });

    it('подтверждает тап на сенсорном устройстве активацией видимого iframe', () => {
        expect(classifyFrameInteraction('tap', touch({ userActivationActive: true }))).toBe('direct');
        expect(classifyFrameInteraction('tap', touch({
            userActivationActive: true,
            frameVisible: false,
        }))).toBe('rejected');
        expect(classifyFrameInteraction('tap', touch())).toBe('rejected');
        expect(classifyFrameInteraction('tap', touch({ frameFocused: true }))).toBe('direct');
    });

    it('принимает сенсорную активность только в окне вовлечённости', () => {
        expect(classifyFrameInteraction('activity', touch({ msSinceLastDirect: 1_000 }))).toBe('window');
        expect(classifyFrameInteraction('swipe', touch({
            msSinceLastDirect: FRAME_ENGAGEMENT_WINDOW_MS,
        }))).toBe('window');
        expect(classifyFrameInteraction('zoom', touch({
            msSinceLastDirect: FRAME_ENGAGEMENT_WINDOW_MS + 1,
        }))).toBe('rejected');
        expect(classifyFrameInteraction('activity', touch())).toBe('rejected');
        expect(classifyFrameInteraction('activity', touch({
            msSinceLastDirect: 1_000,
            frameVisible: false,
        }))).toBe('rejected');
    });
});