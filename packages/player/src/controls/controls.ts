import type { PlacementFormat, PlayerActionSource } from '@cpmind/shared';
import { createPlayButton, type PlayButton } from './play.js';
import { createVolumeButton, type VolumeButton } from './volume.js';
import { createSeekBar, type SeekBar } from './seek.js';
import { createSeekButton, type SeekButton } from './seek_buttons.js';
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

    // Предельная позиция перемотки вперёд. Пока кнопка пропуска не разблокирована,
    // перемотка за момент разблокировки дала бы пропуск раньше срока
    resolveSeekCeilingSec(): number | null;

    showControls(): void;
    destroy(): void;
}

// Состав контролов по формату размещения. In-stream воспроизводится внутри контента,
// который зритель смотрит намеренно, и получает полное управление. Out-stream
// появляется в потоке страницы без его запроса: управление сводится к звуку
// и закрытию, перемотка исключена — иначе ролик можно проскочить до конца,
// и S6 зафиксировал бы завершение без просмотра
interface ControlsProfile {
    playPause: boolean;
    seek: boolean;
}

function resolveControlsProfile(format: PlacementFormat): ControlsProfile {
    if (format === 'outstream') {
        return {
            playPause: false,
            seek: false,
        };
    }

    return {
        playPause: true,
        seek: true,
    };
}

export interface PlayerControlsOptions {
    wrapper: HTMLDivElement;
    progressRow: HTMLDivElement;
    btnRow: HTMLDivElement;
    surface: HTMLElement;
    format: PlacementFormat;
    skipOffsetSec: number | null;
    initialMuted: boolean;

    // Без автозапуска контролы видны с первого кадра: зритель должен видеть,
    // чем запустить ролик. Автоскрытие включается после начала воспроизведения
    visibleUntilPlayback: boolean;
    onPlayPause(source: PlayerActionSource): void;
    onMuteToggle(source: PlayerActionSource): void;
    onSeek(timeSec: number, durationSec: number, source: PlayerActionSource): void;
    onSkip(): void;
    onClose?: ((source: PlayerActionSource) => void) | undefined;
}

// Оркестратор всех controls. Auto-hide после CONTROLS_HIDE_DELAY_MS бездействия
export function createPlayerControls(opts: PlayerControlsOptions): PlayerControls {
    const profile = resolveControlsProfile(opts.format);

    let durationSec = 0;
    let currentTimeSec = 0;

    // Максимально достигнутая позиция: источник отсчёта для кнопки пропуска
    let watchedFrontierSec = 0;

    let hideTimerId: ReturnType<typeof setTimeout> | null = null;

    function scheduleHide(): void {
        if (hideTimerId !== null) clearTimeout(hideTimerId);
        hideTimerId = setTimeout(() => {
            setControlsVisible(opts.wrapper, false);
        }, CONTROLS_HIDE_DELAY_MS);
    }

    function showAndScheduleHide(): void {
        setControlsVisible(opts.wrapper, true);
        if (awaitingFirstPlayback) return;
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

    const seekBar: SeekBar = createSeekBar(opts.progressRow, profile.seek, (fraction, source) => {
        opts.onSeek(fraction * durationSec, durationSec, source);
        showAndScheduleHide();
    });

    const playBtn: PlayButton | null = profile.playPause
        ? createPlayButton(opts.btnRow, (source) => {
            opts.onPlayPause(source);
            showAndScheduleHide();
        })
        : null;

    const volumeBtn: VolumeButton = createVolumeButton(opts.btnRow, opts.initialMuted, (source) => {
        opts.onMuteToggle(source);
        showAndScheduleHide();
    });

    const skipBtn: SkipButton | null = opts.skipOffsetSec !== null
        ? createSkipButton(opts.wrapper, opts.skipOffsetSec, opts.onSkip)
        : null;

    // Перемотка ограничена моментом разблокировки пропуска: иначе ролик можно
    // перемотать к концу и получить пропуск, не дождавшись отсчёта
    function resolveSeekCeiling(): number | null {
        if (opts.skipOffsetSec === null) return null;
        if (skipBtn === null) return null;
        if (skipBtn.isReady()) return null;
        return opts.skipOffsetSec;
    }

    function seekByStep(
        deltaSec: number,
        source: PlayerActionSource,
    ): void {
        const target = currentTimeSec + deltaSec;
        const ceiling = resolveSeekCeiling();

        const upperBound = ceiling !== null
            ? Math.min(durationSec, ceiling)
            : durationSec;

        const clamped = Math.max(0, Math.min(upperBound, target));

        opts.onSeek(clamped, durationSec, source);
        showAndScheduleHide();
    }

    const seekBackBtn: SeekButton | null = profile.seek
        ? createSeekButton(opts.btnRow, 'back', SEEK_STEP_SEC, seekByStep)
        : null;

    const seekForwardBtn: SeekButton | null = profile.seek
        ? createSeekButton(opts.btnRow, 'forward', SEEK_STEP_SEC, seekByStep)
        : null;

    const closeBtn: CloseButton | null = opts.onClose !== undefined
        ? createCloseButton(opts.wrapper, opts.onClose)
        : null;

    const kbCallbacks: KeyboardControlsCallbacks = {
        onPlayPause: opts.onPlayPause,
        onMuteToggle: opts.onMuteToggle,
        onSeekForward: (source) => seekByStep(SEEK_STEP_SEC, source),
        onSeekBackward: (source) => seekByStep(-SEEK_STEP_SEC, source),
    };
    const keyboard: KeyboardControls = createKeyboardControls(
        opts.surface,
        {
            playPause: profile.playPause,
            seek: profile.seek,
        },
        kbCallbacks,
    );

    let awaitingFirstPlayback = opts.visibleUntilPlayback;

    // Без автозапуска контролы показаны сразу и не скрываются по таймеру:
    // на сенсорном устройстве события pointermove нет, и кнопка запуска
    // осталась бы недостижимой
    if (awaitingFirstPlayback) {
        setControlsVisible(opts.wrapper, true);
    } else {
        setControlsVisible(opts.wrapper, false);
    }

    return {
        setPlaying(playing: boolean): void {
            playBtn?.setPlaying(playing);

            if (playing && awaitingFirstPlayback) {
                awaitingFirstPlayback = false;
                scheduleHide();
            }
        },

        setMuted(muted: boolean): void {
            volumeBtn.setMuted(muted);
        },

        setProgress(currentSec: number, dur: number): void {
            durationSec = dur;
            currentTimeSec = currentSec;

            if (currentSec > watchedFrontierSec) {
                watchedFrontierSec = currentSec;
            }

            const fraction = dur > 0 ? Math.min(1, currentSec / dur) : 0;
            seekBar.setProgress(fraction);
            skipBtn?.update(watchedFrontierSec);
            timeEl.textContent = formatTime(currentSec);
        },

        resolveSeekCeilingSec(): number | null {
            return resolveSeekCeiling();
        },

        showControls(): void {
            showAndScheduleHide();
        },

        destroy(): void {
            if (hideTimerId !== null) clearTimeout(hideTimerId);
            opts.wrapper.removeEventListener('pointermove', showAndScheduleHide);
            opts.wrapper.removeEventListener('pointerdown', showAndScheduleHide);
            playBtn?.destroy();
            volumeBtn.destroy();
            seekBar.destroy();
            seekBackBtn?.destroy();
            seekForwardBtn?.destroy();
            skipBtn?.destroy();
            closeBtn?.destroy();
            keyboard.destroy();
        },
    };
}