import {
    AdSessionIdSchema,
    SELF_MOUNTED_DELIVERY_MODES,
    type DeliveryRuntimeConfig,
} from '@cpmind/shared';
import { CPMindPlayer } from './public_api.js';
import { observeContentVideos } from './lifecycle/discovery.js';

// Очередь заполняется embed-скриптом до загрузки bundle. Entry расширяет
// DeliveryRuntimeConfig теми же runtime-полями, что и в display-runtime
export interface PlayerQueueEntry extends DeliveryRuntimeConfig {
    container: HTMLElement;
    campaignId: string;
    creativeId: string;
    assetUrl: string;
}

declare global {
    interface Window {
        __CPMIND_QUEUE__: PlayerQueueEntry[];
    }
}

// mid-roll и post-roll требуют точки вставки по timeupdate и события ended —
// bindNativeContent реализует перехват play, то есть исключительно pre-roll.
// Поэтому INSTREAM_DELIVERY_MODES здесь не используется: из трёх in-stream
// режимов автоматически монтируется только pre-roll
const INSTREAM_PREROLL_MODE = 'instream_preroll';

// Защита от повторного монтирования: mountOutstream создаёт video-элемент и
// IntersectionObserver, повторная обработка того же entry дала бы два плеера
const mounted = new WeakSet<PlayerQueueEntry>();

async function requestAdSessionId(
    entry: PlayerQueueEntry,
): Promise<DeliveryRuntimeConfig['adSessionId']> {
    const response = await fetch(entry.sessionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryToken: entry.deliveryToken }),
        credentials: 'omit',
    });

    if (!response.ok) {
        throw new Error('AD_SESSION_REQUEST_FAILED');
    }

    const data = await response.json() as { adSessionId?: unknown };

    return AdSessionIdSchema.parse(data.adSessionId);
}

// Привязка pre-roll ко всем content video, попадающим под селектор placement.
// Ad-сессия запрашивается в момент старта рекламы, а не привязки: иначе каждое
// найденное видео создавало бы сессию, которая в большинстве случаев не воспроизведётся
function attachPreroll(entry: PlayerQueueEntry): void {
    observeContentVideos({
        selector: entry.videoSelector,
        onVideoFound(contentVideo: HTMLVideoElement): void {
            try {
                CPMindPlayer.attachNative({
                    contentVideo,
                    deliveryConfig: entry,
                    resolveAdSessionId: () => requestAdSessionId(entry),
                });
            } catch {
                // Сбой привязки одного элемента не прерывает наблюдение
            }
        },
    });
}

function processEntry(entry: PlayerQueueEntry): void {
    if (entry.creativeType !== 'video_creative') return;
    if (mounted.has(entry)) return;

    if (SELF_MOUNTED_DELIVERY_MODES.has(entry.deliveryMode)) {
        mounted.add(entry);

        try {
            CPMindPlayer.mountOutstream({
                container: entry.container,
                deliveryConfig: entry,
            });
        } catch {
            // Сбой одной сессии не прерывает обработку остальных entry
        }

        return;
    }

    if (entry.deliveryMode === INSTREAM_PREROLL_MODE) {
        mounted.add(entry);
        attachPreroll(entry);
    }
}

export function initPlayerQueue(): void {
    if (!Array.isArray(window.__CPMIND_QUEUE__)) {
        window.__CPMIND_QUEUE__ = [];
    }

    const queue = window.__CPMIND_QUEUE__;

    for (const entry of queue) {
        processEntry(entry);
    }

    // Предыдущий push сохраняется и вызывается: на странице может быть загружен
    // display-runtime, а loader перехватывает push для подгрузки нужного runtime.
    // Замена на Array.prototype.push разорвала бы цепочку обработчиков
    const previousPush = queue.push;

    queue.push = (...entries: PlayerQueueEntry[]): number => {
        for (const entry of entries) {
            processEntry(entry);
        }
        return previousPush.apply(queue, entries);
    };
}