type CreativeToHostMessage =
    | { type: 'cpmind:ready'; version: string }
    | { type: 'cpmind:click'; href: string }
    | { type: 'cpmind:error'; code: string; message: string };

type HostToCreativeMessage =
    | { type: 'cpmind:init'; clickUrl: string | null; bridgeVersion: string }
    | { type: 'cpmind:destroy' };

declare const BRIDGE_VERSION: string;

function send(msg: CreativeToHostMessage): void {
    window.parent.postMessage(msg, '*');
}

function isHostMessage(data: unknown): data is HostToCreativeMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg.type === 'string';
}

function init(): void {
    let clickUrl: string | null = null;
    let initialized = false;
    const ac = new AbortController();
    const { signal } = ac;

    // Перехватываем клики внутри creative и делегируем хосту
    document.addEventListener('click', (e: MouseEvent) => {
        if (!initialized) return;

        const target = (e.target as HTMLElement).closest('a');
        if (target === null) return;

        const href = target.getAttribute('href');
        if (href === null || href === '' || href === '#') return;

        e.preventDefault();

        const resolvedHref = clickUrl ?? href;
        send({ type: 'cpmind:click', href: resolvedHref });
    }, { signal });

    // Слушаем команды от хоста
    window.addEventListener('message', (event: MessageEvent) => {
        // В sandbox без allow-same-origin event.origin === 'null'.
        // Единственная надёжная проверка — event.source === window.parent
        if (event.source !== window.parent) return;
        if (!isHostMessage(event.data)) return;

        const msg = event.data;

        if (msg.type === 'cpmind:init') {
            clickUrl = msg.clickUrl;
            initialized = true;
            return;
        }

        if (msg.type === 'cpmind:destroy') {
            ac.abort();
            return;
        }
    }, { signal });

    // Уведомляем хост что bridge готов — инициируем handshake
    send({ type: 'cpmind:ready', version: BRIDGE_VERSION });
}

try {
    init();
} catch (err) {
    window.parent.postMessage(
        { type: 'cpmind:error', code: 'BRIDGE_INIT_FAILED', message: String(err) },
        '*',
    );
}