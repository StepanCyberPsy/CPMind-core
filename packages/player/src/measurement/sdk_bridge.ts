import {
    prepareMeasurementSession,
    sendDeliveryEvent,
} from '@cpmind/sdk';
import type {
    MeasurementSession,
    SdkSignalConfig,
    SessionPayloadMeta,
} from '@cpmind/sdk';
import type {
    AdSessionAutoplayOutcome,
    AdSessionDeliveryEventType,
    AdSessionId,
    AudioConnection,
    DeliveryEventDetails,
    DeliveryEventPayload,
    MeasurementFinalizationReason,
    PlayerActionSource,
    PlayerTerminalOutcome,
    VideoMeasurementEvent,
} from '@cpmind/shared';
import type { VideoPlaybackState } from '../vast/types.js';
import type { ResolvedDeliveryConfig } from '../types.js';
import { ACTION_SOURCE_WINDOW_MS } from '../player-config.js';

const VOLUME_EPSILON = 0.01;

interface PendingAction {
    source: PlayerActionSource;
    setAt: number;
}

export function terminalOutcomeToFinalizationReason(
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
    video: HTMLVideoElement;
    deliveryConfig: ResolvedDeliveryConfig;
}

export interface AutoplayReport {
    outcome: AdSessionAutoplayOutcome;
    requestedMuted: boolean;
    finallyMuted: boolean;
}

export interface SdkBridge {
    readonly adSessionId: AdSessionId;
    // Результат первой попытки автозапуска — фиксируется в ad_session однократно
    reportAutoplay(report: AutoplayReport): void;
    // Создаёт measurement-сессию и запускает измерение — вызывать после первого кадра
    startMeasurement(renderConfirmedAt: number): void;
    // Обрабатывает video DOM событие с атрибуцией source
    handleVideoEvent(type: string): void;
    // Устанавливает pending source для следующего события (100ms window)
    setPendingSource(source: PlayerActionSource): void;
    reportAudioConnection(connection: AudioConnection): void;
    // Передаёт закрытие поверхности с источником действия — до финализации сессии
    reportClose(source: PlayerActionSource): void;
    // Наблюдение поверхности рантаймом: отправляет только формат, который её наблюдает
    reportViewportVisibility(visible: boolean): void;
    // Зона кнопки пропуска для сигнала взаимодействий
    trackSkipZone(el: HTMLElement): void;
    // Финализирует сессию
    finalize(outcome: PlayerTerminalOutcome): void;
    // Отправляет delivery event (fire-and-forget)
    sendEvent(
        eventType: AdSessionDeliveryEventType,
        details?: DeliveryEventDetails,
    ): void;
    destroy(): void;
}

// Measurement-сессия создаётся в момент подтверждённого старта воспроизведения: окно
// измерения начинается с первого кадра, видео без старта показом не считается.
// Состояние видео ведётся с создания элемента и передаётся сессии как начальное
export function createSdkBridge(opts: SdkBridgeOptions): SdkBridge {
    const {
        creativeEl,
        video,
        deliveryConfig,
    } = opts;
    const adSessionId = deliveryConfig.adSessionId;

    const meta: SessionPayloadMeta = {
        tagUuid: deliveryConfig.tagUuid,
        tagConstantsVersion: deliveryConfig.tagConstantsVersion,
        campaignId: deliveryConfig.campaignId,
        creativeId: deliveryConfig.creativeId,
        creativeType: deliveryConfig.creativeType,
        skippable: deliveryConfig.skippable,
        endpoint: deliveryConfig.collectEndpoint,
        adSessionIdentity: {
            adSessionId,
            placementUuid: deliveryConfig.placementUuid,
            creativeVersionUuid: deliveryConfig.creativeVersionUuid,
            creativeType: deliveryConfig.creativeType,
            deliveryMode: deliveryConfig.deliveryMode,
            measurementMode: deliveryConfig.measurementMode,
        },
    };

    const config: SdkSignalConfig = {
        debug: window.location.search.includes('cpmind_debug=1'),
        constants: deliveryConfig.tagConstants,
    };

    const vs: VideoPlaybackState = {
        isMuted: video.muted,
        volume: video.volume,
        isPaused: video.paused,
        isEnded: video.ended,
        previouslyMuted: video.muted,
        durationSec: 0,
        currentTimeSec: video.currentTime,
    };

    let session: MeasurementSession | null = null;
    let pendingAction: PendingAction | null = null;
    let startSource: PlayerActionSource = 'player';
    let audioConnection: AudioConnection | null = null;
    let isSeeking = false;
    let seekFromSec = 0;
    let autoplayReported = false;
    let finalized = false;

    function consumePendingSource(): PlayerActionSource {
        if (pendingAction === null) return 'unknown';
        const age = Date.now() - pendingAction.setAt;
        const source = age > ACTION_SOURCE_WINDOW_MS ? 'browser' : pendingAction.source;
        pendingAction = null;
        return source;
    }

    function reportEvent(event: VideoMeasurementEvent): void {
        if (finalized || session === null) return;
        session.reportVideoEvent(event);
    }

    // Длительность читается из элемента, а не только по событию loadedmetadata:
    // подписка на события видео регистрируется после ожидания canplay, поэтому
    // loadedmetadata к этому моменту уже произошло и обработчик его не получает.
    // Без длительности прогресс не передаётся в S6 и квартили не фиксируются
    function syncDuration(nowMs: number): boolean {
        if (vs.durationSec > 0) return true;

        const durationSec = video.duration;
        if (!Number.isFinite(durationSec) || durationSec <= 0) return false;

        vs.durationSec = durationSec;
        reportEvent({
            type: 'duration_known',
            durationSec,
            timestampMs: nowMs,
        });
        return true;
    }

    function sendEvent(
        eventType: AdSessionDeliveryEventType,
        details: DeliveryEventDetails = {},
    ): void {
        const payload: DeliveryEventPayload = {
            adSessionId,
            eventType,
            timestampMs: Date.now(),
            ...details,
        };
        void sendDeliveryEvent(payload, deliveryConfig.deliveryEventEndpoint).catch(() => {
            // Delivery events — best-effort
        });
    }

    return {
        adSessionId,

        reportAutoplay(report: AutoplayReport): void {
            if (autoplayReported) return;
            autoplayReported = true;
            // Отказ автозапуска фиксируется наравне с успехом: откат в беззвучный режим
            // выполняется в policy до повторной попытки и при полной блокировке тоже
            sendEvent('autoplay_resolved', {
                autoplayOutcome: report.outcome,
                startMuted: report.finallyMuted,
                mutedByBrowser: !report.requestedMuted && report.finallyMuted,
            });
        },

        startMeasurement(renderConfirmedAt: number): void {
            if (finalized || session !== null) return;

            vs.isMuted = video.muted;
            vs.volume = video.volume;
            vs.currentTimeSec = video.currentTime;

            // Сессия ещё не создана, событие duration_known отбрасывается —
            // длительность передаётся в неё начальным состоянием видео
            syncDuration(performance.now());

            const prepared = prepareMeasurementSession({
                creativeEl,
                meta,
                config,
                video: {
                    muted: vs.isMuted,
                    volume: vs.volume,
                    durationSec: vs.durationSec > 0 ? vs.durationSec : null,
                },
            });

            session = prepared;
            prepared.startMeasurement(renderConfirmedAt);

            const nowMs = performance.now();

            if (vs.durationSec > 0) {
                prepared.reportVideoEvent({
                    type: 'progress',
                    currentTimeSec: vs.currentTimeSec,
                    durationSec: vs.durationSec,
                    timestampMs: nowMs,
                });
            }

            if (!video.paused && !video.ended) {
                vs.isPaused = false;
                prepared.reportVideoEvent({
                    type: 'play',
                    source: startSource,
                    timestampMs: nowMs,
                });
            }

            if (audioConnection !== null) {
                prepared.reportVideoEvent({
                    type: 'audio_connection',
                    connection: audioConnection,
                    timestampMs: nowMs,
                });
            }

            sendEvent('measurement_started');
        },

        handleVideoEvent(type: string): void {
            if (finalized) return;
            const nowMs = performance.now();

            switch (type) {
                case 'loadedmetadata': {
                    syncDuration(nowMs);
                    break;
                }
                case 'play': {
                    const wasEnded = vs.isEnded;
                    const source = consumePendingSource();
                    vs.isPaused = false;
                    vs.isEnded = false;

                    if (session === null) {
                        startSource = source;
                        break;
                    }

                    if (wasEnded) {
                        reportEvent({
                            type: 'replay',
                            source,
                            timestampMs: nowMs,
                        });
                    } else {
                        reportEvent({
                            type: 'play',
                            source,
                            timestampMs: nowMs,
                        });
                    }
                    break;
                }
                case 'pause': {
                    // Браузер генерирует pause перед ended — завершение паузой не является
                    if (video.ended || vs.isEnded) break;
                    vs.isPaused = true;
                    reportEvent({
                        type: 'pause',
                        source: consumePendingSource(),
                        timestampMs: nowMs,
                    });
                    break;
                }
                case 'ended': {
                    vs.isEnded = true;
                    vs.isPaused = true;
                    reportEvent({
                        type: 'complete',
                        timestampMs: nowMs,
                    });
                    break;
                }
                case 'timeupdate': {
                    if (isSeeking) break;
                    vs.currentTimeSec = video.currentTime;

                    // Длительность может стать известна позже первого timeupdate:
                    // прогресс начинает передаваться с того момента, как она появилась
                    if (syncDuration(nowMs)) {
                        reportEvent({
                            type: 'progress',
                            currentTimeSec: Math.min(video.currentTime, vs.durationSec),
                            durationSec: vs.durationSec,
                            timestampMs: nowMs,
                        });
                    }
                    break;
                }
                case 'seeking': {
                    // Исходная позиция фиксируется один раз на серию перемоток
                    if (!isSeeking) {
                        isSeeking = true;
                        seekFromSec = vs.currentTimeSec;
                    }
                    break;
                }
                case 'seeked': {
                    isSeeking = false;
                    const toSec = video.currentTime;
                    reportEvent({
                        type: 'seek',
                        fromSec: seekFromSec,
                        toSec,
                        source: consumePendingSource(),
                        timestampMs: nowMs,
                    });
                    vs.currentTimeSec = toSec;
                    break;
                }
                case 'volumechange': {
                    const nowMuted = video.muted;
                    const nowVolume = video.volume;
                    const source = consumePendingSource();
                    const muteChanged = nowMuted !== vs.isMuted;
                    const volumeChanged = Math.abs(nowVolume - vs.volume) > VOLUME_EPSILON;

                    vs.previouslyMuted = vs.isMuted;
                    vs.isMuted = nowMuted;
                    vs.volume = nowVolume;

                    // Громкость передаётся до смены mute: время со звуком считается по итоговому состоянию
                    if (volumeChanged) {
                        reportEvent({
                            type: 'volume',
                            volume: nowVolume,
                            source,
                            timestampMs: nowMs,
                        });
                    }

                    if (muteChanged) {
                        reportEvent({
                            type: nowMuted ? 'mute' : 'unmute',
                            source,
                            timestampMs: nowMs,
                        });
                    }
                    break;
                }
            }
        },

        setPendingSource(source: PlayerActionSource): void {
            pendingAction = {
                source,
                setAt: Date.now(),
            };
        },

        reportAudioConnection(connection: AudioConnection): void {
            audioConnection = connection;
            reportEvent({
                type: 'audio_connection',
                connection,
                timestampMs: performance.now(),
            });
        },

        reportClose(source: PlayerActionSource): void {
            reportEvent({
                type: 'close',
                source,
                timestampMs: performance.now(),
            });
        },

        reportViewportVisibility(visible: boolean): void {
            reportEvent({
                type: visible ? 'viewport_enter' : 'viewport_exit',
                timestampMs: performance.now(),
            });
        },

        trackSkipZone(el: HTMLElement): void {
            if (finalized || session === null) return;
            session.trackSkipZone(el);
        },

        finalize(outcome: PlayerTerminalOutcome): void {
            if (finalized) return;
            finalized = true;

            if (session === null) return;

            session.finalize(terminalOutcomeToFinalizationReason(outcome));
            session.destroy();
        },

        sendEvent,

        destroy(): void {
            if (finalized) return;
            finalized = true;
            session?.destroy();
        },
    };
}