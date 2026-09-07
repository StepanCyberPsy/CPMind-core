import { substituteMacros, type MacroContext } from './macros.js';
import type { VastTrackingResource, VastLinearTrackingEventType } from '@cpmind/shared';

// Отправляет один tracking pixel.
// fetch с keepalive гарантирует доставку при закрытии страницы.
// Fire-and-forget — не блокирует воспроизведение
function firePixel(url: string, ctx: MacroContext): void {
    const resolved = substituteMacros(url, ctx);
    if (resolved === '') return;

    fetch(resolved, {
        method: 'GET',
        keepalive: true,
        credentials: 'omit',
        mode: 'no-cors',
    }).catch(() => {
        // Tracking pixels — best-effort, ошибки сети не влияют на плеер
    });
}

// Файрит impression pixels (несколько — каждый независимо)
export function fireImpression(
    impressionUrls: readonly string[],
    ctx: MacroContext = {},
): void {
    for (const url of impressionUrls) {
        firePixel(url, ctx);
    }
}

// Файрит VAST <Error> URL с заменой [ERRORCODE]
export function fireError(
    errorUrls: readonly string[],
    ctx: MacroContext,
): void {
    for (const url of errorUrls) {
        firePixel(url, ctx);
    }
}

// Файрит tracking events по названию (start, firstQuartile, complete, etc.)
export function fireTrackingEvent(
    trackingEvents: readonly VastTrackingResource[],
    event: VastLinearTrackingEventType,
    ctx: MacroContext = {},
): void {
    for (const t of trackingEvents) {
        if (t.event === event) {
            firePixel(t.url, ctx);
        }
    }
}

// Файрит click tracking pixels
export function fireClickTracking(
    clickTrackingUrls: readonly string[],
    ctx: MacroContext = {},
): void {
    for (const url of clickTrackingUrls) {
        firePixel(url, ctx);
    }
}