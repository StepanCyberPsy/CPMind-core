import type {
    VastMediaFile,
    VastTrackingResource,
    VastImpression,
    VastClickThrough,
    VastClickTracking,
    VastVerification,
} from '@cpmind/shared';

// Полностью распарсенный VAST InLine ad, готовый к воспроизведению.
// Отличается от shared VastParsedAd: содержит runtime-поля Player.
export interface ParsedVastAd {
    // Идентификация
    adId: string | null;
    adServingId: string | null;
    title: string | undefined;

    // Длительность и skip
    durationSec: number;
    skipOffset:
    | { kind: 'seconds'; value: number }
    | { kind: 'percent'; value: number }
    | null;

    // Media
    mediaFiles: VastMediaFile[];

    // Tracking
    impressions: VastImpression[];
    errorUrls: string[];
    trackingEvents: VastTrackingResource[];

    // Clicks
    clickThrough: VastClickThrough | null;
    clickTrackings: VastClickTracking[];

    // OMID — parsed but not executed in v1
    adVerifications: VastVerification[];
}

// Состояние воспроизведения видео — нужно для корреляции source в VideoMeasurementEvent.
// Player отслеживает это состояние между DOM-событиями
export interface VideoPlaybackState {
    isMuted: boolean;
    volume: number;
    isPaused: boolean;
    isEnded: boolean;
    previouslyMuted: boolean;   // для onS6VolumeChange 6-й параметр
    durationSec: number;
    currentTimeSec: number;
}

// Результат попытки autoplay
export type AutoplayOutcome =
    | 'started'
    | 'blocked'
    | 'error';