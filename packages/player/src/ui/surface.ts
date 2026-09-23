import type { StickyCorner } from '@cpmind/shared';
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

// Способ размещения поверхности. overlay перекрывает содержимое контейнера —
// требуется для in-stream, где реклама показывается поверх content video.
// sticky закрепляется в углу окна и не занимает места в потоке страницы
export type SurfaceMount =
    | { kind: 'inline' }
    | { kind: 'overlay' }
    | {
        kind: 'sticky';
        corner: StickyCorner;
        offsetX: number;
        offsetY: number;
    };

// Отступ от края складывается с безопасной зоной устройства: на экранах с вырезом
// поверхность иначе уходит под системную панель
function applyStickyPosition(
    wrapper: HTMLDivElement,
    corner: StickyCorner,
    offsetX: number,
    offsetY: number,
): void {
    const isTop = corner.startsWith('top');
    const isLeft = corner.endsWith('left');

    const horizontal = `calc(${offsetX}px + env(safe-area-inset-${isLeft ? 'left' : 'right'}, 0px))`;
    const vertical = `calc(${offsetY}px + env(safe-area-inset-${isTop ? 'top' : 'bottom'}, 0px))`;

    if (isTop) {
        wrapper.style.top = vertical;
    } else {
        wrapper.style.bottom = vertical;
    }

    if (isLeft) {
        wrapper.style.left = horizontal;
    } else {
        wrapper.style.right = horizontal;
    }
}

// Создаёт DOM-структуру рекламной поверхности и монтирует её.
// CSS-prefix изоляция — без Shadow DOM.
// Закреплённая поверхность монтируется в body: любой родитель контейнера
// с transform, filter или perspective становится containing block,
// и fixed начал бы позиционироваться относительно него, а не окна
export function createAdSurface(
    container: HTMLElement,
    width: number | null,
    height: number | null,
    mount: SurfaceMount,
): AdSurface {
    ensurePlayerStyles();

    // height 100% не разрешается против родителя с height auto — для таких
    // контейнеров высота берётся из фактического бокса, зарезервированного
    // жизненным циклом out-stream до монтирования поверхности
    const containerHeight = container.getBoundingClientRect().height;

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-cpmind-surface', '');

    if (mount.kind === 'overlay') {
        wrapper.style.position = 'absolute';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.zIndex = '2147483000';
    } else if (mount.kind === 'sticky') {
        wrapper.setAttribute('data-cpmind-sticky', '');
        wrapper.style.width = width !== null ? `${width}px` : '100%';
        wrapper.style.height = height !== null ? `${height}px` : 'auto';
        applyStickyPosition(wrapper, mount.corner, mount.offsetX, mount.offsetY);
    } else {
        wrapper.style.position = 'relative';
        wrapper.style.width = width !== null ? `${width}px` : '100%';

        if (height !== null) {
            wrapper.style.height = `${height}px`;
        } else if (containerHeight > 0) {
            wrapper.style.height = `${containerHeight}px`;
        } else {
            wrapper.style.height = '100%';
        }
    }

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

    if (mount.kind === 'sticky') {
        document.body.appendChild(wrapper);
    } else {
        container.appendChild(wrapper);
    }

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