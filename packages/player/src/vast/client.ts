import { PlayerError } from '../errors.js';

// Загружает VAST XML по URL с учётом timeout из PlayerTimeouts.
// AbortSignal.any не поддерживается в Safari 14 — используем ручной timeout
export async function loadVastXml(
    url: string,
    vastRequestMs: number,
    signal: AbortSignal,
): Promise<string> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
        () => timeoutController.abort(),
        vastRequestMs,
    );

    // Объединяем внешний signal с timeout signal вручную
    const onExternalAbort = (): void => timeoutController.abort();
    signal.addEventListener('abort', onExternalAbort, { once: true });

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: timeoutController.signal,
            // Без credentials — VAST endpoint публичный
            credentials: 'omit',
        });

        if (!response.ok) {
            throw new Error(PlayerError.VAST_FETCH_FAILED);
        }

        return await response.text();

    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            if (signal.aborted) {
                // Прерван внешним AbortSignal — пробрасываем как есть
                throw err;
            }
            // Прерван по timeout
            throw new Error(PlayerError.VAST_FETCH_TIMEOUT);
        }
        // Переводим network errors в типизированный код
        if (err instanceof Error && err.message === PlayerError.VAST_FETCH_FAILED) {
            throw err;
        }
        throw new Error(PlayerError.VAST_FETCH_FAILED);

    } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onExternalAbort);
    }
}