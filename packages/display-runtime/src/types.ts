import type { DeliveryRuntimeConfig } from '@cpmind/shared';
import type {
    FrameInteractionKind,
    FrameInteractionTrust,
} from '@cpmind/sdk';

// Creative types
export type DisplayCreativeType =
    | 'banner_static'
    | 'banner_gif'
    | 'banner_html5';

// Queue entry
export interface DisplayQueueEntry extends DeliveryRuntimeConfig {
    container: HTMLElement;
    assetUrl: string;
}

// Получатель взаимодействий HTML5-креатива после классификации хостом
export type FrameInteractionSink = (
    kind: FrameInteractionKind,
    trust: FrameInteractionTrust,
) => void;

export type Html5InteractionKind = Exclude<FrameInteractionKind, 'activity'>;

// Пороги жестов для creative-bridge из активной версии констант
export interface Html5GestureThresholds {
    tapMaxOffsetPx: number;
    tapMaxDurationMs: number;
    swipeMinDistancePx: number;
    pinchDeltaMinPx: number;
}

// HTML5 bridge protocol v2
// event.origin = 'null' (opaque origin, sandbox без allow-same-origin)
// Валидация источника: event.source === iframe.contentWindow
export type Html5CreativeToHostMessage =
    | { type: 'cpmind:ready'; version: string }
    | { type: 'cpmind:click'; href: string }
    | { type: 'cpmind:activity' }
    | { type: 'cpmind:interaction'; kind: Html5InteractionKind }
    | { type: 'cpmind:error'; code: string; message: string };

export type Html5HostToCreativeMessage =
    | { type: 'cpmind:init'; clickUrl: string | null; bridgeVersion: string; gestures: Html5GestureThresholds }
    | { type: 'cpmind:destroy' };

export const HTML5_BRIDGE_VERSION = '2' as const;

// Global
declare global {
    interface Window {
        __CPMIND_QUEUE__: DisplayQueueEntry[];
    }
}