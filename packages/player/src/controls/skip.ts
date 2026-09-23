import { ICON_SKIP } from '../player-config.js';

export interface SkipButton {
    el: HTMLDivElement;
    update(watchedFrontierSec: number): void;
    isReady(): boolean;
    destroy(): void;
}

// Skip button — обратный отсчёт до skipOffset, затем кнопка активна.
// Отсчёт ведётся по максимально достигнутой позиции, а не по текущей:
// перемотка назад не запускает таймер заново, перемотка вперёд не приближает
// разблокировку — ожидание соответствует фактически просмотренному отрезку
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

        update(watchedFrontierSec: number): void {
            const remaining = skipOffsetSec - watchedFrontierSec;

            if (remaining <= 0) {
                el.setAttribute('data-cpmind-skip-ready', '');
                labelSpan.textContent = 'Пропустить';
                return;
            }

            el.removeAttribute('data-cpmind-skip-ready');
            labelSpan.textContent = `Пропустить через ${Math.ceil(remaining)} с`;
        },

        isReady(): boolean {
            return el.hasAttribute('data-cpmind-skip-ready');
        },

        destroy(): void {
            el.removeEventListener('pointerup', onPointerUp);
            el.remove();
        },
    };
}