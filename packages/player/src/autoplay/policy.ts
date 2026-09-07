import { attemptPlay } from '../media/playback.js';
import type { AutoplayOutcome } from '../vast/types.js';

// Muted autoplay fallback — Coalition for Better Ads standard.
// Если unmuted play заблокирован браузером → повторяем с muted.
// Возвращает итоговый outcome и финальное muted-состояние
export interface AutoplayResult {
    outcome: AutoplayOutcome;
    finallyMuted: boolean;
}

export async function attemptAutoplay(
    video: HTMLVideoElement,
    requestedMuted: boolean,
): Promise<AutoplayResult> {
    // Шаг 1: попытка с запрошенным muted-состоянием
    video.muted = requestedMuted;
    const firstOutcome = await attemptPlay(video);

    if (firstOutcome === 'started') {
        return { outcome: 'started', finallyMuted: requestedMuted };
    }

    // Шаг 2: если запрошен unmuted и заблокирован — fallback на muted
    // (мобильные браузеры разрешают muted autoplay всегда)
    if (!requestedMuted && firstOutcome === 'blocked') {
        video.muted = true;
        const mutedOutcome = await attemptPlay(video);

        if (mutedOutcome === 'started') {
            return { outcome: 'started', finallyMuted: true };
        }
    }

    return { outcome: firstOutcome, finallyMuted: video.muted };
}