import { executeClickthrough } from './click.js';
import { waitForFramePainted } from './render.js';
import type {
    Html5CreativeToHostMessage,
    Html5HostToCreativeMessage
} from './types.js';
import { HTML5_BRIDGE_VERSION } from './types.js';

// Парсинг и минимальная валидация входящего postMessage от creative
function parseCreativeMessage(data: unknown): Html5CreativeToHostMessage | null {
    if (typeof data !== 'object' || data === null) return null;
    const msg = data as Record<string, unknown>;
    if (typeof msg.type !== 'string') return null;
    return msg as unknown as Html5CreativeToHostMessage;
}

// Постоянный обработчик кликов — активен после завершения handshake
function setupClickHandler(
    iframe: HTMLIFrameElement,
    clickUrl: string | null,
): () => void {
    const handler = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        const msg = parseCreativeMessage(event.data);
        if (msg === null || msg.type !== 'cpmind:click') return;
        executeClickthrough(msg.href, clickUrl);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
}

// Handshake с creative bridge, инициализация клика и подтверждение render.
// event.origin === 'null' в sandbox без allow-same-origin — валидация только через event.source
export async function waitForHtml5Ready(
    iframe: HTMLIFrameElement,
    assetUrl: string,
    clickUrl: string | null,
    onCreativeReady: () => void,
    signal: AbortSignal,
): Promise<{ renderConfirmedAt: number; cleanup: () => void }> {
    if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            window.removeEventListener('message', onHandshake);
            signal.removeEventListener('abort', onAbort);
        };

        const onHandshake = (event: MessageEvent) => {
            if (event.source !== iframe.contentWindow) return;
            const msg = parseCreativeMessage(event.data);
            if (msg === null) return;

            if (msg.type === 'cpmind:error') {
                cleanup();
                reject(new Error('HTML5_CREATIVE_ERROR'));
                return;
            }

            if (msg.type !== 'cpmind:ready') return;

            cleanup();

            const initMsg: Html5HostToCreativeMessage = {
                type: 'cpmind:init',
                clickUrl,
                bridgeVersion: HTML5_BRIDGE_VERSION,
            };
            iframe.contentWindow?.postMessage(initMsg, '*');

            resolve();
        };

        const onAbort = () => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
        window.addEventListener('message', onHandshake);

        // src устанавливается после регистрации listener — исключает race condition
        iframe.src = assetUrl;
    });

    const cleanup = setupClickHandler(iframe, clickUrl);
    onCreativeReady();
    await waitForFramePainted();

    return { renderConfirmedAt: Date.now(), cleanup };
}