import {
    classifyFrameInteraction,
    type FrameInteractionKind,
    type FrameInteractionTrust,
} from '@cpmind/sdk';
import type { TagConstantsValues } from '@cpmind/shared';
import { executeClickthrough } from './click.js';
import { waitForFramePainted } from './render.js';
import type {
    FrameInteractionSink,
    Html5CreativeToHostMessage,
    Html5HostToCreativeMessage,
    Html5InteractionKind,
} from './types.js';
import { HTML5_BRIDGE_VERSION } from './types.js';

const FRAME_VISIBLE_RATIO = 0.5;

// Ограничение частоты на стороне хоста — диагностический счётчик отклонённых событий ограничен
const MIN_EVENT_INTERVAL_MS: Readonly<Record<FrameInteractionKind, number>> = {
    activity: 250,
    click: 100,
    tap: 100,
    swipe: 100,
    zoom: 100,
};

const INTERACTION_KINDS: ReadonlySet<string> = new Set([
    'click',
    'tap',
    'swipe',
    'zoom',
]);

interface UserActivationState {
    readonly isActive: boolean;
}

export interface Html5ReadyOptions {
    iframe: HTMLIFrameElement;
    assetUrl: string;
    clickUrl: string | null;
    constants: TagConstantsValues;
    onCreativeReady: () => void;
    signal: AbortSignal;
}

export interface Html5FrameSession {
    renderConfirmedAt: number;
    connect(sink: FrameInteractionSink): void;
    cleanup(): void;
}

interface FrameTracker {
    connect(sink: FrameInteractionSink): void;
    cleanup(): void;
}

// Строгий разбор входящего postMessage: сообщение исходит от кода креатива и не является доверенным
function parseCreativeMessage(data: unknown): Html5CreativeToHostMessage | null {
    if (typeof data !== 'object' || data === null) return null;
    const msg = data as Record<string, unknown>;

    switch (msg['type']) {
        case 'cpmind:ready': {
            const version = msg['version'];
            return typeof version === 'string'
                ? { type: 'cpmind:ready', version }
                : null;
        }
        case 'cpmind:click': {
            const href = msg['href'];
            return typeof href === 'string'
                ? { type: 'cpmind:click', href }
                : null;
        }
        case 'cpmind:activity': {
            return { type: 'cpmind:activity' };
        }
        case 'cpmind:interaction': {
            const kind = msg['kind'];
            return typeof kind === 'string' && INTERACTION_KINDS.has(kind)
                ? { type: 'cpmind:interaction', kind: kind as Html5InteractionKind }
                : null;
        }
        case 'cpmind:error': {
            const code = msg['code'];
            const message = msg['message'];
            return typeof code === 'string'
                ? { type: 'cpmind:error', code, message: typeof message === 'string' ? message : '' }
                : null;
        }
        default: {
            return null;
        }
    }
}

// null — API активации пользователя не поддерживается браузером
function readUserActivation(): boolean | null {
    const activation = (navigator as unknown as { userActivation?: UserActivationState }).userActivation;
    return activation !== undefined ? activation.isActive : null;
}

function detectHoverCapability(): boolean {
    try {
        return typeof window.matchMedia === 'function' &&
            window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
        return false;
    }
}

// Наблюдение страницы за iframe креатива: курсор, фокус, видимость и активация пользователя.
// Клик внутрь iframe фиксируется переходом фокуса — событие не зависит от кода креатива
function createFrameTracker(
    iframe: HTMLIFrameElement,
    clickUrl: string | null,
): FrameTracker {
    const hoverCapable = detectHoverCapability();
    const lastEventAt: Partial<Record<FrameInteractionKind, number>> = {};
    let sink: FrameInteractionSink | null = null;
    let pointerOver = false;
    let frameFocused = false;
    let frameVisible = false;
    let lastDirectAt: number | null = null;
    let focusCheckId: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function isRateLimited(
        kind: FrameInteractionKind,
        now: number,
    ): boolean {
        const last = lastEventAt[kind];
        if (last !== undefined && now - last < MIN_EVENT_INTERVAL_MS[kind]) return true;
        lastEventAt[kind] = now;
        return false;
    }

    function deliver(
        kind: FrameInteractionKind,
        trust: FrameInteractionTrust,
        now: number,
    ): void {
        if (sink === null) return;
        if (trust === 'direct') lastDirectAt = now;
        sink(kind, trust);
    }

    function handleFrameEvent(kind: FrameInteractionKind): void {
        if (sink === null) return;

        const now = Date.now();
        if (isRateLimited(kind, now)) return;

        const trust = classifyFrameInteraction(kind, {
            pointerOver,
            frameFocused,
            frameVisible,
            documentVisible: document.visibilityState === 'visible',
            hoverCapable,
            userActivationActive: readUserActivation(),
            msSinceLastDirect: lastDirectAt !== null ? now - lastDirectAt : null,
        });

        deliver(kind, trust, now);
    }

    const onMessage = (event: MessageEvent): void => {
        if (event.source !== iframe.contentWindow) return;
        const msg = parseCreativeMessage(event.data);
        if (msg === null) return;

        switch (msg.type) {
            case 'cpmind:click': {
                executeClickthrough(msg.href, clickUrl);
                return;
            }
            case 'cpmind:activity': {
                handleFrameEvent('activity');
                return;
            }
            case 'cpmind:interaction': {
                handleFrameEvent(msg.kind);
                return;
            }
            default: {
                return;
            }
        }
    };

    const onPointerEnter = (e: PointerEvent): void => {
        if (e.isTrusted && e.pointerType !== 'touch') pointerOver = true;
    };

    const onPointerLeave = (): void => {
        pointerOver = false;
    };

    const onWindowBlur = (): void => {
        if (focusCheckId !== null) clearTimeout(focusCheckId);

        // Firefox обновляет activeElement после события blur
        focusCheckId = setTimeout(() => {
            focusCheckId = null;
            if (disposed || frameFocused || document.activeElement !== iframe) return;

            frameFocused = true;

            // Программный фокус без жеста пользователя кликом не считается
            if (readUserActivation() === false || sink === null) return;

            const now = Date.now();
            if (isRateLimited('click', now)) return;
            deliver('click', 'direct', now);
        }, 0);
    };

    const onWindowFocus = (): void => {
        frameFocused = false;
    };

    const observer = typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
                const entry = entries[entries.length - 1];
                if (entry !== undefined) {
                    frameVisible = entry.intersectionRatio >= FRAME_VISIBLE_RATIO;
                }
            },
            { threshold: [0, FRAME_VISIBLE_RATIO] },
        )
        : null;

    window.addEventListener('message', onMessage);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    iframe.addEventListener('pointerenter', onPointerEnter);
    iframe.addEventListener('pointerleave', onPointerLeave);
    observer?.observe(iframe);

    return {
        connect(next: FrameInteractionSink): void {
            if (!disposed) sink = next;
        },

        cleanup(): void {
            if (disposed) return;
            disposed = true;
            sink = null;

            if (focusCheckId !== null) {
                clearTimeout(focusCheckId);
                focusCheckId = null;
            }

            window.removeEventListener('message', onMessage);
            window.removeEventListener('blur', onWindowBlur);
            window.removeEventListener('focus', onWindowFocus);
            iframe.removeEventListener('pointerenter', onPointerEnter);
            iframe.removeEventListener('pointerleave', onPointerLeave);
            observer?.disconnect();

            const destroyMsg: Html5HostToCreativeMessage = { type: 'cpmind:destroy' };
            iframe.contentWindow?.postMessage(destroyMsg, '*');
        },
    };
}

// Handshake с creative bridge, инициализация клика и подтверждение render.
// event.origin === 'null' в sandbox без allow-same-origin — валидация только через event.source.
// Наблюдение за iframe начинается до загрузки: курсор может находиться над креативом с первого кадра
export async function waitForHtml5Ready(
    options: Html5ReadyOptions,
): Promise<Html5FrameSession> {
    const {
        iframe,
        assetUrl,
        clickUrl,
        constants,
        onCreativeReady,
        signal,
    } = options;

    if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const tracker = createFrameTracker(iframe, clickUrl);

    try {
        await new Promise<void>((resolve, reject) => {
            const cleanup = (): void => {
                window.removeEventListener('message', onHandshake);
                signal.removeEventListener('abort', onAbort);
            };

            const onHandshake = (event: MessageEvent): void => {
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
                    gestures: {
                        tapMaxOffsetPx: constants.TAP_MAX_OFFSET_PX,
                        tapMaxDurationMs: constants.TAP_MAX_DURATION_MS,
                        swipeMinDistancePx: constants.SWIPE_MIN_DISTANCE_PX,
                        pinchDeltaMinPx: constants.PINCH_DELTA_MIN_PX,
                    },
                };
                iframe.contentWindow?.postMessage(initMsg, '*');

                resolve();
            };

            const onAbort = (): void => {
                cleanup();
                reject(new DOMException('Aborted', 'AbortError'));
            };

            signal.addEventListener('abort', onAbort, { once: true });
            window.addEventListener('message', onHandshake);

            // src устанавливается после регистрации listener — исключает race condition
            iframe.src = assetUrl;
        });
    } catch (err) {
        tracker.cleanup();
        throw err;
    }

    onCreativeReady();
    await waitForFramePainted();

    return {
        renderConfirmedAt: Date.now(),
        connect: tracker.connect,
        cleanup: tracker.cleanup,
    };
}