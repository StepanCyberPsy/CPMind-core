import type { PlayerActionSource } from '@cpmind/shared';
import { ICON_SEEK_BACK, ICON_SEEK_FORWARD } from '../player-config.js';

export interface SeekButton {
    el: HTMLButtonElement;
    destroy(): void;
}

// Кнопка перемотки на фиксированный шаг относительно текущей позиции
export function createSeekButton(
    container: HTMLElement,
    direction: 'back' | 'forward',
    stepSec: number,
    onSeekStep: (deltaSec: number, source: PlayerActionSource) => void,
): SeekButton {
    const isBack = direction === 'back';

    const btn = document.createElement('button');
    btn.setAttribute('data-cpmind-btn', '');
    btn.setAttribute(
        'aria-label',
        isBack ? `Назад на ${stepSec} с` : `Вперёд на ${stepSec} с`,
    );
    btn.innerHTML = isBack ? ICON_SEEK_BACK : ICON_SEEK_FORWARD;

    const onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        onSeekStep(isBack ? -stepSec : stepSec, 'user');
    };

    btn.addEventListener('pointerup', onPointerUp);
    container.appendChild(btn);

    return {
        el: btn,

        destroy(): void {
            btn.removeEventListener('pointerup', onPointerUp);
            btn.remove();
        },
    };
}