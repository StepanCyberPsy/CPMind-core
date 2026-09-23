import { DeliveryAdvanceResponseSchema } from '@cpmind/shared';
import type { AdSessionId } from '@cpmind/shared';

export interface AdvanceRequest {
    endpoint: string;
    deliveryToken: string;
    adSessionId: AdSessionId;
}

/**
 * Продвигает рекламную сессию к следующему ролику набора перед новым циклом.
 * Отказ перехода не прерывает показ: цикл повторяется с прежним роликом,
 * остановка рекламы была бы худшим исходом, чем повтор
 */
export async function requestNextCreative(
    request: AdvanceRequest,
): Promise<boolean> {
    try {
        const response = await fetch(request.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deliveryToken: request.deliveryToken,
                adSessionId: request.adSessionId,
            }),
            credentials: 'omit',
        });

        if (!response.ok) return false;

        const data = await response.json() as unknown;
        return DeliveryAdvanceResponseSchema.safeParse(data).success;
    } catch {
        return false;
    }
}