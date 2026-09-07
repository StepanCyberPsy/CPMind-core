import type { PlayerActionSource } from '@cpmind/shared';
import { ICON_MUTED, ICON_UNMUTED } from '../player-config.js';

export interface VolumeButton {
    el: HTMLButtonElement;
    setMuted(muted: boolean): void;
    destroy(): void;
}

export function createVolumeButton(
    container: HTMLElement,
    onToggle: (source: PlayerActionSource) => void,
): VolumeButton {
    const btn = document.createElement('button');
    btn.setAttribute('data-cpmind-btn', '');
    btn.setAttribute('aria-label', 'Включить звук');
    btn.innerHTML = ICON_MUTED;

    const onClick = (e: PointerEvent): void => {
        e.stopPropagation();
        onToggle('user');
    };

    btn.addEventListener('pointerup', onClick);
    container.appendChild(btn);

    return {
        el: btn,

        setMuted(muted: boolean): void {
            btn.innerHTML = muted ? ICON_MUTED : ICON_UNMUTED;
            btn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
        },

        destroy(): void {
            btn.removeEventListener('pointerup', onClick);
            btn.remove();
        },
    };
}