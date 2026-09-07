import type { PlayerTimeouts } from '@cpmind/shared';

export interface SdkRuntimeConfig {
    timeouts: PlayerTimeouts;
}

// Значения совпадают с backend seed (delivery_runtime_configs v1.0)
export const DEFAULT_PLAYER_TIMEOUTS: PlayerTimeouts = {
    configRequestMs: 5_000,
    vastRequestMs: 8_000,
    mediaStartMs: 15_000,
    firstFrameMs: 10_000,
    contentHandoffMs: 5_000,
    adLoadTotalMs: 30_000,
};

export function createDefaultRuntimeConfig(): SdkRuntimeConfig {
    return { timeouts: { ...DEFAULT_PLAYER_TIMEOUTS } };
}

// Применяет полученный с backend конфиг поверх defaults — защита от неполного ответа
export function applyServerRuntimeConfig(
    received: Partial<PlayerTimeouts>,
): SdkRuntimeConfig {
    return {
        timeouts: {
            ...DEFAULT_PLAYER_TIMEOUTS,
            ...received,
        },
    };
}