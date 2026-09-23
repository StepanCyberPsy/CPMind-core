import { safePause } from '../media/playback.js';
import type { InstreamSubtype } from '@cpmind/shared';

// Точка вставки mid-roll — середина контента издателя, одна за просмотр
const MIDROLL_CONTENT_FRACTION = 0.5;

export interface InstreamAdCallbacks {
    runAd(): Promise<void>;
    onConsumed(): void;
}

export interface InstreamBinding {
    destroy(): void;
}

// Привязывает in-stream ad к нативному content video. Точка вставки задаётся подтипом:
// pre-roll — первый запуск контента, mid-roll — середина просмотра, post-roll — завершение,
// pause-roll — возобновление после паузы. Реклама играет ровно один раз за привязку
// (consumed flag), running guard предотвращает гонку при двойном событии.
// Fail-open: любая ошибка → resume content
export function bindNativeContent(
    content: HTMLVideoElement,
    subtype: InstreamSubtype,
    callbacks: InstreamAdCallbacks,
): InstreamBinding {
    let consumed = false;
    let running = false;
    let destroyed = false;
    let pausedByViewer = false;

    const listeners: Array<[string, EventListener]> = [];

    function detach(): void {
        for (const [type, listener] of listeners) {
            content.removeEventListener(type, listener);
        }
        listeners.length = 0;
    }

    // Слушатели снимаются явно, а не через once: одноразовость рекламы задаёт
    // флаг consumed. При once первое же отклонённое событие сняло бы слушатель,
    // и точка вставки была бы потеряна
    function on(
        type: string,
        handler: () => void,
    ): void {
        const listener = handler as EventListener;
        content.addEventListener(type, listener);
        listeners.push([type, listener]);
    }

    // resumeContent — возобновлять ли контент после рекламы. Post-roll показывается
    // после завершения контента, возобновлять нечего
    async function runAdOnce(resumeContent: boolean): Promise<void> {
        // SPA guard: content элемент удалён из DOM
        if (!content.isConnected) return;
        if (destroyed || consumed || running) return;

        running = true;
        detach();

        // Defer pause на microtask — iOS Safari игнорирует pause() внутри
        // синхронного play handler
        await Promise.resolve();

        if (!content.isConnected || destroyed || consumed) {
            running = false;
            return;
        }

        if (resumeContent) safePause(content);

        try {
            await callbacks.runAd();
        } catch {
            // Fail-open: VAST/media error не должен заблокировать контент
        } finally {
            consumed = true;
            running = false;
        }

        if (!content.isConnected) return;

        if (resumeContent) {
            try {
                await content.play();
            } catch {
                // Пользователь увидит paused content — нормально
            }
        }

        callbacks.onConsumed();
    }

    switch (subtype) {
        case 'preroll': {
            on('play', () => {
                void runAdOnce(true);
            });
            break;
        }

        case 'midroll': {
            on('timeupdate', () => {
                const durationSec = content.duration;
                if (!Number.isFinite(durationSec) || durationSec <= 0) return;
                if (content.currentTime < durationSec * MIDROLL_CONTENT_FRACTION) return;
                void runAdOnce(true);
            });
            break;
        }

        case 'postroll': {
            on('ended', () => {
                void runAdOnce(false);
            });
            break;
        }

        case 'pauseroll': {
            // Браузер генерирует pause перед ended — завершение контента паузой не является
            on('pause', () => {
                if (content.ended) return;
                pausedByViewer = true;
            });

            on('play', () => {
                if (!pausedByViewer) return;
                pausedByViewer = false;
                void runAdOnce(true);
            });
            break;
        }
    }

    return {
        destroy(): void {
            destroyed = true;
            consumed = true;
            detach();
        },
    };
}