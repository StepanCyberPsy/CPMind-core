import type { AudioConnection } from '@cpmind/shared';
import type { S6AccumulatorState, S6RawData } from '../types.js';

// Максимальная скорость воспроизведения, при которой шаг позиции считается непрерывным
const MAX_PLAYBACK_RATE = 2;

// Абсолютный допуск шага позиции: джиттер timeupdate и буферизация
const POSITION_STEP_TOLERANCE_SEC = 0.5;

// Допуск достижения конца ролика: последний timeupdate приходит до фактического конца
const END_TOLERANCE_SEC = 0.5;
const REPLAY_SEEK_BACK_SEC = 0.5;

function isAudible(isMuted: boolean, volume: number): boolean {
    return !isMuted && volume > 0;
}

function accumulateAudibleTime(state: S6AccumulatorState): void {
    if (state.audibleTimeStart === null) return;
    state.audible_time_sec += (Date.now() - state.audibleTimeStart) / 1000;
    state.audibleTimeStart = null;
}

// Сдвигает границу непрерывно просмотренного отрезка. Шаг засчитывается, только если
// он начинается внутри просмотренного отрезка и не превышает прошедшее время с учётом
// playbackRate — перемотка вперёд досмотр не увеличивает
function advanceWatchedFrontier(
    state: S6AccumulatorState,
    positionSec: number,
    nowMs: number,
): void {
    const previousSec = state.lastSeekTime;
    const stepSec = positionSec - previousSec;
    const elapsedSec = state.lastTickAt !== null
        ? Math.max(0, nowMs - state.lastTickAt) / 1000
        : 0;
    const maxStepSec = elapsedSec * MAX_PLAYBACK_RATE + POSITION_STEP_TOLERANCE_SEC;
    const isContinuous = stepSec >= 0 && stepSec <= maxStepSec;
    const startsInsideWatched = previousSec <= state.watchedFrontierSec + POSITION_STEP_TOLERANCE_SEC;

    if (isContinuous && startsInsideWatched && positionSec > state.watchedFrontierSec) {
        state.watchedFrontierSec = state.duration > 0
            ? Math.min(positionSec, state.duration)
            : positionSec;
    }
}

function markCompletionIfWatched(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
): void {
    if (state.completion || state.duration <= 0) return;
    if (state.watchedFrontierSec < state.duration - END_TOLERANCE_SEC) return;

    state.completion = true;
    state.completion_rate_pct = 100;
    if (isAudible(isMuted, volume)) state.audible_quartile_100 = true;
}

// Квартили и процент досмотра — по просмотренному отрезку, а не по позиции воспроизведения
function checkQuartiles(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
): void {
    if (state.duration <= 0) return;

    const pct = state.watchedFrontierSec / state.duration;
    const audible = isAudible(isMuted, volume);

    if (state.quartileSource !== 'events' && !state.quartile_25 && pct >= 0.25) {
        state.quartile_25 = true;
        if (audible) state.audible_quartile_25 = true;
    }
    if (state.quartileSource !== 'events' && !state.quartile_50 && pct >= 0.50) {
        state.quartile_50 = true;
        if (audible) state.audible_quartile_50 = true;
    }
    if (state.quartileSource !== 'events' && !state.quartile_75 && pct >= 0.75) {
        state.quartile_75 = true;
        if (audible) state.audible_quartile_75 = true;
    }
    if (pct * 100 > state.completion_rate_pct) {
        state.completion_rate_pct = Math.min(100, pct * 100);
    }

    markCompletionIfWatched(state, isMuted, volume);
}

function updateMutedStatus(state: S6AccumulatorState): void {
    if (state.everMutedWhilePlaying && state.everUnmutedWhilePlaying) {
        state.muted_status = 'mixed';
    } else if (state.everUnmutedWhilePlaying) {
        state.muted_status = 'unmuted';
    } else {
        state.muted_status = 'muted';
    }
}

export function createS6AccumulatorState(
    audioConnection: AudioConnection = 'unknown',
    initialVolume = 0,
    quartileSource: 'progress' | 'events' = 'progress',
): S6AccumulatorState {
    return {
        quartileSource,
        duration: 0,
        lastSeekTime: 0,
        isSeeking: false,
        videoEndedInSegment: false,
        audibleTimeStart: null,
        everMutedWhilePlaying: false,
        everUnmutedWhilePlaying: false,
        watchedFrontierSec: 0,
        lastTickAt: null,
        play_initiated: false,
        quartile_25: false,
        quartile_50: false,
        quartile_75: false,
        completion: false,
        completion_rate_pct: 0,
        pause_initiated: false,
        skipped: false,
        replay_count: 0,
        muted_status: 'muted',
        volume_level: Math.round(initialVolume * 100),
        audio_connection: audioConnection,
        audible_time_sec: 0,
        audible_quartile_25: false,
        audible_quartile_50: false,
        audible_quartile_75: false,
        audible_quartile_100: false,
        unmuted_by_user: false,
        muted_by_user: false,
        closed_by_user: false,
        start_muted: null,
    };
}

// Только явный событийный режим: отдельное событие не доказывает нижние квартили.
export function onS6Quartile(
    state: S6AccumulatorState,
    quarter: 25 | 50 | 75 | 100,
    isMuted: boolean,
    volume: number,
): void {
    // Завершение и audible_quartile_100 по-прежнему подтверждает complete.
    if (state.quartileSource !== 'events' || quarter === 100) return;
    const flag = `quartile_${quarter}` as const;
    if (state[flag]) return;
    state[flag] = true;
    state[`audible_quartile_${quarter}`] = isAudible(isMuted, volume);
}

// Длительность live-потока (Infinity) и невалидные значения не принимаются
export function onS6LoadedMetadata(state: S6AccumulatorState, duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) return;
    state.duration = duration;
}

// currentTime задаёт начало просмотренного отрезка при первом старте: измерение
// может начаться не с начала ролика (autoplay до инициализации legacy-тега)
export function onS6Play(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
    currentTime?: number,
): void {
    if (!state.play_initiated && currentTime !== undefined) {
        state.watchedFrontierSec = Math.max(state.watchedFrontierSec, currentTime);
        state.lastSeekTime = currentTime;
    }

    if (state.start_muted === null) {
        state.start_muted = !isAudible(isMuted, volume);
    }

    state.play_initiated = true;
    state.lastTickAt = Date.now();

    if (state.videoEndedInSegment) {
        state.replay_count += 1;
        state.videoEndedInSegment = false;
    }

    if (isAudible(isMuted, volume)) {
        if (state.audibleTimeStart === null) state.audibleTimeStart = Date.now();
        state.everUnmutedWhilePlaying = true;
    } else {
        state.everMutedWhilePlaying = true;
    }

    updateMutedStatus(state);
}

export function onS6Pause(state: S6AccumulatorState): void {
    state.pause_initiated = true;
    state.lastTickAt = null;
    accumulateAudibleTime(state);
}

export function onS6Ended(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
): void {
    if (state.duration > 0) {
        if (!state.isSeeking) {
            advanceWatchedFrontier(state, state.duration, Date.now());
        }
        state.lastSeekTime = state.duration;
        checkQuartiles(state, isMuted, volume);
    } else {
        // Длительность неизвестна — досмотр подтверждается только событием завершения
        state.completion = true;
        state.completion_rate_pct = 100;
        if (isAudible(isMuted, volume)) state.audible_quartile_100 = true;
    }

    state.videoEndedInSegment = true;
    state.lastTickAt = null;
    accumulateAudibleTime(state);
}

export function onS6TimeUpdate(
    state: S6AccumulatorState,
    currentTime: number,
    isMuted: boolean,
    volume: number,
): void {
    if (!state.isSeeking) {
        const nowMs = Date.now();
        advanceWatchedFrontier(state, currentTime, nowMs);
        state.lastSeekTime = currentTime;
        if (state.lastTickAt !== null) state.lastTickAt = nowMs;
    }

    checkQuartiles(state, isMuted, volume);
    state.volume_level = Math.round(volume * 100);
}

// initiatedByUser отделяет действие зрителя от программного изменения звука.
// Legacy-адаптер источник не различает — значение по умолчанию сохраняет его поведение
export function onS6VolumeChange(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
    isPaused: boolean,
    isEnded: boolean,
    previouslyMuted: boolean,
    initiatedByUser = true,
): void {
    const nowAudible = isAudible(isMuted, volume);
    const wasAudible = state.audibleTimeStart !== null;

    state.volume_level = Math.round(volume * 100);

    if (initiatedByUser) {
        if (previouslyMuted && !isMuted) state.unmuted_by_user = true;
        if (!previouslyMuted && isMuted) state.muted_by_user = true;
    }

    if (!isPaused && !isEnded) {
        if (nowAudible && !wasAudible) {
            state.audibleTimeStart = Date.now();
            state.everUnmutedWhilePlaying = true;
        } else if (!nowAudible && wasAudible) {
            accumulateAudibleTime(state);
            state.everMutedWhilePlaying = true;
        }
    }

    updateMutedStatus(state);
}

export function onS6Seeking(state: S6AccumulatorState): void {
    state.isSeeking = true;
}

// previousTime — позиция до перемотки, если runtime передаёт её явно.
// Иначе используется последняя позиция воспроизведения до события seeking
export function onS6Seeked(
    state: S6AccumulatorState,
    newTime: number,
    previousTime?: number,
): void {
    const fromSec = previousTime ?? state.lastSeekTime;

    state.isSeeking = false;
    if (newTime < fromSec - REPLAY_SEEK_BACK_SEC) state.replay_count += 1;
    state.lastSeekTime = newTime;
    if (state.lastTickAt !== null) state.lastTickAt = Date.now();
    if (state.videoEndedInSegment && newTime < state.duration - REPLAY_SEEK_BACK_SEC) {
        state.videoEndedInSegment = false;
    }
}

export function onS6Skip(state: S6AccumulatorState): void {
    state.skipped = true;
}

export function onS6Close(state: S6AccumulatorState): void {
    state.closed_by_user = true;
}

export function onS6AudioConnectionDetected(
    state: S6AccumulatorState,
    connection: AudioConnection,
): void {
    state.audio_connection = connection;
}

export function getS6Data(state: S6AccumulatorState): S6RawData {
    let finalAudibleTimeSec = state.audible_time_sec;
    if (state.audibleTimeStart !== null) {
        finalAudibleTimeSec += (Date.now() - state.audibleTimeStart) / 1000;
    }

    const muted_throughout = state.play_initiated && !state.everUnmutedWhilePlaying;

    let muted_status: 'muted' | 'unmuted' | 'mixed';
    if (state.everMutedWhilePlaying && state.everUnmutedWhilePlaying) {
        muted_status = 'mixed';
    } else if (state.everUnmutedWhilePlaying) {
        muted_status = 'unmuted';
    } else {
        muted_status = 'muted';
    }

    return {
        play_initiated: state.play_initiated,
        quartile_25: state.quartile_25,
        quartile_50: state.quartile_50,
        quartile_75: state.quartile_75,
        completion: state.completion,
        completion_rate_pct: Math.min(100, state.completion_rate_pct),
        pause_initiated: state.pause_initiated,
        skipped: state.skipped,
        replay_count: state.replay_count,
        muted_status,
        volume_level: state.volume_level,
        audio_connection: state.audio_connection,
        audible_time_sec: finalAudibleTimeSec,
        duration_sec: state.duration > 0 ? state.duration : null,
        audible_quartile_25: state.audible_quartile_25,
        audible_quartile_50: state.audible_quartile_50,
        audible_quartile_75: state.audible_quartile_75,
        audible_quartile_100: state.audible_quartile_100,
        muted_throughout,
        unmuted_by_user: state.unmuted_by_user,
        muted_by_user: state.muted_by_user,
        closed_by_user: state.closed_by_user,
        ...(state.start_muted !== null && { start_muted: state.start_muted }),
    };
}

// Новый сегмент продолжает просмотр с текущей позиции: граница просмотренного отрезка
// и состояние звука на старте сегмента берутся из фактического состояния видео
export function resetS6Accumulator(
    state: S6AccumulatorState,
    currentTime: number,
    isPaused: boolean,
    isEnded: boolean,
    isMuted: boolean,
    volume: number,
): void {
    accumulateAudibleTime(state);

    const isPlaying = !isPaused && !isEnded;

    state.lastSeekTime = currentTime;
    state.isSeeking = false;
    state.videoEndedInSegment = false;
    state.audibleTimeStart = null;
    state.everMutedWhilePlaying = false;
    state.everUnmutedWhilePlaying = false;
    state.watchedFrontierSec = currentTime;
    state.lastTickAt = isPlaying ? Date.now() : null;
    state.play_initiated = isPlaying;
    state.quartile_25 = false;
    state.quartile_50 = false;
    state.quartile_75 = false;
    state.completion = false;
    state.completion_rate_pct = 0;
    state.pause_initiated = false;
    state.skipped = false;
    state.replay_count = 0;
    state.muted_status = 'muted';
    state.volume_level = Math.round(volume * 100);
    state.audible_time_sec = 0;
    state.audible_quartile_25 = false;
    state.audible_quartile_50 = false;
    state.audible_quartile_75 = false;
    state.audible_quartile_100 = false;
    state.unmuted_by_user = false;
    state.muted_by_user = false;
    state.closed_by_user = false;
    state.start_muted = isPlaying ? !isAudible(isMuted, volume) : null;

    if (isPlaying) {
        if (isAudible(isMuted, volume)) {
            state.audibleTimeStart = Date.now();
            state.everUnmutedWhilePlaying = true;
        } else {
            state.everMutedWhilePlaying = true;
        }
        updateMutedStatus(state);
    }
}
