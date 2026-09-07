import type {
    DeliveryRuntimeConfig,
    PlayerTerminalOutcome,
    PlayerActionSource,
    AudioConnection,
} from '@cpmind/shared';
import {
    PlayerError,
    toAdSessionErrorCode,
    type PlayerErrorCode
} from './errors.js';
import { loadVastXml } from './vast/client.js';
import { parseVastXml } from './vast/parser.js';
import { selectMediaFile } from './media/select.js';
import {
    createAdVideoElement,
    disposeVideoElement,
} from './media/element.js';
import {
    setMediaSource,
    waitForCanPlay,
    safePause,
} from './media/playback.js';
import { waitForFirstFrame } from './media/frame.js';
import {
    createAdSurface,
    destroySurface,
} from './ui/surface.js';
import type { AdSurface } from './ui/surface.js';
import { createPlayerControls } from './controls/controls.js';
import type { PlayerControls } from './controls/controls.js';
import { createSdkBridge } from './measurement/sdk_bridge.js';
import type { SdkBridge } from './measurement/sdk_bridge.js';
import { attemptAutoplay } from './autoplay/policy.js';
import {
    fireImpression,
    fireTrackingEvent,
    fireError,
    fireClickTracking,
} from './vast/tracking.js';
import type { ParsedVastAd, AutoplayOutcome } from './vast/types.js';
import type { MacroContext } from './vast/macros.js';

export interface PlayerSessionOptions {
    container: HTMLElement;
    deliveryConfig: DeliveryRuntimeConfig;
    showClose: boolean;
    getContentPlayheadSec?: (() => number | undefined) | undefined;
    onFinished?: ((outcome: PlayerTerminalOutcome) => void) | undefined;
}

export interface PlayerHandle {
    readonly adSessionId: string;
    play(): Promise<AutoplayOutcome>;
    pause(): void;
    close(source: PlayerActionSource): void;
    whenFinished(): Promise<PlayerTerminalOutcome>;
    destroy(): void;
}

async function detectAudioConnection(): Promise<AudioConnection> {
    try {
        if (!navigator.mediaDevices?.enumerateDevices) return 'unknown';
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        for (const d of outputs) {
            const label = d.label.toLowerCase();
            if (label.includes('bluetooth')) return 'bluetooth';
            if (label.includes('headphone') || label.includes('earbud') || label.includes('wired')) return 'wired_headphones';
            if (label.includes('external') || label.includes('usb') || label.includes('hdmi')) return 'external_speaker';
        }
        return outputs.some((d) => d.label !== '') ? 'built_in_speaker' : 'unknown';
    } catch {
        return 'unknown';
    }
}

export async function createPlayerSession(
    opts: PlayerSessionOptions,
): Promise<PlayerHandle> {
    const { deliveryConfig } = opts;
    const adSessionId = deliveryConfig.adSessionId;
    const ac = new AbortController();

    const surface: AdSurface = createAdSurface(
        opts.container,
        deliveryConfig.width,
        deliveryConfig.height,
    );
    const video = createAdVideoElement(deliveryConfig.initialMuted);
    surface.videoSlot.appendChild(video);

    const bridge: SdkBridge = createSdkBridge({
        creativeEl: surface.wrapper,
        deliveryConfig,
        adSessionId,
    });

    let terminalOutcome: PlayerTerminalOutcome | null = null;
    let controls: PlayerControls | null = null;
    let resolveFinished!: (v: PlayerTerminalOutcome) => void;
    const finishedPromise = new Promise<PlayerTerminalOutcome>((r) => { resolveFinished = r; });

    const vastFired = new Set<string>();
    let started = false;
    let playCount = 0;
    let audioDetected = false;
    let videoCleanup: (() => void) | null = null;
    let removalObs: MutationObserver | null = null;
    let unloadOff: (() => void) | null = null;
    let parsedAd: ParsedVastAd | null = null;

    function makeCtx(errorCode?: PlayerErrorCode): MacroContext {
        return {
            ...(errorCode !== undefined && { errorCode }),
            ...(opts.getContentPlayheadSec !== undefined && {
                contentPlayheadSec: opts.getContentPlayheadSec(),
            }),
        };
    }

    function doCleanup(): void {
        ac.abort();
        videoCleanup?.();
        videoCleanup = null;
        removalObs?.disconnect();
        removalObs = null;
        unloadOff?.();
        unloadOff = null;
        controls?.destroy();
        controls = null;
        disposeVideoElement(video);
        destroySurface(surface);
    }

    function finishOnce(outcome: PlayerTerminalOutcome): void {
        if (terminalOutcome !== null) return;
        terminalOutcome = outcome;

        const ad = parsedAd;
        if (ad !== null) {
            if (outcome.type === 'completed' && !vastFired.has('complete')) {
                vastFired.add('complete');
                fireTrackingEvent(ad.trackingEvents, 'complete', makeCtx());
            }
            if (outcome.type === 'skipped' && !vastFired.has('skip')) {
                vastFired.add('skip');
                fireTrackingEvent(ad.trackingEvents, 'skip', makeCtx());
            }
            if (outcome.type === 'failed' || outcome.type === 'timed_out') {
                const playerCode = outcome.errorCode as PlayerErrorCode;
                fireError(ad.errorUrls, makeCtx(playerCode));
                bridge.sendEvent('creative_error', toAdSessionErrorCode(playerCode));
            } else {
                bridge.sendEvent('closed');
            }
        }

        bridge.finalize(outcome);
        doCleanup();
        opts.onFinished?.(outcome);
        resolveFinished(outcome);
    }

    try {
        if (deliveryConfig.vastUrl === null) throw new Error(PlayerError.VAST_FETCH_FAILED);

        const xml = await loadVastXml(
            deliveryConfig.vastUrl,
            deliveryConfig.timeouts.vastRequestMs,
            ac.signal,
        );
        ac.signal.throwIfAborted();

        parsedAd = parseVastXml(xml);

        const containerWidth = deliveryConfig.width
            ?? (opts.container.getBoundingClientRect().width || 640);

        const mediaFile = selectMediaFile(video, parsedAd.mediaFiles, containerWidth);
        setMediaSource(video, mediaFile.url);
        bridge.sendEvent('asset_load_started');

        await waitForCanPlay(video, ac.signal);
        ac.signal.throwIfAborted();
        bridge.sendEvent('creative_ready');

    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            finishOnce({ type: 'destroyed' });
        } else {
            const msg = err instanceof Error ? err.message : '';
            const playerCode = (Object.values(PlayerError) as string[]).includes(msg)
                ? msg as PlayerErrorCode
                : PlayerError.MEDIA_LOAD_FAILED;
            finishOnce({ type: 'failed', errorCode: toAdSessionErrorCode(playerCode) });
        }
        throw err;
    }

    const adRef = parsedAd!;

    if (adRef.clickThrough !== null && adRef.clickThrough.url !== '') {
        const clickUrl = adRef.clickThrough.url;
        const overlay = document.createElement('a');
        overlay.href = clickUrl;
        overlay.target = '_blank';
        overlay.rel = 'noopener noreferrer';
        overlay.style.cssText = 'position:absolute;inset:0;z-index:5;display:block;';
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            fireClickTracking(adRef.clickTrackings.map((ct) => ct.url), makeCtx());
            window.open(clickUrl, '_blank', 'noopener,noreferrer');
        });
        surface.wrapper.appendChild(overlay);
    }

    const skipOffsetSec = adRef.skipOffset?.kind === 'seconds' ? adRef.skipOffset.value : null;
    controls = createPlayerControls({
        wrapper: surface.wrapper,
        progressRow: surface.progressRow,
        btnRow: surface.btnRow,
        surface: surface.wrapper,
        skipOffsetSec,
        onPlayPause(source) {
            if (video.paused) {
                bridge.setPendingSource('play', source);
                void video.play();
            } else {
                bridge.setPendingSource('pause', source);
                safePause(video);
            }
        },
        onMuteToggle(source) {
            bridge.setPendingSource('volumechange', source);
            video.muted = !video.muted;
        },
        onSeek(timeSec, _dur, source) {
            bridge.setPendingSource('seeked', source);
            video.currentTime = timeSec;
        },
        onSkip() { finishOnce({ type: 'skipped', source: 'user' }); },
        ...(opts.showClose ? {
            onClose(source: PlayerActionSource) { finishOnce({ type: 'closed', source }); },
        } : {}),
    });

    removalObs = new MutationObserver(() => {
        if (!surface.wrapper.isConnected) finishOnce({ type: 'creative_removed' });
    });
    removalObs.observe(document.documentElement, { childList: true, subtree: true });

    const onPageHide = (): void => finishOnce({ type: 'page_unloaded' });
    window.addEventListener('pagehide', onPageHide, { once: true });
    unloadOff = () => window.removeEventListener('pagehide', onPageHide);

    {
        const evHandlers: Array<[string, EventListener]> = [];
        const on = (type: string, h: () => void): void => {
            const handler = h as EventListener;
            video.addEventListener(type, handler);
            evHandlers.push([type, handler]);
        };

        on('loadedmetadata', () => bridge.handleVideoEvent('loadedmetadata', video));

        on('play', () => {
            bridge.handleVideoEvent('play', video);
            controls?.setPlaying(true);
            controls?.showControls();
            playCount++;
            if (playCount === 1) {
                fireImpression(adRef.impressions.map((i) => i.url), makeCtx());
            } else if (started) {
                fireTrackingEvent(adRef.trackingEvents, 'resume', makeCtx());
            }
        });

        on('pause', () => {
            bridge.handleVideoEvent('pause', video);
            controls?.setPlaying(false);
            if (started && !video.ended) {
                fireTrackingEvent(adRef.trackingEvents, 'pause', makeCtx());
            }
        });

        on('ended', () => {
            bridge.handleVideoEvent('ended', video);
            controls?.setPlaying(false);
            finishOnce({ type: 'completed' });
        });

        on('timeupdate', () => {
            bridge.handleVideoEvent('timeupdate', video);
            const dur = video.duration;
            if (!isFinite(dur) || dur <= 0) return;
            controls?.setProgress(video.currentTime, dur);

            if (!vastFired.has('start') && video.currentTime > 0) {
                vastFired.add('start');
                started = true;
                fireTrackingEvent(adRef.trackingEvents, 'start', makeCtx());
            }

            const pct = video.currentTime / dur;
            if (!vastFired.has('firstQuartile') && pct >= 0.25) {
                vastFired.add('firstQuartile');
                fireTrackingEvent(adRef.trackingEvents, 'firstQuartile', makeCtx());
            }
            if (!vastFired.has('midpoint') && pct >= 0.50) {
                vastFired.add('midpoint');
                fireTrackingEvent(adRef.trackingEvents, 'midpoint', makeCtx());
            }
            if (!vastFired.has('thirdQuartile') && pct >= 0.75) {
                vastFired.add('thirdQuartile');
                fireTrackingEvent(adRef.trackingEvents, 'thirdQuartile', makeCtx());
            }
        });

        on('seeking', () => bridge.handleVideoEvent('seeking', video));
        on('seeked', () => bridge.handleVideoEvent('seeked', video));

        on('volumechange', () => {
            bridge.handleVideoEvent('volumechange', video);
            controls?.setMuted(video.muted);
            if (started) {
                fireTrackingEvent(adRef.trackingEvents, video.muted ? 'mute' : 'unmute', makeCtx());
            }
        });

        on('error', () => finishOnce({ type: 'failed', errorCode: PlayerError.MEDIA_LOAD_FAILED }));

        videoCleanup = () => {
            for (const [type, handler] of evHandlers) {
                video.removeEventListener(type, handler);
            }
        };
    }

    return {
        adSessionId,

        async play(): Promise<AutoplayOutcome> {
            if (terminalOutcome !== null) return 'error';

            const result = await attemptAutoplay(video, video.muted);

            if (result.outcome === 'started') {
                const frameAc = new AbortController();
                const timerId = setTimeout(
                    () => frameAc.abort(),
                    deliveryConfig.timeouts.firstFrameMs,
                );
                try {
                    await waitForFirstFrame(video, frameAc.signal);
                } catch {
                    // Non-fatal: video is playing, proceed without confirmed first frame
                } finally {
                    clearTimeout(timerId);
                }

                const renderConfirmedAt = Date.now();
                bridge.startMeasurement(renderConfirmedAt);
                bridge.sendEvent('render_confirmed');

                if (!audioDetected) {
                    audioDetected = true;
                    void detectAudioConnection().then((conn) => bridge.reportAudioConnection(conn));
                }
            }

            return result.outcome;
        },

        pause(): void { safePause(video); },

        close(source: PlayerActionSource): void { finishOnce({ type: 'closed', source }); },

        whenFinished(): Promise<PlayerTerminalOutcome> { return finishedPromise; },

        destroy(): void { finishOnce({ type: 'destroyed' }); },
    };
}