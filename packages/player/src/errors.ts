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

// Все коды PlayerError входят в AdSessionPlayerErrorCode — причина сбоя сохраняется без подмены
export function toAdSessionErrorCode(code: PlayerErrorCode): AdSessionPlayerErrorCode {
    return code;
}

export type PlayerErrorCode = typeof PlayerError[keyof typeof PlayerError];