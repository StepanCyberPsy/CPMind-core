import { ICON_SKIP } from '../player-config.js';

export interface SkipButton {
    el: HTMLDivElement;
    update(currentTimeSec: number, durationSec: number): void;
    destroy(): void;
}

// Skip button — countdown до skipOffset, затем кнопка активна
export function createSkipButton(
    container: HTMLElement,
    skipOffsetSec: number,
    onSkip: () => void,
): SkipButton {
    const el = document.createElement('div');
    el.setAttribute('data-cpmind-skip', '');

    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = ICON_SKIP;
    el.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    el.appendChild(labelSpan);

    const onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (el.hasAttribute('data-cpmind-skip-ready')) {
            onSkip();
        }
    };

    el.addEventListener('pointerup', onPointerUp);
    container.appendChild(el);

    return {
        el,
        update(currentTimeSec: number): void {
            const remaining = skipOffsetSec - currentTimeSec;
            if (remaining <= 0) {
                el.setAttribute('data-cpmind-skip-ready', '');
                labelSpan.textContent = 'Пропустить';
            } else {
                el.removeAttribute('data-cpmind-skip-ready');
                labelSpan.textContent = `Пропустить через ${Math.ceil(remaining)} с`;
            }
        },
        destroy(): void {
            el.removeEventListener('pointerup', onPointerUp);
            el.remove();
        },
    };
}