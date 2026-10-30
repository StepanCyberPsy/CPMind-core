import type { SimidPlaybackState } from './accumulator.js';

/**
 * Сборка отчёта в контракте /api/collect/simid. Отдельный модуль без побочных
 * эффектов: соответствие имён полей схеме проверяется тестом, а не наблюдением
 * за сетью.
 */

export interface SimidInitContext {
    sid: string;
    collectEndpoint: string;
}

export interface SimidEnvironmentSnapshot {
    simidVersion: string | null;
    mutedAtStart: boolean | null;
    volumeAtStart: number | null;
    fullscreen: boolean | null;
    fullscreenAllowed: boolean | null;
    skippableState: string | null;
    videoWidth: number | null;
    videoHeight: number | null;
    creativeWidth: number | null;
    creativeHeight: number | null;
}

export type SimidEndReasonValue =
    | 'ended'
    | 'adStopped'
    | 'adSkipped'
    | 'fatalError'
    | 'unload';

const SKIPPABLE_STATES = ['playerHandles', 'adHandles', 'notSkippable'];

// SIMID 1.2 §4.3.7 использует -1 как признак неизвестного размера:
// в отчёте такому значению соответствует null, а не отрицательное число
export function normalizeDimension(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
}

export function normalizeSkippableState(value: unknown): string | null {
    return typeof value === 'string' && SKIPPABLE_STATES.includes(value) ? value : null;
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000;
}

export function buildSimidReport(
    sid: string,
    runtimeVersion: string,
    endReason: SimidEndReasonValue,
    startedAt: number,
    endedAt: number,
    state: SimidPlaybackState,
    environment: SimidEnvironmentSnapshot,
): Record<string, unknown> {
    return {
        sid,
        simid_runtime_version: runtimeVersion,
        end_reason: endReason,
        timestamp_start: startedAt,
        timestamp_end: endedAt,
        playback: {
            duration_sec: state.durationSec === null ? null : round3(state.durationSec),
            max_playhead_sec: round3(state.maxPlayheadSec),
            playback_sec: round3(state.playbackSec),
            audible_sec: round3(state.audibleSec),
            pause_count: state.pauseCount,
            play_count: state.playCount,
            forward_seek_count: state.forwardSeekCount,
            backward_seek_count: state.backwardSeekCount,
            stall_count: state.stallCount,
            ended: state.ended,
            media_error_code: state.mediaErrorCode,
            interaction_count: state.interactionCount,
            dropped_delta_sec: round3(state.droppedDeltaSec),
        },
        environment: {
            simid_version: environment.simidVersion,
            muted_at_start: environment.mutedAtStart,
            volume_at_start: environment.volumeAtStart,
            fullscreen: environment.fullscreen,
            fullscreen_allowed: environment.fullscreenAllowed,
            skippable_state: environment.skippableState,
            video_width: environment.videoWidth,
            video_height: environment.videoHeight,
            creative_width: environment.creativeWidth,
            creative_height: environment.creativeHeight,
        },
    };
}
