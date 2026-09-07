import { PlayerError, type PlayerErrorCode } from '../errors.js';

// IAB VAST 4.3 numeric error codes.
// Используются для:
// 1. Замены [ERRORCODE] макроса в <Error> tracking URL
// 2. Отчётности в ad_sessions.error_code
// Источник: IAB VAST 4.3 spec §2.4.2.3
const VAST_ERROR_CODES: Readonly<Record<PlayerErrorCode, number>> = {
    // VAST parse / structure errors
    [PlayerError.VAST_XML_INVALID]: 100,
    [PlayerError.VAST_STRUCTURE_UNSUPPORTED]: 200,
    [PlayerError.VAST_FETCH_TIMEOUT]: 301,
    [PlayerError.VAST_FETCH_FAILED]: 303,

    // Media errors
    [PlayerError.NO_SUPPORTED_MEDIA]: 403,
    [PlayerError.MEDIA_LOAD_FAILED]: 402,
    [PlayerError.MEDIA_START_TIMEOUT]: 402,
    [PlayerError.FIRST_FRAME_TIMEOUT]: 402,
    [PlayerError.MEDIA_PLAYBACK_BLOCKED]: 400,

    // Lifecycle / infrastructure
    [PlayerError.CONTENT_BRIDGE_FAILED]: 900,
    [PlayerError.CONTENT_RESUME_FAILED]: 900,
    [PlayerError.PLAYER_DESTROYED]: 900,
} as const;

// Возвращает IAB VAST error code для данного PlayerErrorCode.
// При неизвестном коде — 900 (undefined error), как предписывает IAB spec.
export function toVastErrorCode(code: PlayerErrorCode): number {
    return VAST_ERROR_CODES[code] ?? 900;
}