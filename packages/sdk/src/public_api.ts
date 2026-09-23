import type {
    AdSessionId,
    AudioConnection,
    MeasurementFinalizationReason,
    VideoMeasurementEvent,
} from '@cpmind/shared';
import type {
    Session,
    SdkSignalConfig,
    S6AccumulatorState,
} from './types.js';
import type { SessionPayloadMeta } from './session.js';
import type {
    FrameInteractionKind,
    FrameInteractionTrust,
} from './signals/frame_trust.js';
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
    reportFrameInteraction(kind: FrameInteractionKind, trust: FrameInteractionTrust): void;
    finalize(reason: MeasurementFinalizationReason): void;
    destroy(): void;
}

// Состояние видео на момент подготовки сессии — начальные значения S6 accumulator
export interface VideoSessionInitialState {
    muted: boolean;
    volume: number;
    durationSec: number | null;
}

// onFinalized вызывается один раз после отправки финального payload — в т.ч. при выгрузке
// страницы и удалении креатива из DOM
export interface PrepareMeasurementSessionInput {
    creativeEl: HTMLElement;
    meta: SessionPayloadMeta;
    config: SdkSignalConfig;
    video?: VideoSessionInitialState;
    onFinalized?: (reason: MeasurementFinalizationReason) => void;
}

// Внутреннее состояние video-плеера для корректной передачи в S6 accumulator
interface VideoPlaybackState {
    isMuted: boolean;
    volume: number;
    isPaused: boolean;
    isEnded: boolean;
    currentTimeSec: number;
    durationSec: number | null;
    audioConnection: AudioConnection;
}

class MeasurementSessionImpl implements MeasurementSession {
    private _state: MeasurementSessionState = 'PREPARED';
    private readonly surface: MeasurementSurface;
    private readonly measuredElement: MeasuredElement;
    private readonly session: Session;
    private readonly meta: SessionPayloadMeta;
    private readonly isVideo: boolean;
    private readonly videoState: VideoPlaybackState;
    private readonly onFinalized: ((reason: MeasurementFinalizationReason) => void) | null;

    // Регистрируется до инициализации поверхности: обработчик выполняется раньше pagehide
    // транспорта и снимает его, финальный payload отправляется один раз с причиной
    private readonly onPageHide = (): void => {
        this.finalize('page_unload');
    };

    constructor(input: PrepareMeasurementSessionInput) {
        this.meta = input.meta;
        this.onFinalized = input.onFinalized ?? null;
        this.isVideo = input.video !== undefined;
        this.videoState = {
            isMuted: input.video?.muted ?? true,
            volume: input.video?.volume ?? 0,
            isPaused: true,
            isEnded: false,
            currentTimeSec: 0,
            durationSec: input.video?.durationSec ?? null,
            audioConnection: 'unknown',
        };

        this.session = createSession({
            publisherDomain: getPublisherDomain(),
        });

        this.measuredElement = new MeasuredElement(
            input.creativeEl,
            () => this.finalize('creative_removed'),
        );

        // Начало hosted-измерения задаёт runtime: момент подтверждённого первого кадра
        this.surface = new MeasurementSurface(
            input.creativeEl,
            this.session,
            {
                ...input.config,
                explicitStart: true,
            },
            this.meta,
            () => this.resetVideoSegment(),
        );

        window.addEventListener('pagehide', this.onPageHide);

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

        const startedAt = timestampMs ?? Date.now();

        if (this.session.timestampStart === 0) {
            this.session.timestampStart = startedAt;
        }

        // Видимость до старта измерения не учитывается
        if (this.session.viewStart !== null && this.session.viewStart < startedAt) {
            this.session.viewStart = startedAt;
        }

        if (this.isVideo) {
            this.ensureVideoAccumulator();
        }
    }

    reportVideoEvent(event: VideoMeasurementEvent): void {
        if (this._state === 'PREPARED') {
            this.applyPreStartEvent(event);
            return;
        }

        if (this._state !== 'MEASURING') return;

        const s6 = this.ensureVideoAccumulator();
        const vs = this.videoState;

        switch (event.type) {
            case 'duration_known': {
                vs.durationSec = event.durationSec;
                onS6LoadedMetadata(s6, event.durationSec);
                break;
            }
            case 'play':
            case 'resume': {
                vs.isPaused = false;
                vs.isEnded = false;
                onS6Play(
                    s6,
                    vs.isMuted,
                    vs.volume,
                    vs.currentTimeSec,
                );
                break;
            }
            case 'replay': {
                // Повторный запуск после завершения — replay_count увеличивается в onS6Play
                vs.isPaused = false;
                vs.isEnded = false;
                vs.currentTimeSec = 0;
                onS6Play(
                    s6,
                    vs.isMuted,
                    vs.volume,
                    0,
                );
                break;
            }
            case 'pause': {
                vs.isPaused = true;
                onS6Pause(s6);
                break;
            }
            case 'complete': {
                vs.isEnded = true;
                vs.isPaused = true;
                vs.currentTimeSec = vs.durationSec ?? vs.currentTimeSec;
                onS6Ended(s6, vs.isMuted, vs.volume);
                break;
            }
            case 'progress': {
                vs.currentTimeSec = event.currentTimeSec;
                onS6TimeUpdate(
                    s6,
                    event.currentTimeSec,
                    vs.isMuted,
                    vs.volume,
                );
                break;
            }
            case 'seek': {
                vs.currentTimeSec = event.toSec;
                onS6Seeking(s6);
                onS6Seeked(
                    s6,
                    event.toSec,
                    event.fromSec,
                );
                break;
            }
            case 'mute':
            case 'unmute': {
                const previouslyMuted = vs.isMuted;
                vs.isMuted = event.type === 'mute';
                onS6VolumeChange(
                    s6,
                    vs.isMuted,
                    vs.volume,
                    vs.isPaused,
                    vs.isEnded,
                    previouslyMuted,
                    event.source === 'user',
                );
                break;
            }
            case 'volume': {
                vs.volume = event.volume;
                onS6VolumeChange(
                    s6,
                    vs.isMuted,
                    event.volume,
                    vs.isPaused,
                    vs.isEnded,
                    vs.isMuted,
                    event.source === 'user',
                );
                break;
            }
            case 'skip': {
                onS6Skip(s6);
                break;
            }
            case 'quartile': {
                // Квартили вычисляются по просмотренному отрезку из progress-событий
                break;
            }
            case 'audio_connection': {
                vs.audioConnection = event.connection;
                onS6AudioConnectionDetected(s6, event.connection);
                break;
            }
        }
    }

    reportFrameInteraction(
        kind: FrameInteractionKind,
        trust: FrameInteractionTrust,
    ): void {
        if (this._state !== 'MEASURING') return;
        this.surface.reportFrameInteraction(kind, trust);
    }

    finalize(reason: MeasurementFinalizationReason): void {
        if (this._state !== 'MEASURING' && this._state !== 'PREPARED') return;

        this._state = 'FINALIZING';
        window.removeEventListener('pagehide', this.onPageHide);

        if (this.session.s6 !== null && reason === 'skip') {
            onS6Skip(this.session.s6);
        }

        this.session.timestampEnd = Date.now();
        this.surface.finalize(reason);

        this._state = 'FINALIZED';
        this.measuredElement.dispose();
        this.onFinalized?.(reason);
    }

    destroy(): void {
        if (this._state === 'DESTROYED') return;

        if (this._state === 'MEASURING' || this._state === 'PREPARED') {
            this.finalize('destroyed');
        }

        this._state = 'DESTROYED';
        window.removeEventListener('pagehide', this.onPageHide);
        this.surface.destroy();
        this.measuredElement.dispose();
    }

    private ensureVideoAccumulator(): S6AccumulatorState {
        if (this.session.s6 === null) {
            const vs = this.videoState;
            const s6 = createS6AccumulatorState(vs.audioConnection, vs.volume);
            if (vs.durationSec !== null) {
                onS6LoadedMetadata(s6, vs.durationSec);
            }
            this.session.s6 = s6;
        }
        return this.session.s6;
    }

    // До старта измерения фиксируется только состояние видео — накопители S6 не затрагиваются
    private applyPreStartEvent(event: VideoMeasurementEvent): void {
        const vs = this.videoState;

        switch (event.type) {
            case 'duration_known': {
                vs.durationSec = event.durationSec;
                break;
            }
            case 'mute': {
                vs.isMuted = true;
                break;
            }
            case 'unmute': {
                vs.isMuted = false;
                break;
            }
            case 'volume': {
                vs.volume = event.volume;
                break;
            }
            case 'progress': {
                vs.currentTimeSec = event.currentTimeSec;
                break;
            }
            case 'seek': {
                vs.currentTimeSec = event.toSec;
                break;
            }
            case 'audio_connection': {
                vs.audioConnection = event.connection;
                break;
            }
            default: {
                break;
            }
        }
    }

    // Сброс S6 при разрыве сегмента по простою — по фактическому состоянию видео
    private resetVideoSegment(): void {
        const s6 = this.session.s6;
        if (s6 === null) return;

        const vs = this.videoState;
        resetS6Accumulator(
            s6,
            vs.currentTimeSec,
            vs.isPaused,
            vs.isEnded,
            vs.isMuted,
            vs.volume,
        );
    }
}

export function prepareMeasurementSession(
    input: PrepareMeasurementSessionInput,
): MeasurementSession {
    return new MeasurementSessionImpl(input);
}