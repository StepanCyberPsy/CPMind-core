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

// video_creative обрабатывается Player bundle — display-runtime его не рендерит
const DISPLAY_TYPES = new Set<string>(['banner_static', 'banner_gif', 'banner_html5']);

async function runDisplayFlowAsync(entry: DisplayQueueEntry): Promise<void> {
    let ctx: DisplaySessionContext | null = null;
    const ac = new AbortController();
    const timeoutId = setTimeout(
        () => ac.abort(),
        entry.timeouts.adLoadTotalMs,
    );

    try {
        ctx = createDisplaySessionContext(entry);
        sendDisplayEvent(ctx, 'requested');

        mountSurface(entry.container, entry);
        sendDisplayEvent(ctx, 'asset_load_started');

        let renderConfirmedAt: number;

        if (entry.creativeType === 'banner_html5') {
            renderConfirmedAt = await runHtml5Flow(ctx, entry, ac.signal);
        } else {
            renderConfirmedAt = await runStaticFlow(ctx, entry, ac.signal);
        }

        sendDisplayEvent(ctx, 'render_confirmed');
        prepareDisplayMeasurement(ctx, entry.container);
        startDisplayMeasurement(ctx, renderConfirmedAt);

    } catch (err) {
        if (ctx !== null) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            sendDisplayEvent(ctx, 'creative_error', {
                errorCode: isAbort ? 'MEDIA_START_TIMEOUT' : 'MEDIA_LOAD_FAILED',
                finalizationReason: isAbort ? 'timeout' : 'error',
            });
            destroyDisplaySession(ctx, isAbort ? 'timeout' : 'error');
        }
    } finally {
        clearTimeout(timeoutId);
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