import type {
    AdSessionId,
    PlayerLifecycleState,
    PlayerTerminalOutcome,
    PlayerActionSource,
    DeliveryRuntimeConfig,
    InstreamSubtype,
} from '@cpmind/shared';

export type {
    PlayerLifecycleState,
    PlayerTerminalOutcome,
    PlayerActionSource
};

// Конфигурация с выданной ad-сессией — обязательна для создания сессии воспроизведения
export type ResolvedDeliveryConfig = DeliveryRuntimeConfig & {
    adSessionId: AdSessionId;
};

// Конфигурация Player instance. Расширяет DeliveryRuntimeConfig runtime-полями.
export interface PlayerConfig {
    deliveryConfig: DeliveryRuntimeConfig;
    container: HTMLElement;
    // Версия Player bundle — инжектируется через esbuild define
    runtimeVersion: string;
}

// Публичный контроллер Player, возвращаемый из attach/mount методов.
// adSessionId = null, пока in-stream сессия не выдана
export interface PlayerController {
    readonly adSessionId: AdSessionId | null;
    destroy(): void;
}

// Опции монтирования outstream Player
export interface OutstreamOptions {
    container: HTMLElement;
    deliveryConfig: ResolvedDeliveryConfig;
    // Пороги IntersectionObserver
    eligibilityThreshold?: number; // default: 0 (любой px в viewport → начать загрузку)
    playThreshold?: number; // default: 0.5 (MRC standard: 50% visible → play)
}

// Опции монтирования закреплённого Player. Позиция и размер берутся
// из параметров плейсмента, при их отсутствии применяются значения по умолчанию
export interface StickyOptions {
    container: HTMLElement;
    deliveryConfig: ResolvedDeliveryConfig;
}

// Опции привязки in-stream Player к существующему content video element.
// resolveAdSessionId выдаёт сессию в момент рекламной вставки.
// subtype задаёт точку вставки рекламы в контент издателя
export interface NativeAttachOptions {
    contentVideo: HTMLVideoElement;
    deliveryConfig: DeliveryRuntimeConfig;
    subtype: InstreamSubtype;
    container?: HTMLElement; // если не указан — берётся из contentVideo.parentElement
    resolveAdSessionId?: (() => Promise<AdSessionId>) | undefined;
}