import { createPlayerSession } from './player.js';
import type { PlayerHandle } from './player.js';
import { createOutstreamLifecycle } from './lifecycle/outstream.js';
import type { OutstreamLifecycle } from './lifecycle/outstream.js';
import { bindNativeContent } from './lifecycle/instream.js';
import type { InstreamBinding } from './lifecycle/instream.js';
import type {
    PlayerController,
    OutstreamOptions,
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
                });
            },

            async onRequestPlay() {
                const outcome = await (handle?.play() ?? Promise.resolve('error' as const));
                return { outcome, finallyMuted: opts.deliveryConfig.initialMuted };
            },

            onPlaybackStarted(_finallyMuted: boolean): void {},

            onAutoplayBlocked(): void {},

            onScrollPause(): void {
                handle?.pause();
            },

            onScrollResume(): void {},

            onClose(): void {
                handle?.close('user');
            },
        }, {
            width: opts.deliveryConfig.width,
            height: opts.deliveryConfig.height,
        });

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

    attachNative(opts: NativeAttachOptions): PlayerController {
        const container = opts.container ?? ensureOverlayHost(opts.contentVideo);

        let handle: PlayerHandle | null = null;
        let binding: InstreamBinding | null = null;

        binding = bindNativeContent(opts.contentVideo, {
            async runAd(): Promise<void> {
                const deliveryConfig = opts.resolveAdSessionId !== undefined
                    ? {
                        ...opts.deliveryConfig,
                        adSessionId: await opts.resolveAdSessionId(),
                    }
                    : opts.deliveryConfig;

                handle = await createPlayerSession({
                    container,
                    deliveryConfig,
                    showClose: false,
                    overlay: opts.container === undefined,
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
            adSessionId: opts.deliveryConfig.adSessionId,
            destroy() {
                binding?.destroy();
                binding = null;
                handle?.destroy();
                handle = null;
            },
        };
    },
};