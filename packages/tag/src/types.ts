export type CreativeType = 'banner_static' | 'banner_gif' | 'banner_html5';
export type DeviceType   = 'desktop' | 'mobile' | 'tablet';

export interface TagConfig {
  campaignId: string;
  creativeId: string;
  creativeType: CreativeType;
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

  // S7
  creativePositionYPx: number;
  pageHeightTotalPx: number;
  isAboveTheFold: boolean;
  competingAdsVisible: number;
  viewabilityPersistenceSamples: boolean[];

  // F_Presence
  lastUserEventTimestamp: number | null;
  eventsDuringImpression: number;

  // Служебное
  sent: boolean;
}