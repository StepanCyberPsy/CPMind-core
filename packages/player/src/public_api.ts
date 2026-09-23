import { createPlayerSession } from './player.js';
import type { PlayerHandle } from './player.js';
import { createOutstreamLifecycle } from './lifecycle/outstream.js';
import type { OutstreamLifecycle } from './lifecycle/outstream.js';
import { createStickyLifecycle } from './lifecycle/sticky.js';
import type { StickyLifecycle } from './lifecycle/sticky.js';
import { bindNativeContent } from './lifecycle/instream.js';
import type { InstreamBinding } from './lifecycle/instream.js';
import { requestNextCreative } from './lifecycle/advance.js';
import {
    OUTSTREAM_ASPECT_RATIO,
    STICKY_DEFAULT_CORNER,
    STICKY_DEFAULT_OFFSET_PX,
    STICKY_DEFAULT_WIDTH_PX,
} from './player-config.js';
import type {
    PlayerController,
    OutstreamOptions,
    StickyOptions,
    NativeAttachOptions
} from './types.js';

const OVERLAY_HOST_ATTR = 'data-cpmind-overlay-host';

function ensureOverlayHost(contentVideo: HTMLVideoElement): HTMLElement {
    const existing = contentVideo.parentElement;

    if (existing !== null && existing.hasAttribute(OVERLAY_HOST_ATTR)) {
        return existing;
    }

    const host = document.createElement('div');
    host.setAttribute(OVERLAY_HOST_ATTR, '');
    host.style.position = 'relative';
    host.style.display = 'block';
    host.style.width = '100%';

    const parent = contentVideo.parentElement;

    if (parent === null) {
        host.appendChild(contentVideo);
        return host;
    }

    parent.insertBefore(host, contentVideo);
    host.appendChild(contentVideo);

    return host;
}

export const CPMindPlayer = {

    mountOutstream(opts: OutstreamOptions): PlayerController {
        let handle: PlayerHandle | null = null;
        let lifecycle: OutstreamLifecycle | null = null;

        lifecycle = createOutstreamLifecycle(opts.container, {
            async onLoad(): Promise<void> {
                handle = await createPlayerSession({
                    container: opts.container,
                    deliveryConfig: opts.deliveryConfig,
                    showClose: true,
                    onFinished: () => { lifecycle?.notifyCompleted(); },
                    onViewerStart: () => { lifecycle?.notifyStartedByViewer(); },
                });
            },

            // Фактический результат автозапуска, включая переход в беззвучный режим браузером
            async onRequestPlay() {
                if (handle === null) {
                    return {
                        outcome: 'error' as const,
                        finallyMuted: opts.deliveryConfig.initialMuted,
                    };
                }
                return handle.play();
            },

            onPlaybackStarted(_finallyMuted: boolean): void { },

            onAutoplayBlocked(): void { },

            onScrollPause(): void {
                handle?.pause();
            },

            onScrollResume(): void { },

            onClose(): void {
                handle?.close('user');
            },

            async onAdvance(): Promise<void> {
                await requestNextCreative({
                    endpoint: opts.deliveryConfig.advanceEndpoint,
                    deliveryToken: opts.deliveryConfig.deliveryToken,
                    adSessionId: opts.deliveryConfig.adSessionId,
                });
            },

            onReleaseSession(): void {
                handle = null;
            },
        }, {
            width: opts.deliveryConfig.width,
            height: opts.deliveryConfig.height,
        }, opts.deliveryConfig.autoplay);

        return {
            adSessionId: opts.deliveryConfig.adSessionId,
            destroy() {
                lifecycle?.destroy();
                lifecycle = null;
                handle?.destroy();
                handle = null;
            },
        };
    },

    mountSticky(opts: StickyOptions): PlayerController {
        const config = opts.deliveryConfig;

        const width = config.stickyWidth ?? STICKY_DEFAULT_WIDTH_PX;
        const height = config.stickyHeight
            ?? Math.round(width / OUTSTREAM_ASPECT_RATIO);

        // Размер поверхности задаётся параметрами sticky, а не размерами плейсмента
        const stickyConfig = {
            ...config,
            width,
            height,
        };

        let handle: PlayerHandle | null = null;
        let lifecycle: StickyLifecycle | null = null;

        lifecycle = createStickyLifecycle(config.autoplay, {
            async onLoad(): Promise<void> {
                handle = await createPlayerSession({
                    container: opts.container,
                    deliveryConfig: stickyConfig,
                    showClose: true,
                    mount: {
                        kind: 'sticky',
                        corner: config.stickyCorner ?? STICKY_DEFAULT_CORNER,
                        offsetX: config.stickyOffsetX ?? STICKY_DEFAULT_OFFSET_PX,
                        offsetY: config.stickyOffsetY ?? STICKY_DEFAULT_OFFSET_PX,
                    },
                    onFinished: (outcome) => { lifecycle?.notifyFinished(outcome); },
                });
            },

            async onRequestPlay() {
                if (handle === null) {
                    return {
                        outcome: 'error' as const,
                        finallyMuted: config.initialMuted,
                    };
                }
                return handle.play();
            },

            onPause(): void {
                handle?.pause();
            },

            // Цикл завершён: сессия освобождается перед созданием следующей
            onReleaseSession(): void {
                handle = null;
            },

            async onAdvance(): Promise<void> {
                await requestNextCreative({
                    endpoint: config.advanceEndpoint,
                    deliveryToken: config.deliveryToken,
                    adSessionId: config.adSessionId,
                });
            },
        });

        return {
            adSessionId: config.adSessionId,
            destroy() {
                lifecycle?.destroy();
                lifecycle = null;
                handle?.destroy();
                handle = null;
            },
        };
    },

    attachNative(opts: NativeAttachOptions): PlayerController {
        const container = opts.container ?? ensureOverlayHost(opts.contentVideo);

        let handle: PlayerHandle | null = null;
        let binding: InstreamBinding | null = null;

        binding = bindNativeContent(opts.contentVideo, opts.subtype, {
            // Сессия выдаётся в момент рекламной вставки. Без сессии вставка не выполняется —
            // ошибка обрабатывается bindNativeContent с возобновлением контента
            async runAd(): Promise<void> {
                const adSessionId = opts.resolveAdSessionId !== undefined
                    ? await opts.resolveAdSessionId()
                    : opts.deliveryConfig.adSessionId;

                if (adSessionId === null) {
                    throw new Error('AD_SESSION_UNAVAILABLE');
                }

                handle = await createPlayerSession({
                    container,
                    deliveryConfig: {
                        ...opts.deliveryConfig,
                        adSessionId,
                    },
                    showClose: false,
                    mount: opts.container === undefined
                        ? { kind: 'overlay' }
                        : { kind: 'inline' },
                    getContentPlayheadSec: () => opts.contentVideo.currentTime,
                });
                await handle.play();
                await handle.whenFinished();
            },
            onConsumed() {
                // Content resume is handled internally by bindNativeContent
            },
        });

        return {
            get adSessionId() {
                return handle?.adSessionId ?? opts.deliveryConfig.adSessionId;
            },
            destroy() {
                binding?.destroy();
                binding = null;
                handle?.destroy();
                handle = null;
            },
        };
    },
};