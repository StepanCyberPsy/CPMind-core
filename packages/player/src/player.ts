import type {
    AdSessionId,
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
import type { AdSurface, SurfaceMount } from './ui/surface.js';
import { createPlayerControls } from './controls/controls.js';
import type { PlayerControls } from './controls/controls.js';
import {
    createSdkBridge,
    terminalOutcomeToFinalizationReason,
} from './measurement/sdk_bridge.js';
import type { SdkBridge } from './measurement/sdk_bridge.js';
import {
    attemptAutoplay,
    type AutoplayResult,
} from './autoplay/policy.js';
import {
    fireImpression,
    fireTrackingEvent,
    fireError,
    fireClickTracking,
} from './vast/tracking.js';
import type { ParsedVastAd } from './vast/types.js';
import type { MacroContext } from './vast/macros.js';
import type { ResolvedDeliveryConfig } from './types.js';

export interface PlayerSessionOptions {
    container: HTMLElement;
    deliveryConfig: ResolvedDeliveryConfig;
    showClose: boolean;
    mount?: SurfaceMount | undefined;
    getContentPlayheadSec?: (() => number | undefined) | undefined;
    onFinished?: ((outcome: PlayerTerminalOutcome) => void) | undefined;

    // Зритель запустил ролик сам — вызывается один раз при первом воспроизведении
    onViewerStart?: (() => void) | undefined;
}

export interface PlayerHandle {
    readonly adSessionId: AdSessionId;
    play(): Promise<AutoplayResult>;
    pause(): void;
    // Наблюдение поверхности: вызывает формат, который её наблюдает
    reportViewportVisibility(visible: boolean): void;
    close(source: PlayerActionSource): void;
    whenFinished(): Promise<PlayerTerminalOutcome>;
    destroy(): void;
}

const TIMEOUT_ERROR_CODES: ReadonlySet<PlayerErrorCode> = new Set([
    PlayerError.VAST_FETCH_TIMEOUT,
    PlayerError.MEDIA_START_TIMEOUT,
]);

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

// VAST запрашивается в выданной сессии — сервер привязывает запрос к ней, а не создаёт новую
function buildVastRequestUrl(
    vastUrl: string,
    adSessionId: AdSessionId,
): string {
    const url = new URL(vastUrl);
    url.searchParams.set('sid', adSessionId);
    return url.toString();
}

function resolvePlayerErrorCode(err: unknown): PlayerErrorCode {
    const message = err instanceof Error ? err.message : '';
    return (Object.values(PlayerError) as string[]).includes(message)
        ? message as PlayerErrorCode
        : PlayerError.MEDIA_LOAD_FAILED;
}

function toFailureOutcome(code: PlayerErrorCode): PlayerTerminalOutcome {
    const errorCode = toAdSessionErrorCode(code);
    return TIMEOUT_ERROR_CODES.has(code)
        ? { type: 'timed_out', errorCode }
        : { type: 'failed', errorCode };
}

// Признак пропускаемости задаёт плейсмент: по нему же сервер пишет s6_skippable
// в показ и выбирает сегмент модели S6. Разметка VAST — резерв, когда смещение
// в конфигурации не задано. Смещение за пределами длительности недостижимо,
// такой ролик пропускаемым не считается
function resolveSkipOffsetSec(
    skippable: boolean,
    configuredOffsetSec: number | null,
    vastSkipOffset: ParsedVastAd['skipOffset'],
    durationSec: number,
): number | null {
    if (!skippable) return null;

    let offsetSec: number | null = configuredOffsetSec;

    if (offsetSec === null && vastSkipOffset !== null) {
        offsetSec = vastSkipOffset.kind === 'percent'
            ? (durationSec * vastSkipOffset.value) / 100
            : vastSkipOffset.value;
    }

    if (offsetSec === null) return 0;
    if (!Number.isFinite(offsetSec) || offsetSec < 0) return 0;
    if (durationSec > 0 && offsetSec >= durationSec) return null;

    return offsetSec;
}

// Ожидание готовности медиа с таймаутом mediaStartMs. Внешняя отмена пробрасывается как AbortError
async function waitForMediaReady(
    video: HTMLVideoElement,
    timeoutMs: number,
    signal: AbortSignal,
): Promise<void> {
    const loadAc = new AbortController();
    let timedOut = false;
    const timerId = setTimeout(() => {
        timedOut = true;
        loadAc.abort();
    }, timeoutMs);
    const onExternalAbort = (): void => loadAc.abort();
    signal.addEventListener('abort', onExternalAbort, { once: true });

    try {
        await waitForCanPlay(video, loadAc.signal);
    } catch (err) {
        if (timedOut && !signal.aborted) {
            throw new Error(PlayerError.MEDIA_START_TIMEOUT);
        }
        throw err;
    } finally {
        clearTimeout(timerId);
        signal.removeEventListener('abort', onExternalAbort);
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
        opts.mount ?? { kind: 'inline' },
    );
    const video = createAdVideoElement(deliveryConfig.initialMuted);
    surface.videoSlot.appendChild(video);

    const bridge: SdkBridge = createSdkBridge({
        creativeEl: surface.wrapper,
        video,
        deliveryConfig,
    });

    let terminalOutcome: PlayerTerminalOutcome | null = null;
    let controls: PlayerControls | null = null;
    let resolveFinished!: (v: PlayerTerminalOutcome) => void;
    const finishedPromise = new Promise<PlayerTerminalOutcome>((r) => { resolveFinished = r; });

    const vastFired = new Set<string>();
    let started = false;
    let playCount = 0;
    let measurementPromise: Promise<void> | null = null;
    let videoCleanup: (() => void) | null = null;
    let removalObs: MutationObserver | null = null;
    let unloadOff: (() => void) | null = null;
    let parsedAd: ParsedVastAd | null = null;

    // Автозапуск со звуком был отклонён браузером и откатился в беззвучный режим.
    // Запуск зрителем снимает ограничение автовоспроизведения, поэтому запрошенное
    // состояние звука восстанавливается при первом ручном воспроизведении
    let requestedInitialMuted = deliveryConfig.initialMuted;
    let autoplayMutedFallback = false;

    function makeCtx(errorCode?: PlayerErrorCode): MacroContext {
        return {
            ...(errorCode !== undefined && { errorCode }),
            ...(opts.getContentPlayheadSec !== undefined && {
                contentPlayheadSec: opts.getContentPlayheadSec(),
            }),
        };
    }

    // Изменение выполняется от имени плеера: источником user оно записалось бы
    // в S6 как включение звука зрителем, которого не было
    function restoreRequestedAudioIfNeeded(): void {
        if (!autoplayMutedFallback) return;
        autoplayMutedFallback = false;

        if (video.muted === requestedInitialMuted) return;

        bridge.setPendingSource('player');
        video.muted = requestedInitialMuted;
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

    // Ошибка фиксируется в ad_session при любом исходе, VAST Error — только для разобранного ad
    function finishOnce(outcome: PlayerTerminalOutcome): void {
        if (terminalOutcome !== null) return;
        terminalOutcome = outcome;

        const finalizationReason = terminalOutcomeToFinalizationReason(outcome);
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
                fireError(ad.errorUrls, makeCtx(outcome.errorCode as PlayerErrorCode));
            }
        }

        if (outcome.type === 'failed' || outcome.type === 'timed_out') {
            bridge.sendEvent('player_error', {
                errorCode: outcome.errorCode,
                finalizationReason,
            });
        } else {
            bridge.sendEvent('closed', { finalizationReason });
        }

        // Источник закрытия передаётся до финализации: после неё сессия событий
        // не принимает, а причина close приходит и от зрителя, и от рантайма
        if (outcome.type === 'closed') {
            bridge.reportClose(outcome.source);
        }

        bridge.finalize(outcome);
        doCleanup();
        opts.onFinished?.(outcome);
        resolveFinished(outcome);
    }

    // Измерение стартует один раз — при первом фактическом воспроизведении,
    // в т.ч. запущенном пользователем после блокировки автозапуска
    async function startMeasurementOnce(): Promise<void> {
        const frameAc = new AbortController();
        const timerId = setTimeout(
            () => frameAc.abort(),
            deliveryConfig.timeouts.firstFrameMs,
        );
        const onSessionAbort = (): void => frameAc.abort();
        ac.signal.addEventListener('abort', onSessionAbort, { once: true });

        try {
            await waitForFirstFrame(video, frameAc.signal);
        } catch {
            // Non-fatal: video is playing, proceed without confirmed first frame
        } finally {
            clearTimeout(timerId);
            ac.signal.removeEventListener('abort', onSessionAbort);
        }

        if (terminalOutcome !== null) return;

        bridge.sendEvent('render_confirmed');
        bridge.startMeasurement(Date.now());

        // Зона кнопки регистрируется после создания сессии: до неё передавать элемент некуда
        const skipEl = controls?.skipButtonElement() ?? null;
        if (skipEl !== null) bridge.trackSkipZone(skipEl);

        void detectAudioConnection().then((conn) => bridge.reportAudioConnection(conn));
    }

    function ensureMeasurementStarted(): Promise<void> {
        if (measurementPromise === null) {
            measurementPromise = startMeasurementOnce();
        }
        return measurementPromise;
    }

    try {
        if (deliveryConfig.vastUrl === null) throw new Error(PlayerError.VAST_FETCH_FAILED);

        const xml = await loadVastXml(
            buildVastRequestUrl(deliveryConfig.vastUrl, adSessionId),
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

        await waitForMediaReady(
            video,
            deliveryConfig.timeouts.mediaStartMs,
            ac.signal,
        );
        ac.signal.throwIfAborted();
        bridge.sendEvent('creative_ready');

    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            finishOnce({ type: 'destroyed' });
        } else {
            finishOnce(toFailureOutcome(resolvePlayerErrorCode(err)));
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

    const skipOffsetSec = resolveSkipOffsetSec(
        deliveryConfig.skippable,
        deliveryConfig.skipOffsetSec,
        adRef.skipOffset,
        adRef.durationSec,
    );
    controls = createPlayerControls({
        wrapper: surface.wrapper,
        progressRow: surface.progressRow,
        btnRow: surface.btnRow,
        surface: surface.wrapper,
        format: deliveryConfig.format,
        skipOffsetSec,
        initialMuted: video.muted,
        visibleUntilPlayback: !deliveryConfig.autoplay,
        onPlayPause(source) {
            if (video.paused) {
                restoreRequestedAudioIfNeeded();
                bridge.setPendingSource(source);

                if (source === 'user' && playCount === 0) {
                    opts.onViewerStart?.();
                }

                void video.play();
            } else {
                bridge.setPendingSource(source);
                safePause(video);
            }
        },
        onMuteToggle(source) {
            bridge.setPendingSource(source);
            video.muted = !video.muted;
        },
        onSeek(timeSec, _dur, source) {
            // Ограничение применяется и к полосе перемотки: перетаскивание
            // за момент разблокировки дало бы пропуск раньше отсчёта
            const ceiling = controls?.resolveSeekCeilingSec() ?? null;
            const target = ceiling !== null
                ? Math.min(timeSec, ceiling)
                : timeSec;

            bridge.setPendingSource(source);
            video.currentTime = target;
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

        on('loadedmetadata', () => bridge.handleVideoEvent('loadedmetadata'));

        on('play', () => {
            bridge.handleVideoEvent('play');
            controls?.setPlaying(true);
            controls?.showControls();
            playCount++;
            if (playCount === 1) {
                fireImpression(adRef.impressions.map((i) => i.url), makeCtx());
            } else if (started) {
                fireTrackingEvent(adRef.trackingEvents, 'resume', makeCtx());
            }
            void ensureMeasurementStarted();
        });

        on('pause', () => {
            bridge.handleVideoEvent('pause');
            controls?.setPlaying(false);
            if (started && !video.ended) {
                fireTrackingEvent(adRef.trackingEvents, 'pause', makeCtx());
            }
        });

        on('ended', () => {
            bridge.handleVideoEvent('ended');
            controls?.setPlaying(false);
            finishOnce({ type: 'completed' });
        });

        on('timeupdate', () => {
            bridge.handleVideoEvent('timeupdate');
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

        on('seeking', () => bridge.handleVideoEvent('seeking'));
        on('seeked', () => bridge.handleVideoEvent('seeked'));

        on('volumechange', () => {
            bridge.handleVideoEvent('volumechange');
            controls?.setMuted(video.muted);
            if (started) {
                fireTrackingEvent(adRef.trackingEvents, video.muted ? 'mute' : 'unmute', makeCtx());
            }
        });

        on('error', () => finishOnce(toFailureOutcome(PlayerError.MEDIA_LOAD_FAILED)));

        videoCleanup = () => {
            for (const [type, handler] of evHandlers) {
                video.removeEventListener(type, handler);
            }
        };
    }

    return {
        adSessionId,

        async play(): Promise<AutoplayResult> {
            if (terminalOutcome !== null) {
                return { outcome: 'error', finallyMuted: video.muted };
            }

            const requestedMuted = video.muted;
            const result = await attemptAutoplay(video, requestedMuted);

            requestedInitialMuted = requestedMuted;
            autoplayMutedFallback = !requestedMuted && result.finallyMuted;

            bridge.reportAutoplay({
                outcome: result.outcome,
                requestedMuted,
                finallyMuted: result.finallyMuted,
            });

            controls?.setMuted(video.muted);

            if (result.outcome === 'started') {
                await ensureMeasurementStarted();
            }

            return result;
        },
        pause(): void { safePause(video); },
        reportViewportVisibility(visible: boolean): void {
            bridge.reportViewportVisibility(visible);
        },
        close(source: PlayerActionSource): void { finishOnce({ type: 'closed', source }); },
        whenFinished(): Promise<PlayerTerminalOutcome> { return finishedPromise; },
        destroy(): void { finishOnce({ type: 'destroyed' }); },
    };
}