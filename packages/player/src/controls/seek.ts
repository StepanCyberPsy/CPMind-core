import type { PlayerActionSource } from '@cpmind/shared';

export interface SeekBar {
    el: HTMLDivElement;
    setProgress(fraction: number): void;
    destroy(): void;
}

// Seek bar с drag через document pointermove.
// Drag на document предотвращает потерю при быстром выходе за пределы bar.
// interactive = false оставляет индикатор прогресса без возможности перемотки:
// out-stream показывает ход воспроизведения, но управление позицией не даёт
export function createSeekBar(
    container: HTMLElement,
    interactive: boolean,
    onSeek: (fraction: number, source: PlayerActionSource) => void,
): SeekBar {
    const bar = document.createElement('div');
    bar.setAttribute('data-cpmind-seek', '');

    if (interactive) {
        bar.setAttribute('role', 'slider');
        bar.setAttribute('aria-label', 'Прогресс видео');
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-valuenow', '0');
    } else {
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', 'Прогресс видео');
        bar.style.pointerEvents = 'none';
        bar.style.cursor = 'default';
    }

    const fill = document.createElement('div');
    fill.setAttribute('data-cpmind-seek-fill', '');
    bar.appendChild(fill);

    const thumb = document.createElement('div');
    thumb.setAttribute('data-cpmind-seek-thumb', '');
    bar.appendChild(thumb);

    let isDragging = false;

    function fractionFromPointer(e: PointerEvent): number {
        const rect = bar.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    }

    function applyFraction(fraction: number): void {
        const pct = `${(fraction * 100).toFixed(2)}%`;
        fill.style.width = pct;
        thumb.style.left = pct;
        bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    }

    if (!interactive) {
        container.appendChild(bar);

        return {
            el: bar,

            setProgress(fraction: number): void {
                applyFraction(fraction);
            },

            destroy(): void {
                bar.remove();
            },
        };
    }

    const onPointerDown = (e: PointerEvent): void => {
        e.preventDefault();
        isDragging = true;
        bar.setAttribute('data-dragging', '');
        bar.setPointerCapture(e.pointerId);
        const fraction = fractionFromPointer(e);
        applyFraction(fraction);
        onSeek(fraction, 'user');
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (!isDragging) return;
        const fraction = fractionFromPointer(e);
        applyFraction(fraction);
        onSeek(fraction, 'user');
    };

    const onPointerUp = (e: PointerEvent): void => {
        if (!isDragging) return;
        isDragging = false;
        bar.removeAttribute('data-dragging');
        bar.releasePointerCapture(e.pointerId);
        const fraction = fractionFromPointer(e);
        applyFraction(fraction);
        onSeek(fraction, 'user');
    };

    bar.addEventListener('pointerdown', onPointerDown);
    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', onPointerUp);
    bar.addEventListener('pointercancel', onPointerUp);

    container.appendChild(bar);

    return {
        el: bar,

        setProgress(fraction: number): void {
            if (!isDragging) applyFraction(fraction);
        },

        destroy(): void {
            bar.removeEventListener('pointerdown', onPointerDown);
            bar.removeEventListener('pointermove', onPointerMove);
            bar.removeEventListener('pointerup', onPointerUp);
            bar.removeEventListener('pointercancel', onPointerUp);
            bar.remove();
        },
    };
}