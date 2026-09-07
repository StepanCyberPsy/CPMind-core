import { PlayerError } from '../errors.js';
import type { AutoplayOutcome } from '../vast/types.js';

// Попытка autoplay. Возвращает outcome без броска —
// blocked autoplay — ожидаемый сценарий, не ошибка Player
export async function attemptPlay(
    video: HTMLVideoElement,
): Promise<AutoplayOutcome> {
    try {
        await video.play();
        return 'started';
    } catch (err) {
        if (err instanceof DOMException) {
            // NotAllowedError — autoplay policy заблокировала воспроизведение
            if (err.name === 'NotAllowedError') return 'blocked';
            // AbortError — play() прервана до завершения (например, pause() вызван сразу)
            if (err.name === 'AbortError') return 'blocked';
        }
        return 'error';
    }
}

// Безопасный pause — игнорирует вызов если video не готова к pause
export function safePause(video: HTMLVideoElement): void {
    // readyState 0 = HAVE_NOTHING — pause() при этом состоянии безвредна,
    // но на некоторых браузерах бросает если play() была отклонена
    if (video.readyState === 0) return;
    video.pause();
}

// Устанавливает src и инициирует загрузку медиа.
// load() обязателен после src изменения на iOS Safari
export function setMediaSource(video: HTMLVideoElement, url: string): void {
    video.src = url;
    video.load();
}

// Seek с подтверждением через seeked event.
// iOS Safari не обновляет currentTime немедленно — необходимо ждать seeked
export async function seekTo(
    video: HTMLVideoElement,
    timeSec: number,
    signal: AbortSignal,
): Promise<void> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    return new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            signal.removeEventListener('abort', onAbort);
        };

        const onSeeked = (): void => { cleanup(); resolve(); };
        const onError = (): void => {
            cleanup();
            reject(new Error(PlayerError.MEDIA_LOAD_FAILED));
        };
        const onAbort = (): void => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.currentTime = timeSec;
    });
}

// Ожидает canplay event — видео готово к воспроизведению без буферизации.
// Timeout управляется внешним signal
export async function waitForCanPlay(
    video: HTMLVideoElement,
    signal: AbortSignal,
): Promise<void> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;

    return new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('error', onError);
            signal.removeEventListener('abort', onAbort);
        };

        const onCanPlay = (): void => { cleanup(); resolve(); };
        const onError = (): void => {
            cleanup();
            reject(new Error(PlayerError.MEDIA_LOAD_FAILED));
        };
        const onAbort = (): void => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
        video.addEventListener('canplay', onCanPlay, { once: true });
        video.addEventListener('error', onError, { once: true });
    });
}