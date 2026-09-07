// Ожидание загрузки и декодирования изображения
export async function waitForImageLoaded(
    img: HTMLImageElement,
    signal: AbortSignal,
): Promise<void> {
    if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    await new Promise<void>((resolve, reject) => {
        if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
        }

        const cleanup = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
            signal.removeEventListener('abort', onAbort);
        };

        const onLoad = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('IMAGE_LOAD_FAILED')); };
        const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };

        signal.addEventListener('abort', onAbort, { once: true });
        img.addEventListener('load', onLoad, { once: true });
        img.addEventListener('error', onError, { once: true });
    });

    if ('decode' in img) {
        try {
            await img.decode();
        } catch {
            throw new Error('IMAGE_LOAD_FAILED');
        }
    }
}

// Ожидание отрисовки следующего frame браузером
export async function waitForFramePainted(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

// Полный цикл render confirmation: load + decode + rAF
export async function waitForImageRender(
    img: HTMLImageElement,
    signal: AbortSignal,
): Promise<void> {
    await waitForImageLoaded(img, signal);
    await waitForFramePainted();
}