import { ensurePlayerStyles } from './styles.js';
import { COMPACT_BREAKPOINT_PX } from '../player-config.js';

export interface AdSurface {
    wrapper: HTMLDivElement;
    videoSlot: HTMLDivElement;
    controlsBar: HTMLDivElement;
    progressRow: HTMLDivElement;
    btnRow: HTMLDivElement;
    destroy(): void;
}

// Создаёт DOM-структуру рекламной поверхности и монтирует в container.
// CSS-prefix изоляция — без Shadow DOM
export function createAdSurface(
    container: HTMLElement,
    width: number | null,
    height: number | null,
): AdSurface {
    ensurePlayerStyles();

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-cpmind-surface', '');
    wrapper.style.width = width !== null ? `${width}px` : '100%';
    wrapper.style.height = height !== null ? `${height}px` : '100%';
    wrapper.style.position = 'relative';
    wrapper.style.overflow = 'hidden';

    // Ad label
    const adLabel = document.createElement('div');
    adLabel.setAttribute('data-cpmind-label-ad', '');
    adLabel.textContent = 'Реклама';
    wrapper.appendChild(adLabel);

    // Video slot — video element монтируется сюда caller'ом
    const videoSlot = document.createElement('div');
    videoSlot.style.width = '100%';
    videoSlot.style.height = '100%';
    wrapper.appendChild(videoSlot);

    // Controls bar (содержит progress row + buttons row)
    const controlsBar = document.createElement('div');
    controlsBar.setAttribute('data-cpmind-controls', '');

    const progressRow = document.createElement('div');
    progressRow.setAttribute('data-cpmind-progress-row', '');
    controlsBar.appendChild(progressRow);

    const btnRow = document.createElement('div');
    btnRow.setAttribute('data-cpmind-btn-row', '');
    controlsBar.appendChild(btnRow);

    wrapper.appendChild(controlsBar);
    container.appendChild(wrapper);

    const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry === undefined) return;
        const width = entry.contentRect.width;
        if (width < COMPACT_BREAKPOINT_PX) {
            wrapper.setAttribute('data-cpmind-compact', '');
        } else {
            wrapper.removeAttribute('data-cpmind-compact');
        }
    });

    ro.observe(wrapper);

    return {
        wrapper,
        videoSlot,
        controlsBar,
        progressRow,
        btnRow,
        destroy(): void {
            ro.disconnect();
            wrapper.remove();
        },
    };
}

// Показывает/скрывает controls bar через data-атрибут
export function setControlsVisible(wrapper: HTMLDivElement, visible: boolean): void {
    if (visible) {
        wrapper.removeAttribute('data-cpmind-controls-hidden');
    } else {
        wrapper.setAttribute('data-cpmind-controls-hidden', '');
    }
}

// Убирает surface из DOM
export function destroySurface(surface: AdSurface): void {
    surface.destroy();
}