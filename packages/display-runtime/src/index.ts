import type { DisplayQueueEntry } from './types.js';
import {
    createDisplaySessionContext,
    prepareDisplayMeasurement,
    startDisplayMeasurement,
    destroyDisplaySession,
    sendDisplayEvent,
    type DisplaySessionContext,
} from './session.js';
import { mountSurface } from './mount.js';
import { runStaticFlow } from './static.js';
import { runHtml5Flow } from './iframe.js';
import { createPendingDisplay, type PendingDisplay } from './viewport.js';

// video_creative обрабатывается Player bundle — display-runtime его не рендерит
const DISPLAY_TYPES = new Set<string>(['banner_static', 'banner_gif', 'banner_html5']);

async function runDisplayFlowAsync(entry: DisplayQueueEntry): Promise<void> {
    let ctx: DisplaySessionContext | null = null;
    let pending: PendingDisplay | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
        ctx = createDisplaySessionContext(entry);
        pending = createPendingDisplay(entry.container);
        const lifecycle = pending;
        timeoutId = setTimeout(() => lifecycle.cancel('timeout'), entry.timeouts.adLoadTotalMs);
        sendDisplayEvent(ctx, 'requested');

        if (pending.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        mountSurface(entry.container, entry);
        sendDisplayEvent(ctx, 'asset_load_started');

        if (entry.creativeType === 'banner_html5') {
            await runHtml5Flow(ctx, entry, pending.signal);
        } else {
            await runStaticFlow(ctx, entry, pending.signal);
        }

        if (pending.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        sendDisplayEvent(ctx, 'render_confirmed');
        clearTimeout(timeoutId);
        timeoutId = null;

        const measurementStartedAt = await pending.waitForViewportEntry();
        if (!entry.container.isConnected) pending.cancel('creative_removed');
        if (pending.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        pending.dispose();

        prepareDisplayMeasurement(ctx, entry.container);
        startDisplayMeasurement(ctx, measurementStartedAt);

    } catch (err) {
        if (ctx !== null) {
            const reason = pending?.cancellationReason;
            if (reason === 'page_unload' || reason === 'creative_removed') {
                sendDisplayEvent(ctx, 'closed', { finalizationReason: reason });
                destroyDisplaySession(ctx, reason);
            } else {
                const isTimeout = reason === 'timeout';
                sendDisplayEvent(ctx, 'creative_error', {
                    errorCode: isTimeout ? 'MEDIA_START_TIMEOUT' : 'MEDIA_LOAD_FAILED',
                    finalizationReason: isTimeout ? 'timeout' : 'error',
                });
                destroyDisplaySession(ctx, isTimeout ? 'timeout' : 'error');
            }
        }
    } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        pending?.dispose();
    }
}

function processEntry(entry: DisplayQueueEntry): void {
    if (!DISPLAY_TYPES.has(entry.creativeType)) return;
    runDisplayFlowAsync(entry).catch(() => {
        // Ошибки отдельных сессий не ломают runtime
    });
}

// Инициализация очереди и перехват будущих push-вызовов
try {
    if (!Array.isArray(window.__CPMIND_QUEUE__)) {
        window.__CPMIND_QUEUE__ = [];
    }

    const queue = window.__CPMIND_QUEUE__;

    for (const entry of queue) {
        processEntry(entry);
    }

    // GTM-style async pattern: перехватываем push после загрузки runtime.
    // Предыдущий push сохраняется и вызывается: loader перехватывает push для
    // подгрузки runtime по creativeType, а на странице может быть загружен player.
    // Замена на Array.prototype.push разорвала бы цепочку обработчиков
    const previousPush = queue.push;

    queue.push = (...entries: DisplayQueueEntry[]): number => {
        for (const entry of entries) {
            processEntry(entry);
        }
        return previousPush.apply(queue, entries);
    };
} catch {
    // Глобальная защита — предотвращаем падение страницы паблишера
}
