import type { AdSessionPlayerErrorCode } from '@cpmind/shared';

// Строковые error codes CPMind Player.
// Маппинг на IAB VAST numeric codes — в vast/error_codes.ts
export const PlayerError = {
    // VAST fetch / parse
    VAST_FETCH_FAILED: 'VAST_FETCH_FAILED',
    VAST_FETCH_TIMEOUT: 'VAST_FETCH_TIMEOUT',
    VAST_XML_INVALID: 'VAST_XML_INVALID',
    VAST_STRUCTURE_UNSUPPORTED: 'VAST_STRUCTURE_UNSUPPORTED',

    // Media
    NO_SUPPORTED_MEDIA: 'NO_SUPPORTED_MEDIA',
    MEDIA_LOAD_FAILED: 'MEDIA_LOAD_FAILED',
    MEDIA_PLAYBACK_BLOCKED: 'MEDIA_PLAYBACK_BLOCKED',
    MEDIA_START_TIMEOUT: 'MEDIA_START_TIMEOUT',
    FIRST_FRAME_TIMEOUT: 'FIRST_FRAME_TIMEOUT',

    // Content / bridge
    CONTENT_BRIDGE_FAILED: 'CONTENT_BRIDGE_FAILED',
    CONTENT_RESUME_FAILED: 'CONTENT_RESUME_FAILED',

    // Lifecycle
    PLAYER_DESTROYED: 'PLAYER_DESTROYED',
} as const;

// VAST_FETCH_TIMEOUT не входит в AdSessionPlayerErrorCode — маппим на MEDIA_START_TIMEOUT
export function toAdSessionErrorCode(code: PlayerErrorCode): AdSessionPlayerErrorCode {
    if (code === PlayerError.VAST_FETCH_TIMEOUT) return 'MEDIA_START_TIMEOUT';
    return code as AdSessionPlayerErrorCode;
}

export type PlayerErrorCode = typeof PlayerError[keyof typeof PlayerError];