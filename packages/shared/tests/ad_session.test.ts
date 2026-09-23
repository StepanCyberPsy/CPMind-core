import {
    describe,
    expect,
    it,
} from 'vitest';
import { DeliveryEventPayloadSchema } from '../src/schemas/ad_session.js';

const BASE_PAYLOAD = {
    adSessionId: '5b0f1f7e-3c1a-4f3e-9a51-2f6f1b7c8d90',
    timestampMs: 1_789_000_000_000,
};

describe('DeliveryEventPayloadSchema', () => {
    it('требует все поля результата автозапуска для autoplay_resolved', () => {
        const partial = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'autoplay_resolved',
            autoplayOutcome: 'blocked',
        });
        const complete = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'autoplay_resolved',
            autoplayOutcome: 'started',
            startMuted: true,
            mutedByBrowser: true,
        });

        expect(partial.success).toBe(false);
        expect(complete.success).toBe(true);
    });

    it('запрещает поля автозапуска для других событий', () => {
        const result = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'measurement_started',
            startMuted: false,
        });

        expect(result.success).toBe(false);
    });

    it('допускает причину финализации только для терминальных событий', () => {
        const closed = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'closed',
            finalizationReason: 'complete',
        });
        const rendered = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'render_confirmed',
            finalizationReason: 'complete',
        });

        expect(closed.success).toBe(true);
        expect(rendered.success).toBe(false);
    });

    it('допускает код ошибки только для событий ошибки', () => {
        const failed = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'player_error',
            errorCode: 'VAST_FETCH_TIMEOUT',
            finalizationReason: 'error',
        });
        const closed = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'closed',
            errorCode: 'MEDIA_LOAD_FAILED',
        });

        expect(failed.success).toBe(true);
        expect(closed.success).toBe(false);
    });

    it('принимает событие без дополнительных полей', () => {
        const result = DeliveryEventPayloadSchema.safeParse({
            ...BASE_PAYLOAD,
            eventType: 'measurement_started',
        });

        expect(result.success).toBe(true);
    });
});