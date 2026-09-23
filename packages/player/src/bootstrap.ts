import {
    AdSessionIdSchema,
    isInstreamFormat,
    isSelfMountedFormat,
    type AdSessionId,
    type DeliveryRuntimeConfig,
    type InstreamSubtype,
} from '@cpmind/shared';
import { CPMindPlayer } from './public_api.js';
import { observeContentVideos } from './lifecycle/discovery.js';

// Очередь заполняется embed-скриптом до загрузки bundle. Entry расширяет
// DeliveryRuntimeConfig теми же runtime-полями, что и в display-runtime
export interface PlayerQueueEntry extends DeliveryRuntimeConfig {
    container: HTMLElement;
    assetUrl: string;
}

declare global {
    interface Window {
        __CPMIND_QUEUE__: PlayerQueueEntry[];
    }
}

// Подтип in-stream задаёт точку вставки. Отсутствие подтипа в конфигурации
// приводится к pre-roll — прежнему единственному поддерживаемому варианту
const DEFAULT_INSTREAM_SUBTYPE: InstreamSubtype = 'preroll';

function resolveInstreamSubtype(entry: PlayerQueueEntry): InstreamSubtype {
    const subtype = entry.subtype;

    return subtype === 'preroll' ||
        subtype === 'midroll' ||
        subtype === 'postroll' ||
        subtype === 'pauseroll'
        ? subtype
        : DEFAULT_INSTREAM_SUBTYPE;
}

// Защита от повторного монтирования: mountOutstream создаёт video-элемент и
// IntersectionObserver, повторная обработка того же entry дала бы два плеера
const mounted = new WeakSet<PlayerQueueEntry>();

// Наблюдатели и контроллеры живут до выгрузки страницы: MutationObserver на
// documentElement с subtree сканирует DOM издателя на каждой мутации, а привязка
// к content video держит слушатель на чужом элементе
const releasables: Array<{ destroy(): void }> = [];
let unloadHandlerAttached = false;

function registerReleasable(releasable: { destroy(): void }): void {
    releasables.push(releasable);

    if (unloadHandlerAttached) return;
    unloadHandlerAttached = true;

    window.addEventListener('pagehide', () => {
        for (const item of releasables.splice(0)) {
            try {
                item.destroy();
            } catch {
                // Сбой освобождения одного ресурса не прерывает остальные
            }
        }
    }, { once: true });
}

async function requestAdSessionId(
    entry: PlayerQueueEntry,
): Promise<AdSessionId> {
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

// Привязка in-stream ко всем content video, попадающим под селектор placement.
// Ad-сессия запрашивается в момент старта рекламы, а не привязки: иначе каждое
// найденное видео создавало бы сессию, которая в большинстве случаев не воспроизведётся
function attachInstream(entry: PlayerQueueEntry): void {
    const subtype = resolveInstreamSubtype(entry);

    const discovery = observeContentVideos({
        selector: entry.videoSelector,
        onVideoFound(contentVideo: HTMLVideoElement): void {
            try {
                const controller = CPMindPlayer.attachNative({
                    contentVideo,
                    deliveryConfig: entry,
                    subtype,
                    resolveAdSessionId: () => requestAdSessionId(entry),
                });
                registerReleasable(controller);
            } catch {
                // Сбой привязки одного элемента не прерывает наблюдение
            }
        },
    });

    registerReleasable(discovery);
}

function processEntry(entry: PlayerQueueEntry): void {
    if (entry.creativeType !== 'video_creative') return;
    if (mounted.has(entry)) return;

    if (isSelfMountedFormat(entry.format)) {
        const adSessionId = entry.adSessionId;

        // Self-mounted форматы получают сессию вместе с embed-скриптом
        if (adSessionId === null) return;

        mounted.add(entry);

        const deliveryConfig = {
            ...entry,
            adSessionId,
        };

        try {
            const controller = entry.subtype === 'sticky'
                ? CPMindPlayer.mountSticky({
                    container: entry.container,
                    deliveryConfig,
                })
                : CPMindPlayer.mountOutstream({
                    container: entry.container,
                    deliveryConfig,
                });

            registerReleasable(controller);
        } catch {
            // Сбой одной сессии не прерывает обработку остальных entry
        }

        return;
    }

    if (isInstreamFormat(entry.format)) {
        mounted.add(entry);
        attachInstream(entry);
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