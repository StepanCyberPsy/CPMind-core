import {
    prepareMeasurementSession,
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
    sendDeliveryEvent,
} from '@cpmind/sdk';
import type {
    MeasurementSession,
} from '@cpmind/sdk';
import {
    AdSessionIdSchema,
    type AudioConnection,
    type DeliveryRuntimeConfig,
    type MeasurementFinalizationReason,
    type VideoMeasurementEvent,
    type PlayerTerminalOutcome,
    type PlayerActionSource,
    type AdSessionDeliveryEventType,
    type AdSessionPlayerErrorCode,
} from '@cpmind/shared';
import type { VideoPlaybackState } from '../vast/types.js';
import { ACTION_SOURCE_WINDOW_MS } from '../player-config.js';

interface PendingAction {
    source: PlayerActionSource;
    setAt: number;
}

function terminalOutcomeToFinalizationReason(
    outcome: PlayerTerminalOutcome,
): MeasurementFinalizationReason {
    switch (outcome.type) {
        case 'completed': return 'complete';
        case 'skipped': return 'skip';
        case 'closed': return 'close';
        case 'failed': return 'error';
        case 'timed_out': return 'timeout';
        case 'page_unloaded': return 'page_unload';
        case 'creative_removed': return 'creative_removed';
        case 'destroyed': return 'destroyed';
    }
}

export interface SdkBridgeOptions {
    creativeEl: HTMLElement;
    deliveryConfig: DeliveryRuntimeConfig;
    adSessionId: string;
}

export interface SdkBridge {
    // Запускает измерение — вызвать после render_confirmed
    startMeasurement(renderConfirmedAt: number): void;
    // Обрабатывает video DOM событие с атрибуцией source
    handleVideoEvent(type: string, video: HTMLVideoElement): void;
    // Устанавливает pending source для следующего matching события (100ms window)
    setPendingSource(eventType: string, source: PlayerActionSource): void;
    reportAudioConnection(connection: AudioConnection): void;
    // Финализирует сессию
    finalize(outcome: PlayerTerminalOutcome): void;
    // Отправляет delivery event (fire-and-forget)
    sendEvent(
        eventType: AdSessionDeliveryEventType,
        errorCode?: AdSessionPlayerErrorCode,
    ): void;
    readonly adSessionId: string;
    destroy(): void;
}

export function createSdkBridge(opts: SdkBridgeOptions): SdkBridge {
    const { deliveryConfig, adSessionId } = opts;

    const adSessionIdBranded = AdSessionIdSchema.parse(adSessionId);

    const meta = {
        tagUuid: deliveryConfig.tagUuid,
        tagConstantsVersion: deliveryConfig.tagConstantsVersion,
        campaignId: deliveryConfig.placementUuid,
        creativeId: deliveryConfig.creativeVersionUuid,
        creativeType: deliveryConfig.creativeType,
        skippable: deliveryConfig.skippable,
        endpoint: deliveryConfig.collectEndpoint,
        adSessionIdentity: {
            adSessionId: adSessionIdBranded,
            placementUuid: deliveryConfig.placementUuid,
            creativeVersionUuid: deliveryConfig.creativeVersionUuid,
            creativeType: deliveryConfig.creativeType,
            deliveryMode: deliveryConfig.deliveryMode,
            measurementMode: 'full_cpmind_player' as const,
        },
    };

    const config = {
        debug: typeof window !== 'undefined' &&
            window.location.search.includes('cpmind_debug=1'),
        constants: deliveryConfig.tagConstants,
    };

    const session: MeasurementSession = prepareMeasurementSession({
        creativeEl: opts.creativeEl,
        meta,
        config,
    });

    const s6 = createS6AccumulatorState('unknown', 0);

    const vs: VideoPlaybackState = {
        isMuted: deliveryConfig.initialMuted,
        volume: deliveryConfig.initialMuted ? 0 : 1,
        isPaused: true,
        isEnded: false,
        previouslyMuted: deliveryConfig.initialMuted,
        durationSec: 0,
        currentTimeSec: 0,
    };

    let pendingAction: PendingAction | null = null;
    let finalized = false;

    function consumePendingSource(eventType: string): PlayerActionSource {
        if (pendingAction === null) return 'unknown';
        const age = Date.now() - pendingAction.setAt;
        if (age > ACTION_SOURCE_WINDOW_MS) {
            pendingAction = null;
            return 'browser';
        }
        const src = pendingAction.source;
        pendingAction = null;
        return src;
    }

    function reportEvent(event: VideoMeasurementEvent): void {
        if (finalized) return;
        session.reportVideoEvent(event);
    }

    return {
        adSessionId,

        startMeasurement(renderConfirmedAt: number): void {
            session.startMeasurement(renderConfirmedAt);
        },

        handleVideoEvent(type: string, video: HTMLVideoElement): void {
            if (finalized) return;
            const nowMs = performance.now();

            switch (type) {
                case 'loadedmetadata': {
                    vs.durationSec = video.duration;
                    onS6LoadedMetadata(s6, video.duration);
                    reportEvent({
                        type: 'duration_known',
                        durationSec: video.duration,
                        timestampMs: nowMs,
                    });
                    break;
                }
                case 'play': {
                    const wasEnded = vs.isEnded;
                    vs.isPaused = false;
                    vs.isEnded = false;
                    onS6Play(s6, vs.isMuted, vs.volume);

                    if (wasEnded) {
                        reportEvent({
                            type: 'replay',
                            source: consumePendingSource('play'),
                            timestampMs: nowMs,
                        });
                    } else {
                        reportEvent({
                            type: 'play',
                            source: consumePendingSource('play'),
                            timestampMs: nowMs,
                        });
                    }
                    break;
                }
                case 'pause': {
                    if (vs.isEnded) break;
                    vs.isPaused = true;
                    onS6Pause(s6);
                    reportEvent({
                        type: 'pause',
                        source: consumePendingSource('pause'),
                        timestampMs: nowMs,
                    });
                    break;
                }
                case 'ended': {
                    vs.isEnded = true;
                    vs.isPaused = false;
                    onS6Ended(s6, vs.isMuted, vs.volume);
                    reportEvent({
                        type: 'complete',
                        timestampMs: nowMs,
                    });
                    break;
                }
                case 'timeupdate': {
                    vs.currentTimeSec = video.currentTime;
                    onS6TimeUpdate(s6, video.currentTime, vs.isMuted, vs.volume);

                    if (vs.durationSec > 0) {
                        reportEvent({
                            type: 'progress',
                            currentTimeSec: video.currentTime,
                            durationSec: vs.durationSec,
                            timestampMs: nowMs,
                        });
                    }
                    break;
                }
                case 'seeking': {
                    onS6Seeking(s6);
                    break;
                }
                case 'seeked': {
                    onS6Seeked(s6, video.currentTime);
                    const direction = video.currentTime >= vs.currentTimeSec
                        ? 'seek_forward'
                        : 'rewind';
                    void direction;
                    reportEvent({
                        type: 'seek',
                        fromSec: vs.currentTimeSec,
                        toSec: video.currentTime,
                        source: consumePendingSource('seek'),
                        timestampMs: nowMs,
                    });
                    vs.currentTimeSec = video.currentTime;
                    break;
                }
                case 'volumechange': {
                    const nowMuted = video.muted;
                    const nowVolume = video.volume;
                    const source = consumePendingSource('volumechange');

                    onS6VolumeChange(
                        s6,
                        nowMuted,
                        nowVolume,
                        vs.isPaused,
                        vs.isEnded,
                        vs.previouslyMuted,
                    );

                    const muteChanged = nowMuted !== vs.isMuted;
                    const volumeChanged = Math.abs(nowVolume - vs.volume) > 0.01;

                    if (muteChanged) {
                        if (nowMuted) {
                            reportEvent({ type: 'mute', source, timestampMs: nowMs });
                        } else {
                            reportEvent({ type: 'unmute', source, timestampMs: nowMs });
                        }
                    } else if (volumeChanged) {
                        reportEvent({ type: 'volume', volume: nowVolume, source, timestampMs: nowMs });
                    }

                    vs.previouslyMuted = vs.isMuted;
                    vs.isMuted = nowMuted;
                    vs.volume = nowVolume;
                    break;
                }
            }
        },

        reportAudioConnection(connection: AudioConnection): void {
            if (finalized) return;
            onS6AudioConnectionDetected(s6, connection);
            reportEvent({
                type: 'audio_connection',
                connection,
                timestampMs: performance.now(),
            });
        },

        setPendingSource(eventType: string, source: PlayerActionSource): void {
            pendingAction = {
                source,
                setAt: Date.now(),
            };
            void eventType;
        },

        finalize(outcome: PlayerTerminalOutcome): void {
            if (finalized) return;
            finalized = true;

            if (outcome.type === 'skipped') {
                onS6Skip(s6);
                session.reportVideoEvent({
                    type: 'skip',
                    source: 'type' in outcome && 'source' in outcome
                        ? (outcome as { type: string; source: PlayerActionSource }).source
                        : 'user',
                    timestampMs: performance.now(),
                });
            }

            const reason = terminalOutcomeToFinalizationReason(outcome);
            session.finalize(reason);
        },

        sendEvent(
            eventType: AdSessionDeliveryEventType,
            errorCode?: AdSessionPlayerErrorCode,
        ): void {
            const payload = {
                adSessionId: adSessionIdBranded,
                eventType,
                timestampMs: Date.now(),
                ...(errorCode !== undefined && { errorCode }),
            };
            void sendDeliveryEvent(payload, deliveryConfig.deliveryEventEndpoint).catch(() => {
                // Delivery events — best-effort
            });
        },

        destroy(): void {
            if (!finalized) {
                finalized = true;
                session.destroy();
            }
        },
    };
}