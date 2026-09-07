export async function waitForFirstFrame(
    video: HTMLVideoElement,
    signal: AbortSignal,
): Promise<void> {
    if ('requestVideoFrameCallback' in video) {
        return new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
                reject(new DOMException('Aborted', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
            (video as unknown as {
                requestVideoFrameCallback: (cb: () => void) => void;
            }).requestVideoFrameCallback(() => {
                signal.removeEventListener('abort', onAbort);
                resolve();
            });
        });
    }
    return waitForFallbackFrame(video, signal);
}

async function waitForFallbackFrame(
    video: HTMLVideoElement,
    signal: AbortSignal,
): Promise<void> {
    if (video.currentTime > 0) return;

    return new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('error', onError);
            signal.removeEventListener('abort', onAbort);
        };

        const onTimeUpdate = (): void => {
            if (video.currentTime > 0) { cleanup(); resolve(); }
        };

        const onError = (): void => {
            cleanup();
            reject(new Error('MEDIA_LOAD_FAILED'));
        };

        const onAbort = (): void => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('error', onError);
    });
}