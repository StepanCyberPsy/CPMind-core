import type { PlayerActionSource } from '@cpmind/shared';
import { ICON_PLAY, ICON_PAUSE } from '../player-config.js';

export interface PlayButton {
    el: HTMLButtonElement;
    setPending(source: PlayerActionSource): void;
    setPlaying(playing: boolean): void;
    destroy(): void;
}

// Создаёт кнопку play/pause с pending-source паттерном.
// onToggle вызывается с source который будет атрибутирован video-событию
export function createPlayButton(
    container: HTMLElement,
    onToggle: (source: PlayerActionSource) => void,
): PlayButton {
    const btn = document.createElement('button');
    btn.setAttribute('data-cpmind-btn', '');
    btn.setAttribute('aria-label', 'Воспроизвести');
    btn.innerHTML = ICON_PLAY;

    let pendingSource: PlayerActionSource = 'user';

    const onClick = (e: PointerEvent): void => {
        e.stopPropagation();
        pendingSource = 'user';
        onToggle('user');
    };

    btn.addEventListener('pointerup', onClick);
    container.appendChild(btn);

    return {
        el: btn,

        setPending(source: PlayerActionSource): void {
            pendingSource = source;
        },

        setPlaying(playing: boolean): void {
            btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
            btn.setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');
            void pendingSource; // используется caller'ом перед вызовом setPlaying
        },

        destroy(): void {
            btn.removeEventListener('pointerup', onClick);
            btn.remove();
        },
    };
}