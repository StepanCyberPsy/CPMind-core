import type { DisplayQueueEntry } from './types.js';

// Подготовка publisher-контейнера к монтированию creative
export function mountSurface(
    container: HTMLElement,
    entry: DisplayQueueEntry,
): void {
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    if (entry.width !== null) {
        container.style.width = `${entry.width}px`;
    }
    if (entry.height !== null) {
        container.style.height = `${entry.height}px`;
    }

    while (container.firstChild !== null) {
        container.removeChild(container.firstChild);
    }
}