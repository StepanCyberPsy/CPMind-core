import { observeEligibility, observePlayback } from './viewport.js';
import type { ViewportObservers } from './viewport.js';

export type OutstreamState =
    | 'mounting'
    | 'loading'
    | 'eligible'
    | 'playing'
    | 'paused_by_scroll'
    | 'completed'
    | 'closed';

export interface OutstreamAutoplayResult {
    outcome: 'started' | 'blocked' | 'error';
    finallyMuted: boolean;
}

export interface OutstreamLifecycleCallbacks {
    onLoad(): Promise<void>;
    onRequestPlay(): Promise<OutstreamAutoplayResult>;
    onPlaybackStarted(finallyMuted: boolean): void;
    onAutoplayBlocked(): void;
    onScrollPause(): void;
    onScrollResume(): void;
    onClose(): void;
}

export interface OutstreamLifecycle {
    notifyCompleted(): void;
    notifyClosed(): void;
    destroy(): void;
}

export function createOutstreamLifecycle(
    surface: HTMLElement,
    callbacks: OutstreamLifecycleCallbacks,
): OutstreamLifecycle {
    let state: OutstreamState = 'mounting';
    let eligibilityObs: ViewportObservers | null = null;
    let playbackObs: ViewportObservers | null = null;
    let loadingInProgress = false;

    function isTerminal(): boolean {
        return state === 'completed' || state === 'closed';
    }

    async function startLoad(): Promise<void> {
        if (loadingInProgress || isTerminal()) return;
        loadingInProgress = true;
        state = 'loading';

        try {
            await callbacks.onLoad();
        } catch {
            loadingInProgress = false;
            return;
        }

        if (isTerminal()) {
            loadingInProgress = false;
            return;
        }

        state = 'eligible';
        loadingInProgress = false;

        playbackObs = observePlayback(surface, onViewportEnter, onViewportExit);
    }

    async function onViewportEnter(): Promise<void> {
        if (isTerminal()) return;
        if (state === 'playing') return;

        if (state === 'paused_by_scroll') {
            const result = await callbacks.onRequestPlay();
            if (!isTerminal() && result.outcome === 'started') {
                state = 'playing';
                callbacks.onScrollResume();
            }
            return;
        }

        if (state !== 'eligible') return;

        const result = await callbacks.onRequestPlay();

        if (isTerminal()) return;

        if (result.outcome === 'started') {
            state = 'playing';
            callbacks.onPlaybackStarted(result.finallyMuted);
        } else {
            callbacks.onAutoplayBlocked();
        }
    }

    function onViewportExit(): void {
        if (isTerminal()) return;
        if (state !== 'playing') return;

        state = 'paused_by_scroll';
        callbacks.onScrollPause();
    }

    state = 'mounting';
    eligibilityObs = observeEligibility(surface, () => {
        void startLoad();
    });

    return {
        notifyCompleted(): void {
            if (isTerminal()) return;
            state = 'completed';
            eligibilityObs?.disconnect();
            playbackObs?.disconnect();
        },

        notifyClosed(): void {
            if (isTerminal()) return;
            state = 'closed';
            eligibilityObs?.disconnect();
            playbackObs?.disconnect();
            callbacks.onClose();
        },

        destroy(): void {
            eligibilityObs?.disconnect();
            playbackObs?.disconnect();
        },
    };
}