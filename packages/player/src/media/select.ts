import { PlayerError } from '../errors.js';
import type { VastMediaFile } from '@cpmind/shared';

// Declare CDN_HOSTNAME — injected by esbuild define
declare const CDN_HOSTNAME: string;

function assertTrustedMediaUrl(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(PlayerError.NO_SUPPORTED_MEDIA);
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== CDN_HOSTNAME) {
        throw new Error(PlayerError.NO_SUPPORTED_MEDIA);
    }
}

// Выбирает оптимальный MediaFile из доступных.
// Только progressive delivery — streaming (HLS/DASH) не поддерживается в v1.
// DPR-aware: учитывает devicePixelRatio для Retina дисплеев.
// При равной ширине предпочитает меньший bitrate (экономия трафика).
export function selectMediaFile(
    video: HTMLVideoElement,
    files: readonly VastMediaFile[],
    widthCssPx: number,
): VastMediaFile {
    // MIME уже нормализован (toLowerCase) в parser.ts
    const supported = files.filter((f) =>
        f.delivery === 'progressive' &&
        f.url !== '' &&
        video.canPlayType(f.type) !== '',
    );

    if (supported.length === 0) {
        throw new Error(PlayerError.NO_SUPPORTED_MEDIA);
    }

    // Проверяем доверенность URLs всех кандидатов
    for (const f of supported) {
        assertTrustedMediaUrl(f.url);
    }

    const dpr = Math.max(typeof window !== 'undefined'
        ? (window.devicePixelRatio ?? 1)
        : 1, 1);
    const targetWidth = widthCssPx * dpr;

    // Сортируем по ширине (возрастание), при равной — по bitrate (возрастание)
    const sorted = [...supported].sort((a, b) => {
        if (a.width !== b.width) return a.width - b.width;
        const aBitrate = a.bitrateKbps ?? 0;
        const bBitrate = b.bitrateKbps ?? 0;
        return aBitrate - bBitrate;
    });

    // Находим наименьшую ширину >= target; при отсутствии — берём наибольшую доступную
    const best = sorted.find((f) => f.width >= targetWidth);

    if (best !== undefined) return best;

    // noUncheckedIndexedAccess: sorted гарантированно non-empty (checked above)
    const last = sorted[sorted.length - 1];
    if (last === undefined) {
        throw new Error(PlayerError.NO_SUPPORTED_MEDIA);
    }
    return last;
}