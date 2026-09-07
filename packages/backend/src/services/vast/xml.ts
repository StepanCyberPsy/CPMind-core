import type { VastTimeOffset } from '@cpmind/shared';

export function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Конвертация через целые миллисекунды — исключает carry-ошибку при Math.round(frac*1000)===1000
export function formatDuration(totalSec: number): string {
    const totalMs = Math.round(Math.max(0, totalSec) * 1000);
    const ms = totalMs % 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const mmm = String(ms).padStart(3, '0');

    return `${hh}:${mm}:${ss}.${mmm}`;
}

// Абсолютное время → HH:MM:SS.mmm; процент → n%
export function formatOffset(offset: VastTimeOffset): string {
    if (offset.kind === 'percent') {
        return `${offset.value}%`;
    }
    return formatDuration(offset.value);
}