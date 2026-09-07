import type { AudioConnection } from '@cpmind/shared';
import type { S6AccumulatorState, S6RawData } from '../types.js';

function isAudible(isMuted: boolean, volume: number): boolean {
    return !isMuted && volume > 0;
}

function accumulateAudibleTime(state: S6AccumulatorState): void {
    if (state.audibleTimeStart === null) return;
    state.audible_time_sec += (Date.now() - state.audibleTimeStart) / 1000;
    state.audibleTimeStart = null;
}

function checkQuartiles(
    state: S6AccumulatorState,
    currentTime: number,
    isMuted: boolean,
    volume: number,
): void {
    if (state.duration <= 0) return;

    const pct = currentTime / state.duration;
    const audible = isAudible(isMuted, volume);

    if (!state.quartile_25 && pct >= 0.25) {
        state.quartile_25 = true;
        if (audible) state.audible_quartile_25 = true;
    }
    if (!state.quartile_50 && pct >= 0.50) {
        state.quartile_50 = true;
        if (audible) state.audible_quartile_50 = true;
    }
    if (!state.quartile_75 && pct >= 0.75) {
        state.quartile_75 = true;
        if (audible) state.audible_quartile_75 = true;
    }
    if (!state.completion && pct >= 1.0) {
        state.completion = true;
        state.completion_rate_pct = 100;
        if (audible) state.audible_quartile_100 = true;
    }
    if (pct * 100 > state.completion_rate_pct) {
        state.completion_rate_pct = Math.min(100, pct * 100);
    }
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
): S6AccumulatorState {
    return {
        duration: 0,
        lastSeekTime: 0,
        isSeeking: false,
        videoEndedInSegment: false,
        audibleTimeStart: null,
        everMutedWhilePlaying: false,
        everUnmutedWhilePlaying: false,
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
    };
}

export function onS6LoadedMetadata(state: S6AccumulatorState, duration: number): void {
    state.duration = duration;
}

export function onS6Play(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
): void {
    state.play_initiated = true;

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
    accumulateAudibleTime(state);
}

export function onS6Ended(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
): void {
    state.completion = true;
    state.completion_rate_pct = 100;
    state.videoEndedInSegment = true;
    accumulateAudibleTime(state);
    if (isAudible(isMuted, volume)) state.audible_quartile_100 = true;
}

export function onS6TimeUpdate(
    state: S6AccumulatorState,
    currentTime: number,
    isMuted: boolean,
    volume: number,
): void {
    if (!state.isSeeking) state.lastSeekTime = currentTime;
    checkQuartiles(state, currentTime, isMuted, volume);
    state.volume_level = Math.round(volume * 100);
}

export function onS6VolumeChange(
    state: S6AccumulatorState,
    isMuted: boolean,
    volume: number,
    isPaused: boolean,
    isEnded: boolean,
    previouslyMuted: boolean,
): void {
    const nowAudible = isAudible(isMuted, volume);
    const wasAudible = state.audibleTimeStart !== null;

    state.volume_level = Math.round(volume * 100);

    if (!isPaused && !isEnded) {
        if (nowAudible && !wasAudible) {
            state.audibleTimeStart = Date.now();
            state.everUnmutedWhilePlaying = true;
            if (previouslyMuted && !isMuted) state.unmuted_by_user = true;
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

export function onS6Seeked(state: S6AccumulatorState, newTime: number): void {
    state.isSeeking = false;
    if (newTime < state.lastSeekTime - 0.5) state.replay_count += 1;
    state.lastSeekTime = newTime;
    if (state.videoEndedInSegment && newTime < state.duration - 0.5) {
        state.videoEndedInSegment = false;
    }
}

export function onS6Skip(state: S6AccumulatorState): void {
    state.skipped = true;
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
    };
}

export function resetS6Accumulator(
    state: S6AccumulatorState,
    currentTime: number,
    isPaused: boolean,
    isEnded: boolean,
    isMuted: boolean,
    volume: number,
): void {
    accumulateAudibleTime(state);

    state.lastSeekTime = currentTime;
    state.isSeeking = false;
    state.videoEndedInSegment = false;
    state.audibleTimeStart = null;
    state.everMutedWhilePlaying = false;
    state.everUnmutedWhilePlaying = false;
    state.play_initiated = !isPaused && !isEnded;
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

    if (!isPaused && !isEnded) {
        if (isAudible(isMuted, volume)) {
            state.audibleTimeStart = Date.now();
            state.everUnmutedWhilePlaying = true;
        } else {
            state.everMutedWhilePlaying = true;
        }
        updateMutedStatus(state);
    }
}