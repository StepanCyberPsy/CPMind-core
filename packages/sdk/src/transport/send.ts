import type { DeliveryEventPayload } from '@cpmind/shared';
import type { Session, SdkSignalConfig } from '../types.js';
import type { SessionPayloadMeta } from '../session.js';
import { buildPayload } from '../session.js';
import { onS6Skip } from '../signals/s6.js';

const finalizedPayloads = new WeakMap<Session, string>();

export function finalizeAndSend(
    session: Session,
    meta: SessionPayloadMeta,
    config: SdkSignalConfig,
    isFinal: boolean = true,
): void {
    if (session.timestampStart === 0) return;

    if (isFinal) {
        const cached = finalizedPayloads.get(session);
        if (cached !== undefined) {
            sendPayload(cached, meta.endpoint);
            return;
        }
    }

    if (session.sent) return;

    session.timestampEnd = Date.now();
    session.sent = isFinal;

    const payload = buildPayload(session, meta);
    const serialized = JSON.stringify(payload);

    if (isFinal) {
        finalizedPayloads.set(session, serialized);
    }

    if (config.debug) {
        console.log('[CPMind] Payload:', JSON.stringify(payload, null, 2));
    }

    sendPayload(serialized, meta.endpoint);
}

function sendPayload(body: string, endpoint: string): void {
    if (typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        const queued = navigator.sendBeacon(endpoint, blob);
        if (queued) return;
        // sendBeacon вернул false — очередь переполнена (64KB shared limit)
    }

    fetchKeepalive(body, endpoint);
}

function fetchKeepalive(body: string, endpoint: string): void {
    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
    }).catch(() => {
        // Страница закрывается — сетевые ошибки ожидаемы, не логируем
    });
}

export async function sendDeliveryEvent(
    payload: DeliveryEventPayload,
    endpoint: string,
): Promise<void> {
    await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export function attachUnloadHandlers(
    creativeEl: HTMLElement,
    session: Session,
    meta: SessionPayloadMeta,
    config: SdkSignalConfig,
    cleanupPresence?: () => void,
): void {
    // Click — Mobile Safari: отправляем при клике до навигации
    creativeEl.addEventListener('click', (e) => {
        if (session.s6 !== null) {
            const target = e.target as HTMLElement;
            if (target.closest('[data-cpmind-skip]') !== null) {
                onS6Skip(session.s6);
            }
        }
        finalizeAndSend(session, meta, config, true);
    }, { capture: true });

    // visibilitychange — { once: true } предотвращает accumulation при segment resets
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            finalizeAndSend(session, meta, config, true);
            cleanupPresence?.();
        }
    }, { once: true });

    // pagehide — финальный резерв для bfcache и мобильных браузеров
    window.addEventListener('pagehide', () => {
        finalizeAndSend(session, meta, config, true);
        cleanupPresence?.();
    }, { once: true });
}