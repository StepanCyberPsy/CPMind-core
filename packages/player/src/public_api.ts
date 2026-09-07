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
        const container = opts.container
            ?? (opts.contentVideo.parentElement as HTMLElement | null)
            ?? document.body;

        let handle: PlayerHandle | null = null;
        let binding: InstreamBinding | null = null;

        binding = bindNativeContent(opts.contentVideo, {
            async runAd(): Promise<void> {
                handle = await createPlayerSession({
                    container,
                    deliveryConfig: opts.deliveryConfig,
                    showClose: false,
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