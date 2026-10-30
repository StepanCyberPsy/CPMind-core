/**
 * Накопитель состояния воспроизведения по сообщениям SIMID:Media:*.
 *
 * Чистый модуль без обращений к DOM: источником истины служит плеер площадки,
 * а не наши замеры. Единица времени — позиция плейхеда, а не стенные часы:
 * плеер сообщает currentTime, и только по нему можно отличить фактический
 * просмотр от приостановки, троттлинга фонового таба и перемоток.
 */

/**
 * Приращение плейхеда больше этого значения воспроизведением не считается.
 * SIMID 1.2 §4.2.10 требует от плеера timeupdate не реже 250 мс; запас до 2 с
 * покрывает дрожание и троттлинг, всё что выше — перемотка вперёд.
 */
export const MAX_FORWARD_DELTA_SEC = 2;

export interface SimidAudioState {
    muted: boolean;
    volume: number;
}

export interface SimidPlaybackState {
    durationSec: number | null;
    lastPlayheadSec: number | null;
    maxPlayheadSec: number;
    playbackSec: number;
    audibleSec: number;
    audio: SimidAudioState;
    pauseCount: number;
    playCount: number;
    forwardSeekCount: number;
    backwardSeekCount: number;
    stallCount: number;
    ended: boolean;
    mediaErrorCode: number | null;
    interactionCount: number;
    droppedDeltaSec: number;
}

export type SimidMediaEvent =
    | { kind: 'durationchange'; duration: number }
    | { kind: 'timeupdate'; currentTime: number }
    | { kind: 'volumechange'; volume: number; muted: boolean }
    | { kind: 'pause' }
    | { kind: 'play' }
    | { kind: 'seeked'; currentTime: number }
    | { kind: 'stalled' }
    | { kind: 'ended' }
    | { kind: 'error'; errorCode: number | null }
    | { kind: 'interaction' };

export function createPlaybackState(initialAudio: SimidAudioState): SimidPlaybackState {
    return {
        durationSec: null,
        lastPlayheadSec: null,
        maxPlayheadSec: 0,
        playbackSec: 0,
        audibleSec: 0,
        audio: { muted: initialAudio.muted, volume: initialAudio.volume },
        pauseCount: 0,
        playCount: 0,
        forwardSeekCount: 0,
        backwardSeekCount: 0,
        stallCount: 0,
        ended: false,
        mediaErrorCode: null,
        interactionCount: 0,
        droppedDeltaSec: 0,
    };
}

function isAudible(audio: SimidAudioState): boolean {
    return !audio.muted && audio.volume > 0;
}

/**
 * Интервал между двумя timeupdate относится к состоянию звука, действовавшему
 * на протяжении этого интервала, то есть к состоянию на момент предыдущего
 * события. Та же договорённость принята в S1/S2 основного SDK: смена состояния
 * не переписывает уже накопленное время задним числом.
 */
function applyTimeUpdate(state: SimidPlaybackState, currentTime: number): void {
    if (!Number.isFinite(currentTime) || currentTime < 0) return;

    if (currentTime > state.maxPlayheadSec) state.maxPlayheadSec = currentTime;

    const previous = state.lastPlayheadSec;
    state.lastPlayheadSec = currentTime;

    if (previous === null) return;

    const delta = currentTime - previous;

    if (delta <= 0) {
        // Плейхед не продвинулся: пауза, повтор кадра или перемотка назад.
        // Перемотки считаются по событию seeked, здесь приращения просто нет
        return;
    }

    if (delta > MAX_FORWARD_DELTA_SEC) {
        state.droppedDeltaSec += delta;
        return;
    }

    state.playbackSec += delta;
    if (isAudible(state.audio)) state.audibleSec += delta;
}

export function applyMediaEvent(
    state: SimidPlaybackState,
    event: SimidMediaEvent,
): SimidPlaybackState {
    switch (event.kind) {
        case 'durationchange': {
            if (Number.isFinite(event.duration) && event.duration > 0) {
                state.durationSec = event.duration;
            }
            break;
        }
        case 'timeupdate': {
            applyTimeUpdate(state, event.currentTime);
            break;
        }
        case 'volumechange': {
            state.audio = {
                muted: event.muted,
                volume: Number.isFinite(event.volume) ? event.volume : state.audio.volume,
            };
            break;
        }
        case 'pause': {
            state.pauseCount += 1;
            break;
        }
        case 'play': {
            state.playCount += 1;
            break;
        }
        case 'seeked': {
            const previous = state.lastPlayheadSec;
            if (previous !== null && Number.isFinite(event.currentTime)) {
                if (event.currentTime < previous) state.backwardSeekCount += 1;
                else if (event.currentTime > previous) state.forwardSeekCount += 1;
            }
            // Новая опорная точка: интервал через перемотку просмотром не является
            if (Number.isFinite(event.currentTime) && event.currentTime >= 0) {
                state.lastPlayheadSec = event.currentTime;
                if (event.currentTime > state.maxPlayheadSec) {
                    state.maxPlayheadSec = event.currentTime;
                }
            }
            break;
        }
        case 'stalled': {
            state.stallCount += 1;
            break;
        }
        case 'ended': {
            state.ended = true;
            break;
        }
        case 'error': {
            state.mediaErrorCode = event.errorCode;
            break;
        }
        case 'interaction': {
            state.interactionCount += 1;
            break;
        }
    }

    return state;
}
