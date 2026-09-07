import type { AdSessionId, MeasurementFinalizationReason } from '@cpmind/shared';
import type { VideoMeasurementEvent, AudioConnection } from '@cpmind/shared';
import type { Session, SdkSignalConfig } from './types.js';
import type { SessionPayloadMeta } from './session.js';
import { createSession } from './session.js';
import { getPublisherDomain } from './utils/publisher_domain.js';
import { MeasurementSurface } from './surface/surface.js';
import { MeasuredElement } from './surface/element.js';
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
} from './signals/s6.js';

export type MeasurementSessionState =
    | 'PREPARED'
    | 'MEASURING'
    | 'FINALIZING'
    | 'FINALIZED'
    | 'DESTROYED';

export interface MeasurementSession {
    readonly adSessionId: AdSessionId | null;
    readonly state: MeasurementSessionState;
    startMeasurement(timestampMs?: number): void;
    reportVideoEvent(event: VideoMeasurementEvent): void;
    finalize(reason: MeasurementFinalizationReason): void;
    destroy(): void;
}

export interface PrepareMeasurementSessionInput {
    creativeEl: HTMLElement;
    meta: SessionPayloadMeta;
    config: SdkSignalConfig;
}

// Внутреннее состояние video-плеера для корректной передачи в S6 accumulator
interface VideoPlaybackState {
    isMuted: boolean;
    volume: number;
    isPaused: boolean;
    isEnded: boolean;
    previouslyMuted: boolean;
}

class MeasurementSessionImpl implements MeasurementSession {
    private _state: MeasurementSessionState = 'PREPARED';
    private readonly surface: MeasurementSurface;
    private readonly measuredElement: MeasuredElement;
    private readonly session: Session;
    private readonly meta: SessionPayloadMeta;
    private videoState: VideoPlaybackState = {
        isMuted: true,
        volume: 0,
        isPaused: true,
        isEnded: false,
        previouslyMuted: true,
    };

    constructor(input: PrepareMeasurementSessionInput) {
        this.meta = input.meta;

        this.session = createSession({
            publisherDomain: getPublisherDomain(),
        });

        this.measuredElement = new MeasuredElement(
            input.creativeEl,
            () => this.finalize('creative_removed'),
        );

        this.surface = new MeasurementSurface(
            input.creativeEl,
            this.session,
            input.config,
            this.meta,
        );

        this.surface.init();
    }

    get adSessionId(): AdSessionId | null {
        return this.meta.adSessionIdentity?.adSessionId ?? null;
    }

    get state(): MeasurementSessionState {
        return this._state;
    }

    startMeasurement(timestampMs?: number): void {
        if (this._state !== 'PREPARED') return;

        this._state = 'MEASURING';

        // Устанавливаем timestampStart если не был установлен S1 (например instream без viewport)
        if (this.session.timestampStart === 0) {
            this.session.timestampStart = timestampMs ?? Date.now();
        }
    }

    reportVideoEvent(event: VideoMeasurementEvent): void {
        if (this._state !== 'MEASURING') return;

        // Инициализируем S6 accumulator при первом видео-событии
        if (this.session.s6 === null) {
            this.session.s6 = createS6AccumulatorState('unknown', this.videoState.volume);
        }

        const s6 = this.session.s6;
        const vs = this.videoState;

        switch (event.type) {
            case 'duration_known': {
                onS6LoadedMetadata(s6, event.durationSec);
                break;
            }
            case 'play': {
                vs.isPaused = false;
                vs.isEnded = false;
                onS6Play(s6, vs.isMuted, vs.volume);
                break;
            }
            case 'resume': {
                vs.isPaused = false;
                onS6Play(s6, vs.isMuted, vs.volume);
                break;
            }
            case 'pause': {
                vs.isPaused = true;
                onS6Pause(s6);
                break;
            }
            case 'complete': {
                vs.isEnded = true;
                vs.isPaused = false;
                onS6Ended(s6, vs.isMuted, vs.volume);
                break;
            }
            case 'progress': {
                onS6TimeUpdate(
                    s6,
                    event.currentTimeSec,
                    vs.isMuted,
                    vs.volume,
                );
                break;
            }
            case 'seek': {
                onS6Seeking(s6);
                onS6Seeked(s6, event.toSec);
                break;
            }
            case 'mute': {
                vs.previouslyMuted = vs.isMuted;
                vs.isMuted = true;
                onS6VolumeChange(
                    s6,
                    true,
                    vs.volume,
                    vs.isPaused,
                    vs.isEnded,
                    vs.previouslyMuted,
                );
                break;
            }
            case 'unmute': {
                vs.previouslyMuted = vs.isMuted;
                vs.isMuted = false;
                onS6VolumeChange(
                    s6,
                    false,
                    vs.volume,
                    vs.isPaused,
                    vs.isEnded,
                    vs.previouslyMuted,
                );
                break;
            }
            case 'volume': {
                vs.previouslyMuted = vs.isMuted;
                vs.volume = event.volume;
                onS6VolumeChange(
                    s6,
                    vs.isMuted,
                    event.volume,
                    vs.isPaused,
                    vs.isEnded,
                    vs.previouslyMuted,
                );
                break;
            }
            case 'skip': {
                onS6Skip(s6);
                break;
            }
            case 'replay': {
                // Полный сброс accumulator при replay — пользователь перезапустил видео
                resetS6Accumulator(
                    s6,
                    0,
                    false,
                    false,
                    vs.isMuted,
                    vs.volume,
                );
                vs.isPaused = false;
                vs.isEnded = false;
                break;
            }
            case 'quartile': {
                // Прямое проставление quartile флагов без зависимости от progress events
                const audible = !vs.isMuted && vs.volume > 0;
                if (event.value >= 25 && !s6.quartile_25) {
                    s6.quartile_25 = true;
                    if (audible) s6.audible_quartile_25 = true;
                }
                if (event.value >= 50 && !s6.quartile_50) {
                    s6.quartile_50 = true;
                    if (audible) s6.audible_quartile_50 = true;
                }
                if (event.value >= 75 && !s6.quartile_75) {
                    s6.quartile_75 = true;
                    if (audible) s6.audible_quartile_75 = true;
                }
                if (event.value === 100 && !s6.completion) {
                    s6.completion = true;
                    s6.completion_rate_pct = 100;
                    if (audible) s6.audible_quartile_100 = true;
                }
                break;
            }
            case 'audio_connection': {
                onS6AudioConnectionDetected(s6, event.connection as AudioConnection);
                break;
            }
        }
    }

    finalize(reason: MeasurementFinalizationReason): void {
        if (this._state !== 'MEASURING' && this._state !== 'PREPARED') return;

        this._state = 'FINALIZING';

        this.session.timestampEnd = Date.now();
        this.surface.finalize();

        this._state = 'FINALIZED';
        this.measuredElement.dispose();

        if (this.session.s6 !== null && reason === 'skip') {
            onS6Skip(this.session.s6);
        }
    }

    destroy(): void {
        if (this._state === 'DESTROYED') return;

        if (this._state === 'MEASURING' || this._state === 'PREPARED') {
            this.finalize('destroyed');
        }

        this._state = 'DESTROYED';
        this.surface.destroy();
        this.measuredElement.dispose();
    }
}

export function prepareMeasurementSession(
    input: PrepareMeasurementSessionInput,
): MeasurementSession {
    return new MeasurementSessionImpl(input);
}