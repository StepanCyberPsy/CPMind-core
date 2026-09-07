import type { DeliveryRuntimeConfig } from '@cpmind/shared';

// Creative types
export type DisplayCreativeType =
    | 'banner_static'
    | 'banner_gif'
    | 'banner_html5';

// Queue entry
export interface DisplayQueueEntry extends DeliveryRuntimeConfig {
    container: HTMLElement;
    campaignId: string;
    creativeId: string;
    assetUrl: string;
}

// HTML5 bridge protocol
// event.origin = 'null' (opaque origin, sandbox без allow-same-origin)
// Валидация источника: event.source === iframe.contentWindow
export type Html5CreativeToHostMessage =
    | { type: 'cpmind:ready'; version: string }
    | { type: 'cpmind:click'; href: string }
    | { type: 'cpmind:error'; code: string; message: string };

export type Html5HostToCreativeMessage =
    | { type: 'cpmind:init'; clickUrl: string | null; bridgeVersion: string }
    | { type: 'cpmind:destroy' };

export const HTML5_BRIDGE_VERSION = '1' as const;

// Global
declare global {
    interface Window {
        __CPMIND_QUEUE__: DisplayQueueEntry[];
    }
}