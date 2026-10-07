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

    // Граница непрерывно просмотренного отрезка и время последнего шага воспроизведения
    watchedFrontierSec: number;
    lastTickAt: number | null;

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
    muted_by_user: boolean;
    closed_by_user: boolean;
    start_muted: boolean | null;
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
    muted_by_user: boolean;
    closed_by_user: boolean;
    start_muted?: boolean;
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

    // S2 — Share of Screen. Доля экрана взвешивается фактической длительностью
    // интервала между отсчётами: простое среднее по их количеству перекашивается,
    // когда браузер задерживает таймер под нагрузкой
    shareOfScreenWeightedSumPct: number;
    shareOfScreenWeightMs: number;
    shareOfScreenLastSamplePct: number | null;
    shareOfScreenLastSampleAt: number | null;
    shareOfScreenMax: number;

    // S3 — Scroll Velocity (null в cross-domain iframe)
    s3: SignalsS3State | null;

    // Наибольшая непрерывная остановка прокрутки и момент начала текущей.
    // Якорь хранится в сессии, а не в замыкании сигнала: незавершённый интервал
    // закрывается при сборке payload без изменения состояния
    scrollQuietMaxMs: number;
    scrollQuietStart: number | null;

    // S4 — Tab Activity
    tabActiveTimeMs: number;
    tabTotalTimeMs: number;
    tabSwitchesCount: number;
    visibilityStateHistory: VisibilityEntry[];
    tabSessionStart: number;

    // Фокус окна. Отдельный от видимости вкладки сигнал: переход в другое приложение
    // снимает фокус, не скрывая вкладку
    windowFocused: boolean;
    windowUnfocusedMaxMs: number;
    windowUnfocusedStart: number | null;

    // Наблюдение поверхности рантаймом. null в обоих полях — наблюдения не было:
    // закреплённое окно область просмотра не покидает, in-stream играет внутри контента
    surfaceAbsentMaxMs: number | null;
    surfaceAbsentStart: number | null;

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

    // Отклонённые хостом события моста HTML5-креатива — диагностика подделки взаимодействий
    unconfirmedFrameEvents: number;

    // Зона кнопки пропуска и поведение курсора относительно неё. Элемент передаёт
    // рантайм: его геометрию сигнал взаимодействий сам не знает
    skipZoneEl: HTMLElement | null;
    skipZoneSince: number | null;
    skipZoneHoverMs: number;
    skipZoneSampleAt: number | null;
    skipZoneHoverPending: boolean;
    skipZoneMovedOutside: boolean;

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

// Конфигурация SDK — константы передаются явно, не через esbuild define.
// explicitStart: начало измерения задаёт runtime через startMeasurement,
// S1 не выставляет timestampStart по первому попаданию во viewport
export interface SdkSignalConfig {
    debug: boolean;
    constants: TagConstantsValues;
    explicitStart?: boolean;
}