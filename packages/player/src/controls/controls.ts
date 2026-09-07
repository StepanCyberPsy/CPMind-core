import type { PlayerActionSource } from '@cpmind/shared';
import { createPlayButton, type PlayButton } from './play.js';
import { createVolumeButton, type VolumeButton } from './volume.js';
import { createSeekBar, type SeekBar } from './seek.js';
import { createSkipButton, type SkipButton } from './skip.js';
import { createCloseButton, type CloseButton } from './close.js';
import {
    createKeyboardControls,
    type KeyboardControls,
    type KeyboardControlsCallbacks,
} from './keyboard.js';
import { setControlsVisible } from '../ui/surface.js';
import {
    formatTime,
    CONTROLS_HIDE_DELAY_MS,
    SEEK_STEP_SEC,
} from '../player-config.js';

export interface PlayerControls {
    setPlaying(playing: boolean): void;
    setMuted(muted: boolean): void;
    setProgress(currentTimeSec: number, durationSec: number): void;
    showControls(): void;
    destroy(): void;
}

export interface PlayerControlsOptions {
    wrapper: HTMLDivElement;
    progressRow: HTMLDivElement;
    btnRow: HTMLDivElement;
    surface: HTMLElement;
    skipOffsetSec: number | null;
    onPlayPause(source: PlayerActionSource): void;
    onMuteToggle(source: PlayerActionSource): void;
    onSeek(timeSec: number, durationSec: number, source: PlayerActionSource): void;
    onSkip(): void;
    onClose?: ((source: PlayerActionSource) => void) | undefined;
}

// Оркестратор всех controls. Auto-hide после CONTROLS_HIDE_DELAY_MS бездействия
export function createPlayerControls(opts: PlayerControlsOptions): PlayerControls {
    let durationSec = 0;
    let hideTimerId: ReturnType<typeof setTimeout> | null = null;

    function scheduleHide(): void {
        if (hideTimerId !== null) clearTimeout(hideTimerId);
        hideTimerId = setTimeout(() => {
            setControlsVisible(opts.wrapper, false);
        }, CONTROLS_HIDE_DELAY_MS);
    }

    function showAndScheduleHide(): void {
        setControlsVisible(opts.wrapper, true);
        scheduleHide();
    }

    // Pointer activity on surface — показываем controls
    opts.wrapper.addEventListener('pointermove', showAndScheduleHide);
    opts.wrapper.addEventListener('pointerdown', showAndScheduleHide);

    // Time display
    const timeEl = document.createElement('div');
    timeEl.setAttribute('data-cpmind-time', '');
    timeEl.textContent = '0:00';
    opts.progressRow.appendChild(timeEl);

    const seekBar: SeekBar = createSeekBar(opts.progressRow, (fraction, source) => {
        opts.onSeek(fraction * durationSec, durationSec, source);
        showAndScheduleHide();
    });

    const playBtn: PlayButton = createPlayButton(opts.btnRow, (source) => {
        opts.onPlayPause(source);
        showAndScheduleHide();
    });

    const volumeBtn: VolumeButton = createVolumeButton(opts.btnRow, (source) => {
        opts.onMuteToggle(source);
        showAndScheduleHide();
    });

    const skipBtn: SkipButton | null = opts.skipOffsetSec !== null
        ? createSkipButton(opts.wrapper, opts.skipOffsetSec, opts.onSkip)
        : null;

    const closeBtn: CloseButton | null = opts.onClose !== undefined
        ? createCloseButton(opts.wrapper, opts.onClose)
        : null;

    const kbCallbacks: KeyboardControlsCallbacks = {
        onPlayPause: opts.onPlayPause,
        onMuteToggle: opts.onMuteToggle,
        onSeekForward: (source) => {
            opts.onSeek(
                Math.min(durationSec, 0 + SEEK_STEP_SEC),
                durationSec,
                source,
            );
        },
        onSeekBackward: (source) => {
            opts.onSeek(
                Math.max(0, 0 - SEEK_STEP_SEC),
                durationSec,
                source,
            );
        },
    };
    const keyboard: KeyboardControls = createKeyboardControls(opts.surface, kbCallbacks);

    // Начинаем скрытыми, показываем при первом взаимодействии
    setControlsVisible(opts.wrapper, false);

    return {
        setPlaying(playing: boolean): void {
            playBtn.setPlaying(playing);
        },

        setMuted(muted: boolean): void {
            volumeBtn.setMuted(muted);
        },

        setProgress(currentSec: number, dur: number): void {
            durationSec = dur;
            const fraction = dur > 0 ? Math.min(1, currentSec / dur) : 0;
            seekBar.setProgress(fraction);
            skipBtn?.update(currentSec, dur);
            timeEl.textContent = formatTime(currentSec);
        },

        showControls(): void {
            showAndScheduleHide();
        },

        destroy(): void {
            if (hideTimerId !== null) clearTimeout(hideTimerId);
            opts.wrapper.removeEventListener('pointermove', showAndScheduleHide);
            opts.wrapper.removeEventListener('pointerdown', showAndScheduleHide);
            playBtn.destroy();
            volumeBtn.destroy();
            seekBar.destroy();
            skipBtn?.destroy();
            closeBtn?.destroy();
            keyboard.destroy();
        },
    };
}