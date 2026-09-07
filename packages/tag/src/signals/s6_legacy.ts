import type { Session } from '@cpmind/sdk';
import type { AudioConnection } from '@cpmind/shared';
import {
    createS6AccumulatorState,
    onS6Play,
    onS6Pause,
    onS6Ended,
    onS6TimeUpdate,
    onS6Seeking,
    onS6Seeked,
    onS6VolumeChange,
    onS6Skip,
    onS6LoadedMetadata,
    onS6AudioConnectionDetected,
    resetS6Accumulator,
} from '@cpmind/sdk';

async function detectAudioConnection(): Promise<AudioConnection> {
    if (!navigator.mediaDevices?.enumerateDevices) return 'unknown';
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(
            (d) => d.kind === 'audiooutput' && d.label !== '',
        );
        if (outputs.length === 0) return 'unknown';
        for (const d of outputs) {
            const label = d.label.toLowerCase();
            if (label.includes('bluetooth')) return 'bluetooth';
            if (
                label.includes('headphone') ||
                label.includes('earphone') ||
                label.includes('airpod') ||
                label.includes('headset') ||
                label.includes('wired')
            ) return 'wired_headphones';
            if (
                label.includes('external') ||
                label.includes('usb') ||
                label.includes('hdmi') ||
                label.includes('displayport')
            ) return 'external_speaker';
        }
        return 'built_in_speaker';
    } catch {
        return 'unknown';
    }
}

const resetters = new WeakMap<HTMLElement, () => void>();

export function initS6Legacy(
    creativeEl: HTMLElement,
    session: Session,
): void {
    const videoEl = creativeEl.querySelector('video');
    if (!videoEl) {
        session.s6 = null;
        return;
    }

    const state = createS6AccumulatorState('unknown', videoEl.volume);
    session.s6 = state;

    let previousMuted = videoEl.muted;

    if (isFinite(videoEl.duration) && videoEl.duration > 0) {
        onS6LoadedMetadata(state, videoEl.duration);
    }

    // Autoplay уже запущен до initS6Legacy
    if (!videoEl.paused && !videoEl.ended) {
        onS6Play(state, videoEl.muted, videoEl.volume);
    }

    void detectAudioConnection().then((conn) => {
        onS6AudioConnectionDetected(state, conn);
    });

    videoEl.addEventListener('loadedmetadata', () => {
        onS6LoadedMetadata(state, videoEl.duration);
    });

    videoEl.addEventListener('play', () => {
        onS6Play(state, videoEl.muted, videoEl.volume);
        previousMuted = videoEl.muted;
    });

    videoEl.addEventListener('pause', () => {
        onS6Pause(state);
    });

    videoEl.addEventListener('ended', () => {
        onS6Ended(state, videoEl.muted, videoEl.volume);
    });

    videoEl.addEventListener('timeupdate', () => {
        onS6TimeUpdate(
            state,
            videoEl.currentTime,
            videoEl.muted,
            videoEl.volume,
        );
    });

    videoEl.addEventListener('volumechange', () => {
        onS6VolumeChange(
            state,
            videoEl.muted,
            videoEl.volume,
            videoEl.paused,
            videoEl.ended,
            previousMuted,
        );
        previousMuted = videoEl.muted;
    });

    videoEl.addEventListener('seeking', () => {
        onS6Seeking(state);
    });

    videoEl.addEventListener('seeked', () => {
        onS6Seeked(state, videoEl.currentTime);
    });

    const skipEl = creativeEl.querySelector('[data-cpmind-skip]');
    if (skipEl) {
        skipEl.addEventListener('click', () => {
            onS6Skip(state);
        });
    }

    resetters.set(creativeEl, () => {
        if (session.s6 === null) return;
        resetS6Accumulator(
            session.s6,
            videoEl.currentTime,
            videoEl.paused,
            videoEl.ended,
            videoEl.muted,
            videoEl.volume,
        );
    });
}

export function resetSegmentS6Legacy(creativeEl: HTMLElement): void {
    resetters.get(creativeEl)?.();
}