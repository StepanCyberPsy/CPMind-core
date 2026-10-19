type CancellationReason = 'page_unload' | 'creative_removed' | 'timeout';

export interface PendingDisplay {
    readonly signal: AbortSignal;
    readonly cancellationReason: CancellationReason | null;
    cancel(reason: CancellationReason): void;
    waitForViewportEntry(): Promise<number>;
    dispose(): void;
}

// До создания SDK-сессии её обработчики удаления и pagehide ещё не существуют.
export function createPendingDisplay(container: HTMLElement): PendingDisplay {
    const controller = new AbortController();
    let cancellationReason: CancellationReason | null = null;
    let intersection: IntersectionObserver | null = null;
    let mutation: MutationObserver | null = null;

    function cancel(reason: CancellationReason): void {
        if (controller.signal.aborted) return;
        cancellationReason = reason;
        controller.abort();
        dispose();
    }

    const onPageHide = (): void => cancel('page_unload');
    const checkConnected = (): void => {
        if (!container.isConnected) cancel('creative_removed');
    };

    function dispose(): void {
        intersection?.disconnect();
        intersection = null;
        mutation?.disconnect();
        mutation = null;
        window.removeEventListener('pagehide', onPageHide);
    }

    try {
        window.addEventListener('pagehide', onPageHide);
        mutation = new MutationObserver(checkConnected);
        mutation.observe(document.documentElement, { childList: true, subtree: true });
        checkConnected();
    } catch (error) {
        dispose();
        throw error;
    }

    return {
        signal: controller.signal,
        get cancellationReason() { return cancellationReason; },
        cancel,
        dispose,
        async waitForViewportEntry(): Promise<number> {
            checkConnected();
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            if (typeof IntersectionObserver === 'undefined') {
                throw new Error('VIEWPORT_OBSERVER_UNAVAILABLE');
            }

            return new Promise<number>((resolve, reject) => {
                let settled = false;

                function finish(timestamp: number | null, error?: unknown): void {
                    if (settled) return;
                    settled = true;
                    intersection?.disconnect();
                    intersection = null;
                    controller.signal.removeEventListener('abort', onAbort);
                    if (timestamp !== null) resolve(timestamp);
                    else reject(error);
                }

                const onAbort = (): void => finish(null, new DOMException('Aborted', 'AbortError'));
                controller.signal.addEventListener('abort', onAbort, { once: true });

                try {
                    intersection = new IntersectionObserver((entries) => {
                        const entry = entries[entries.length - 1];
                        if (!entry || !entry.isIntersecting || entry.intersectionRatio <= 0) return;
                        checkConnected();
                        if (!controller.signal.aborted) finish(Date.now());
                    }, { threshold: 0 });
                    intersection.observe(container);
                } catch (error) {
                    finish(null, error);
                }
            });
        },
    };
}
