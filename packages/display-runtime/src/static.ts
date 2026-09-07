import type { DisplaySessionContext } from './session.js';
import type { DisplayQueueEntry } from './types.js';
import { sendDisplayEvent } from './session.js';
import { waitForImageLoaded, waitForFramePainted } from './render.js';

// Проверка clickUrl: запрещены javascript:, data:, vbscript: и прочие небезопасные схемы
function toSafeHref(url: string | null): string | null {
    if (url === null) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return url;
        }
        return null;
    } catch {
        return null;
    }
}

// Render flow для banner_static и banner_gif
export async function runStaticFlow(
    ctx: DisplaySessionContext,
    entry: DisplayQueueEntry,
    signal: AbortSignal,
): Promise<number> {
    const safeHref = toSafeHref(entry.clickUrl);

    const anchor = document.createElement('a');
    anchor.style.display = 'block';
    anchor.style.width = '100%';
    anchor.style.height = '100%';
    anchor.style.lineHeight = '0';
    anchor.style.cursor = safeHref !== null ? 'pointer' : 'default';

    if (safeHref !== null) {
        anchor.href = safeHref;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
    }

    const img = document.createElement('img');
    img.src = entry.assetUrl;
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.border = 'none';
    img.alt = '';
    img.draggable = false;

    anchor.appendChild(img);
    entry.container.appendChild(anchor);

    await waitForImageLoaded(img, signal);
    sendDisplayEvent(ctx, 'creative_ready');

    await waitForFramePainted();
    return Date.now();
}