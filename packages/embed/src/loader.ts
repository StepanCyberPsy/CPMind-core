import type { DeliveryRuntimeConfig } from '@cpmind/shared';

declare const CDN_BASE_URL: string;

declare global {
    interface Window {
        __CPMIND_QUEUE__: QueueEntry[];
        __CPMIND_LOADER__: boolean | undefined;
    }
}

interface QueueEntry extends DeliveryRuntimeConfig {
    container: HTMLElement;
    campaignId: string;
    creativeId: string;
    assetUrl: string;
    displayRuntimeVersion: string;
    playerRuntimeVersion: string;
}

function buildDisplayUrl(version: string): string {
    return `${CDN_BASE_URL}/runtime/cpmind-display_v${version}.min.js`;
}

function buildPlayerUrl(version: string): string {
    return `${CDN_BASE_URL}/runtime/cpmind-player_v${version}.min.js`;
}

function loadScript(src: string): void {
    if (document.querySelector(`script[src="${src}"]`) !== null) return;

    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
}

function resolveRuntimeUrl(entry: QueueEntry): string | null {
    const { creativeType } = entry;

    if (
        creativeType === 'banner_static' ||
        creativeType === 'banner_gif' ||
        creativeType === 'banner_html5'
    ) {
        return buildDisplayUrl(entry.displayRuntimeVersion);
    }

    if (creativeType === 'video_creative') {
        return buildPlayerUrl(entry.playerRuntimeVersion);
    }

    return null;
}

export function initLoader(): void {
    const queue = window.__CPMIND_QUEUE__ ?? [];

    const urlsToLoad = new Set<string>();
    for (const entry of queue) {
        const url = resolveRuntimeUrl(entry);
        if (url !== null) urlsToLoad.add(url);
    }

    for (const url of urlsToLoad) {
        loadScript(url);
    }

    const originalPush = Array.prototype.push;
    window.__CPMIND_QUEUE__.push = function (
        this: QueueEntry[],
        ...entries: QueueEntry[]
    ): number {
        for (const entry of entries) {
            const url = resolveRuntimeUrl(entry);
            if (url !== null) loadScript(url);
        }
        return originalPush.apply(this, entries);
    } as typeof Array.prototype.push;
}