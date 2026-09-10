import type {
    PlayerLifecycleState,
    PlayerTerminalOutcome,
    PlayerActionSource,
    DeliveryRuntimeConfig,
} from '@cpmind/shared';

export type {
    PlayerLifecycleState,
    PlayerTerminalOutcome,
    PlayerActionSource
};

// Конфигурация Player instance. Расширяет DeliveryRuntimeConfig runtime-полями.
export interface PlayerConfig {
    deliveryConfig: DeliveryRuntimeConfig;
    container: HTMLElement;
    // Версия Player bundle — инжектируется через esbuild define
    runtimeVersion: string;
}

// Публичный контроллер Player, возвращаемый из attach/mount методов
export interface PlayerController {
    readonly adSessionId: string;
    destroy(): void;
}

// Опции монтирования outstream Player
export interface OutstreamOptions {
    container: HTMLElement;
    deliveryConfig: DeliveryRuntimeConfig;
    // Пороги IntersectionObserver
    eligibilityThreshold?: number; // default: 0 (любой px в viewport → начать загрузку)
    playThreshold?: number; // default: 0.5 (MRC standard: 50% visible → play)
}

// Опции привязки in-stream Player к существующему content video element
export interface NativeAttachOptions {
    contentVideo: HTMLVideoElement;
    deliveryConfig: DeliveryRuntimeConfig;
    container?: HTMLElement; // если не указан — берётся из contentVideo.parentElement
    resolveAdSessionId?: (() => Promise<DeliveryRuntimeConfig['adSessionId']>) | undefined;
}