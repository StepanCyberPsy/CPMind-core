import type { TagConstantsValues } from '@cpmind/shared';

/**
 * Калибруемые константы тега. Значения подставляются esbuild через define
 * при сборке конкретной версии (см. packages/backend/src/services/tag_builder.ts
 * и packages/tag/build.ts) — это не настоящие глобальные переменные браузера,
 * а текстовая замена идентификатора на JSON-литерал на этапе бандлинга.
 * Объявления ниже — только для типизации, область видимости ограничена этим файлом.
 */
declare const __CPMIND_CONSTANTS__: TagConstantsValues;
declare const __CPMIND_TAG_VERSION__: string;

// Версия констант, с которой собран этот конкретный бандл — передается в payload (session.ts)
export const TAG_CONSTANTS_VERSION = __CPMIND_TAG_VERSION__;

// F_Presence
export const PRESENCE_IDLE_TIMEOUT_MS = __CPMIND_CONSTANTS__.PRESENCE_IDLE_TIMEOUT_MS;

// S1
export const S1_VIEWPORT_THRESHOLDS = __CPMIND_CONSTANTS__.S1_VIEWPORT_THRESHOLDS;

// S2
export const S2_SAMPLE_INTERVAL_MS = __CPMIND_CONSTANTS__.S2_SAMPLE_INTERVAL_MS;

// S3
export const SCROLL_ZONE_PX = __CPMIND_CONSTANTS__.SCROLL_ZONE_PX;
export const PAUSE_THRESHOLD_MS = __CPMIND_CONSTANTS__.PAUSE_THRESHOLD_MS;
export const STREAK_WINDOW_MS = __CPMIND_CONSTANTS__.STREAK_WINDOW_MS;
export const STREAK_MIN_EVENTS = __CPMIND_CONSTANTS__.STREAK_MIN_EVENTS;
export const STREAK_MIN_SPEED = __CPMIND_CONSTANTS__.STREAK_MIN_SPEED;
export const READING_SPEED_MAX = __CPMIND_CONSTANTS__.READING_SPEED_MAX;
export const READING_TIME_MIN = __CPMIND_CONSTANTS__.READING_TIME_MIN;

// S5
export const SWIPE_MIN_DISTANCE_PX = __CPMIND_CONSTANTS__.SWIPE_MIN_DISTANCE_PX;
export const ENTROPY_ANGLE_THRESHOLD = __CPMIND_CONSTANTS__.ENTROPY_ANGLE_THRESHOLD;
export const PROXIMITY_TRACK_ZONE_PX = __CPMIND_CONSTANTS__.PROXIMITY_TRACK_ZONE_PX;
export const PINCH_DELTA_MIN_PX = __CPMIND_CONSTANTS__.PINCH_DELTA_MIN_PX;
export const GESTURE_SCALE_DELTA_MIN = __CPMIND_CONSTANTS__.GESTURE_SCALE_DELTA_MIN;
export const TAP_MAX_OFFSET_PX = __CPMIND_CONSTANTS__.TAP_MAX_OFFSET_PX;
export const TAP_MAX_DURATION_MS = __CPMIND_CONSTANTS__.TAP_MAX_DURATION_MS;
export const MOUSE_MOVE_DEDUP_PX = __CPMIND_CONSTANTS__.MOUSE_MOVE_DEDUP_PX;

// S7
export const S7_SAMPLE_INTERVAL_MS = __CPMIND_CONSTANTS__.S7_SAMPLE_INTERVAL_MS;