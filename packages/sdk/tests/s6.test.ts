import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    createS6AccumulatorState,
    getS6Data,
    onS6Ended,
    onS6LoadedMetadata,
    onS6Play,
    onS6Seeked,
    onS6Seeking,
    onS6TimeUpdate,
    onS6VolumeChange,
    resetS6Accumulator,
} from '../src/signals/s6.js';
import type { S6AccumulatorState } from '../src/types.js';

const DURATION_SEC = 10;
const TICK_SEC = 0.25;

let nowMs = 0;

function advance(ms: number): void {
    nowMs += ms;
    vi.setSystemTime(nowMs);
}

// Воспроизведение с шагом timeupdate: позиция и время растут синхронно
function playRange(
    state: S6AccumulatorState,
    fromSec: number,
    toSec: number,
    isMuted = false,
    volume = 1,
): void {
    for (let position = fromSec + TICK_SEC; position <= toSec + 1e-9; position += TICK_SEC) {
        advance(TICK_SEC * 1000);
        onS6TimeUpdate(state, position, isMuted, volume);
    }
}

function startedState(isMuted = false, volume = 1): S6AccumulatorState {
    const state = createS6AccumulatorState('unknown', volume);
    onS6LoadedMetadata(state, DURATION_SEC);
    onS6Play(state, isMuted, volume, 0);
    return state;
}

describe('S6 accumulator', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        nowMs = Date.UTC(2026, 8, 17, 12, 0, 0);
        vi.setSystemTime(nowMs);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('засчитывает полный непрерывный просмотр', () => {
        const state = startedState();
        playRange(state, 0, DURATION_SEC);
        onS6Ended(state, false, 1);

        const data = getS6Data(state);
        expect(data.completion).toBe(true);
        expect(data.completion_rate_pct).toBe(100);
        expect(data.quartile_75).toBe(true);
        expect(data.audible_quartile_100).toBe(true);
    });

    it('не увеличивает досмотр перемоткой вперёд', () => {
        const state = startedState();
        playRange(state, 0, 2);

        onS6Seeking(state);
        onS6TimeUpdate(state, 9, false, 1);
        onS6Seeked(state, 9);
        playRange(state, 9, DURATION_SEC);
        onS6Ended(state, false, 1);

        const data = getS6Data(state);
        expect(data.completion).toBe(false);
        expect(data.completion_rate_pct).toBeCloseTo(20, 5);
        expect(data.quartile_25).toBe(false);
    });

    it('не засчитывает перемотку вперёд без события seeking', () => {
        const state = startedState();
        playRange(state, 0, 2);

        advance(TICK_SEC * 1000);
        onS6TimeUpdate(state, 8, false, 1);
        playRange(state, 8, 9);

        expect(getS6Data(state).completion_rate_pct).toBeCloseTo(20, 5);
    });

    it('засчитывает шаг при троттлинге timeupdate в фоновой вкладке', () => {
        const state = startedState();
        playRange(state, 0, 2);

        advance(1_200);
        onS6TimeUpdate(state, 3.2, false, 1);

        expect(getS6Data(state).completion_rate_pct).toBeCloseTo(32, 5);
    });

    it('считает перемотку назад повтором и не уменьшает досмотр', () => {
        const state = startedState();
        playRange(state, 0, 6);

        onS6Seeking(state);
        onS6Seeked(state, 2);
        playRange(state, 2, 4);

        const data = getS6Data(state);
        expect(data.replay_count).toBe(1);
        expect(data.completion_rate_pct).toBeCloseTo(60, 5);
        expect(data.quartile_50).toBe(true);
    });

    it('ставит флаги звука только по действию зрителя', () => {
        const state = startedState(true, 1);

        onS6VolumeChange(
            state,
            false,
            1,
            false,
            false,
            true,
            false,
        );
        expect(getS6Data(state).unmuted_by_user).toBe(false);

        onS6VolumeChange(
            state,
            true,
            1,
            false,
            false,
            false,
            true,
        );
        onS6VolumeChange(
            state,
            false,
            1,
            false,
            false,
            true,
            true,
        );

        const data = getS6Data(state);
        expect(data.muted_by_user).toBe(true);
        expect(data.unmuted_by_user).toBe(true);
        expect(data.muted_status).toBe('mixed');
    });

    it('фиксирует состояние звука на первом старте', () => {
        const state = startedState(true, 1);
        onS6Play(state, false, 1, 0);

        expect(getS6Data(state).start_muted).toBe(true);
    });

    it('не передаёт start_muted без старта воспроизведения', () => {
        const state = createS6AccumulatorState('unknown', 1);

        expect('start_muted' in getS6Data(state)).toBe(false);
    });

    it('продолжает просмотр в новом сегменте с текущей позиции', () => {
        const state = startedState();
        playRange(state, 0, 4);

        resetS6Accumulator(
            state,
            4,
            false,
            false,
            false,
            1,
        );
        playRange(state, 4, 4.25);

        const data = getS6Data(state);
        expect(data.play_initiated).toBe(true);
        expect(data.start_muted).toBe(false);
        expect(data.quartile_25).toBe(true);
        expect(data.completion_rate_pct).toBeCloseTo(42.5, 5);
    });
});