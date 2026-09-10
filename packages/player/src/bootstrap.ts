import type { DeliveryRuntimeConfig } from '@cpmind/shared';
import { CPMindPlayer } from './public_api.js';

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

// instream_* требует HTMLVideoElement контентного плеера издателя — embed-контракт
// его не передаёт, автоматическое монтирование невозможно. Такие entry пропускаются:
// интеграция выполняется вызовом CPMindPlayer.attachNative со стороны страницы
const SELF_MOUNTED_MODES = new Set<string>([
    'outstream',
    'standalone_video',
]);

// Защита от повторного монтирования: mountOutstream создаёт video-элемент и
// IntersectionObserver, повторная обработка того же entry дала бы два плеера
const mounted = new WeakSet<PlayerQueueEntry>();

function processEntry(entry: PlayerQueueEntry): void {
    if (entry.creativeType !== 'video_creative') return;
    if (!SELF_MOUNTED_MODES.has(entry.deliveryMode)) return;
    if (mounted.has(entry)) return;

    mounted.add(entry);

    try {
        CPMindPlayer.mountOutstream({
            container: entry.container,
            deliveryConfig: entry,
        });
    } catch {
        // Сбой одной сессии не прерывает обработку остальных entry
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