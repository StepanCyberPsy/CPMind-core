import type { DisplaySessionContext } from './session.js';
import type { DisplayQueueEntry } from './types.js';
import { sendDisplayEvent } from './session.js';
import { waitForHtml5Ready } from './html5_bridge.js';

// Создание sandbox iframe без allow-same-origin
function createSandboxIframe(): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    iframe.style.display = 'block';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowtransparency', 'true');
    return iframe;
}

// Render flow для banner_html5
export async function runHtml5Flow(
    ctx: DisplaySessionContext,
    entry: DisplayQueueEntry,
    signal: AbortSignal,
): Promise<number> {
    if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const iframe = createSandboxIframe();
    entry.container.appendChild(iframe);

    const frame = await waitForHtml5Ready({
        iframe,
        assetUrl: entry.assetUrl,
        clickUrl: entry.clickUrl,
        constants: entry.tagConstants,
        onCreativeReady: () => sendDisplayEvent(ctx, 'creative_ready'),
        signal,
    });

    ctx.bridgeCleanup = frame.cleanup;
    ctx.frameConnect = frame.connect;
    return frame.renderConfirmedAt;
}