import type { PlayerActionSource } from '@cpmind/shared';
import { ICON_CLOSE } from '../player-config.js';

export interface CloseButton {
    el: HTMLButtonElement;
    destroy(): void;
}

// Close button — только для outstream
export function createCloseButton(
    container: HTMLElement,
    onClose: (source: PlayerActionSource) => void,
): CloseButton {
    const btn = document.createElement('button');
    btn.setAttribute('data-cpmind-close', '');
    btn.setAttribute('aria-label', 'Закрыть рекламу');
    btn.innerHTML = ICON_CLOSE;

    const onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        onClose('user');
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