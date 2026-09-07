export const ENCODING_PROFILE_VERSION = 'v1.0';

export interface VideoProfile {
    name: string;
    width: number;
    crf: number;
    preset: string;
    role: string;
    priority: number;
}

export const VIDEO_PROFILES: readonly VideoProfile[] = [
    {
        name: '1080p',
        width: 1920,
        crf: 22,
        preset: 'medium',
        role: 'source',
        priority: 0,
    },
    {
        name: '720p',
        width: 1280,
        crf: 23,
        preset: 'medium',
        role: 'rendition_720p',
        priority: 1,
    },
    {
        name: '360p',
        width: 640,
        crf: 24,
        preset: 'fast',
        role: 'rendition_360p',
        priority: 2,
    },
] as const;

export function selectRenditions(
    sourceWidth: number,
): readonly VideoProfile[] {
    const matching = VIDEO_PROFILES.filter((p) => p.width <= sourceWidth);

    if (matching.length > 0) {
        return matching;
    }

    const lowest = VIDEO_PROFILES[VIDEO_PROFILES.length - 1];
    return lowest ? [lowest] : [];
}