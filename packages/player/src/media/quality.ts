import type { AdSessionPlaybackQuality } from '@cpmind/shared';

// Собирает метрики качества воспроизведения через getVideoPlaybackQuality().
// Safari: API недоступен, возвращает null.
// Данные отправляются в backend через delivery event при завершении сессии
export function collectPlaybackQuality(
    video: HTMLVideoElement,
): AdSessionPlaybackQuality | null {
    if (typeof video.getVideoPlaybackQuality !== 'function') {
        return null;
    }

    const q = video.getVideoPlaybackQuality();

    // totalVideoFrames недоступен в Firefox (всегда 0) — считаем невалидным
    if (q.totalVideoFrames === 0 && q.droppedVideoFrames === 0) {
        return null;
    }

    return {
        dropped_frames: q.droppedVideoFrames,
        total_frames: q.totalVideoFrames,
    };
}