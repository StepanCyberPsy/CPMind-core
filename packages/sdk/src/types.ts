import type {
    DeviceType,
    AudioConnection,
    TagConstantsValues,
} from '@cpmind/shared';

export type { DeviceType };

// Запись истории видимости вкладки
export interface VisibilityEntry {
    state: 'visible' | 'hidden';
    timestamp: number;
}

// Состояние S3 — Scroll Velocity
export interface SignalsS3State {
    scroll_speed_avg_px_s: number | null;
    scroll_speed_max_px_s: number | null;
    scroll_speed_std_dev: number | null;
    pause_count: number | null;
    pause_duration_total_ms: number | null;
    scroll_streaks: number | null;
    direction_changes: number | null;
    reading_pattern_detected: boolean | null;
    is_momentum_scroll: boolean | null;
}

// Состояние S6 — Video Engagement accumulator (без DOM-ссылок)
export interface S6AccumulatorState {
    // Tracking
    duration: number;
    lastSeekTime: number;
    isSeeking: boolean;
    videoEndedInSegment: boolean;
    audibleTimeStart: number | null;
    everMutedWhilePlaying: boolean;
    everUnmutedWhilePlaying: boolean;

    // Video Engagement
    play_initiated: boolean;
    quartile_25: boolean;
    quartile_50: boolean;
    quartile_75: boolean;
    completion: boolean;
    completion_rate_pct: number;
    pause_initiated: boolean;
    skipped: boolean;
    replay_count: number;

    // Audibility — AudioConnection из @cpmind/shared (6 значений)
    muted_status: 'muted' | 'unmuted' | 'mixed';
    volume_level: number;
    audio_connection: AudioConnection;
    audible_time_sec: number;
    audible_quartile_25: boolean;
    audible_quartile_50: boolean;
    audible_quartile_75: boolean;
    audible_quartile_100: boolean;
    unmuted_by_user: boolean;
}

// Финализированные данные S6 для payload
export interface S6RawData {
    play_initiated: boolean;
    quartile_25: boolean;
    quartile_50: boolean;
    quartile_75: boolean;
    completion: boolean;
    completion_rate_pct: number;
    pause_initiated: boolean;
    skipped: boolean;
    replay_count: number;
    muted_status: 'muted' | 'unmuted' | 'mixed';
    volume_level: number;
    audio_connection: AudioConnection;
    audible_time_sec: number;
    duration_sec: number | null;
    audible_quartile_25: boolean;
    audible_quartile_50: boolean;
    audible_quartile_75: boolean;
    audible_quartile_100: boolean;
    muted_throughout: boolean;
    unmuted_by_user: boolean;
}

// Сессия показа — полное состояние одного сегмента
export interface Session {
    impressionId: string;
    sessionGroupId: string;
    segmentIndex: number;
    deviceType: DeviceType;
    timestampStart: number;
    timestampEnd: number;

    // S1 — Time-in-View
    timeInViewSec: number;
    maxContinuousViewSec: number;
    visiblePixelsPct: number;
    mrcCompliant: boolean;
    viewStart: number | null;

    // S2 — Share of Screen
    shareOfScreenSamples: number[];
    shareOfScreenMax: number;

    // S3 — Scroll Velocity (null в cross-domain iframe)
    s3: SignalsS3State | null;

    // S4 — Tab Activity
    tabActiveTimeMs: number;
    tabTotalTimeMs: number;
    tabSwitchesCount: number;
    visibilityStateHistory: VisibilityEntry[];
    tabSessionStart: number;

    // S5 — Interaction Events
    clicked: boolean;
    hoverCount: number;
    hoverDurationMaxMs: number;
    hoverDurationTotalMs: number;
    hoverToClickLatencyMs: number | null;
    cursorProximityMinPx: number;
    cursorTrajectoryEntropy: number;
    tapCount: number;
    touchStartEndDeltaMs: number | null;
    zoom: boolean;
    swipeCount: number;
    lastHoverStart: number | null;

    // S6 — Video Engagement (null для не-video creative)
    s6: S6AccumulatorState | null;

    // S7 — Page Context
    creativePositionYPx: number;
    pageHeightTotalPx: number;
    isAboveTheFold: boolean;
    competingAdsVisible: number;
    viewabilityPersistenceSamples: boolean[];

    // F_Presence
    lastUserEventTimestamp: number | null;
    lastThrottledEventTimestamp: number | null;
    eventsDuringImpression: number;
    eventIntervals: number[];

    // Служебное
    sent: boolean;
    fpHash: string | null;
    publisherDomain: string;
}

// Конфигурация SDK — константы передаются явно, не через esbuild define
export interface SdkSignalConfig {
    debug: boolean;
    constants: TagConstantsValues;
}