import type {
    DeliveryEventPayload,
    MeasurementFinalizationReason,
} from '@cpmind/shared';
import type { Session, SdkSignalConfig } from '../types.js';
import type { SessionPayloadMeta } from '../session.js';
import { buildPayload } from '../session.js';
import { onS6Skip } from '../signals/s6.js';

// segment — финальная отправка сегмента при разрыве по простою.
// checkpoint — промежуточный снимок текущего сегмента, перезаписывается следующей отправкой.
// final — финальная отправка показа, повторные вызовы переотправляют закэшированный payload
export type SendKind =
    | 'segment'
    | 'checkpoint'
    | 'final';

export interface SendOptions {
    kind: SendKind;
    finalizationReason?: MeasurementFinalizationReason | null;
}

const CLICK_CHECKPOINT_MIN_INTERVAL_MS = 1_000;

const finalizedPayloads = new WeakMap<Session, string>();

export function finalizeAndSend(
    session: Session,
    meta: SessionPayloadMeta,
    config: SdkSignalConfig,
    options: SendOptions,
): void {
    if (session.timestampStart === 0) return;

    if (options.kind === 'final') {
        const cached = finalizedPayloads.get(session);
        if (cached !== undefined) {
            sendPayload(cached, meta.endpoint);
            return;
        }
    }

    if (session.sent) return;

    const isCheckpoint = options.kind === 'checkpoint';

    // Промежуточный снимок не фиксирует конец сегмента — timestamp_end берётся на момент отправки
    if (!isCheckpoint) {
        session.timestampEnd = Date.now();
        session.sent = options.kind === 'final';
    }

    const payload = buildPayload(session, meta, {
        checkpoint: isCheckpoint,
        finalizationReason: options.finalizationReason ?? null,
    });
    const serialized = JSON.stringify(payload);

    if (options.kind === 'final') {
        finalizedPayloads.set(session, serialized);
    }

    if (config.debug) {
        console.log('[CPMind] Payload:', options.kind, JSON.stringify(payload, null, 2));
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

// keepalive — терминальные события отправляются в момент выгрузки страницы
export async function sendDeliveryEvent(
    payload: DeliveryEventPayload,
    endpoint: string,
): Promise<void> {
    await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: 'omit',
    });
}

// Возвращает функцию снятия обработчиков — вызывается при финализации показа
export function attachUnloadHandlers(
    creativeEl: HTMLElement,
    session: Session,
    meta: SessionPayloadMeta,
    config: SdkSignalConfig,
    cleanupPresence?: () => void,
): () => void {
    let lastClickCheckpointAt = 0;

    // Click — промежуточный снимок до возможной навигации (Mobile Safari).
    // Клик по креативу и контролам плеера показ не завершает
    const onClick = (e: MouseEvent): void => {
        if (session.s6 !== null) {
            const target = e.target;
            if (target instanceof Element && target.closest('[data-cpmind-skip]') !== null) {
                onS6Skip(session.s6);
            }
        }

        const now = Date.now();
        if (now - lastClickCheckpointAt < CLICK_CHECKPOINT_MIN_INTERVAL_MS) return;
        lastClickCheckpointAt = now;

        finalizeAndSend(session, meta, config, { kind: 'checkpoint' });
    };

    // Скрытие вкладки — промежуточный снимок: мобильные браузеры выгружают скрытые
    // вкладки без pagehide. Показ и таймер простоя продолжают работать
    const onVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') {
            finalizeAndSend(session, meta, config, { kind: 'checkpoint' });
        }
    };

    // pagehide — финальная отправка при закрытии вкладки, навигации и bfcache
    const onPageHide = (): void => {
        finalizeAndSend(session, meta, config, {
            kind: 'final',
            finalizationReason: 'page_unload',
        });
        cleanupPresence?.();
        detach();
    };

    function detach(): void {
        creativeEl.removeEventListener('click', onClick, { capture: true });
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
    }

    creativeEl.addEventListener('click', onClick, { capture: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return detach;
}