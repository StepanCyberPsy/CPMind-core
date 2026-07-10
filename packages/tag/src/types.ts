export type CreativeType = 'banner_static' | 'banner_gif' | 'banner_html5' | 'video_creative';
export type DeviceType   = 'desktop' | 'mobile' | 'tablet';

export interface TagConfig {
  tagUuid: string;
  tagConstantsVersion: string;
  campaignId: string;
  creativeId: string;
  creativeType: CreativeType;
  skippable: boolean;
  publisherDomain?: string;
  endpoint: string;
  debug: boolean;
}

export interface VisibilityEntry {
  state: 'visible' | 'hidden';
  timestamp: number;
}

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

export interface SignalsS6State {
  // Внутренние поля отслеживания
  videoEl: HTMLVideoElement;
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

  // Audibility
  muted_status: 'muted' | 'unmuted' | 'mixed';
  volume_level: number;
  audio_connection: 'speaker' | 'headphones' | 'bluetooth' | 'unknown';
  audible_time_sec: number;
  audible_quartile_25: boolean;
  audible_quartile_50: boolean;
  audible_quartile_75: boolean;
  audible_quartile_100: boolean;
  unmuted_by_user: boolean;
}

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
  audio_connection: 'speaker' | 'headphones' | 'bluetooth' | 'unknown';
  audible_time_sec: number;
  duration_sec: number | null;
  audible_quartile_25: boolean;
  audible_quartile_50: boolean;
  audible_quartile_75: boolean;
  audible_quartile_100: boolean;
  muted_throughout: boolean;
  unmuted_by_user: boolean;
}

export interface Session {
  impressionId: string;
  sessionGroupId: string;
  segmentIndex: number;
  deviceType: DeviceType;
  timestampStart: number;
  timestampEnd: number;

  // S1
  timeInViewSec: number;
  maxContinuousViewSec: number;
  visiblePixelsPct: number;
  mrcCompliant: boolean;
  viewStart: number | null;

  // S2
  shareOfScreenSamples: number[];
  shareOfScreenMax: number;

  // S3
  s3: SignalsS3State | null;

  // S4
  tabActiveTimeMs: number;
  tabTotalTimeMs: number;
  tabSwitchesCount: number;
  visibilityStateHistory: VisibilityEntry[];
  tabSessionStart: number;

  // S5
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

  // S6
  s6: SignalsS6State | null;

  // S7
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