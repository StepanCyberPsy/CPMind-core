import { safePause } from '../media/playback.js';

export interface InstreamAdCallbacks {
    runAd(): Promise<void>;
    onConsumed(): void;
}

export interface InstreamBinding {
    destroy(): void;
}

// Привязывает in-stream ad к нативному content video.
// Ad играет ровно один раз (consumed flag).
// running guard предотвращает race condition при двойном play event.
// Fail-open: любая ошибка → resume content
export function bindNativeContent(
    content: HTMLVideoElement,
    callbacks: InstreamAdCallbacks,
): InstreamBinding {
    let consumed = false;
    let running = false;

    const onPlay = async (): Promise<void> => {
        // SPA guard: content элемент удалён из DOM
        if (!content.isConnected) return;
        if (consumed || running) return;

        running = true;

        // Defer pause на microtask — iOS Safari игнорирует pause() внутри
        // синхронного play handler
        await Promise.resolve();

        if (!content.isConnected || consumed) {
            running = false;
            return;
        }

        safePause(content);

        try {
            await callbacks.runAd();
        } catch {
            // Fail-open: VAST/media error не должен заблокировать контент
        } finally {
            consumed = true;
            running = false;
        }

        // Resume content после завершения/ошибки ad
        if (content.isConnected) {
            try {
                await content.play();
            } catch {
                // Пользователь увидит paused content — нормально
            }
            callbacks.onConsumed();
        }
    };

    content.addEventListener('play', () => {
        void onPlay();
    }, { once: true });

    return {
        destroy(): void {
            // Если play ещё не случился — удаляем listener.
            // once: true означает что мы не можем снять его по имени — заменяем
            // consumed flag на true, чтобы pending async не продолжился
            consumed = true;
        },
    };
}