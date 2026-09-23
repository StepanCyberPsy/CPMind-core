type InteractionKind =
    | 'click'
    | 'tap'
    | 'swipe'
    | 'zoom';

type CreativeToHostMessage =
    | { type: 'cpmind:ready'; version: string }
    | { type: 'cpmind:click'; href: string }
    | { type: 'cpmind:activity' }
    | { type: 'cpmind:interaction'; kind: InteractionKind }
    | { type: 'cpmind:error'; code: string; message: string };

// Пороги жестов из активной версии констант — те же значения, что использует S5 SDK
interface GestureThresholds {
    tapMaxOffsetPx: number;
    tapMaxDurationMs: number;
    swipeMinDistancePx: number;
    pinchDeltaMinPx: number;
}

type HostToCreativeMessage =
    | { type: 'cpmind:init'; clickUrl: string | null; bridgeVersion: string; gestures?: GestureThresholds }
    | { type: 'cpmind:destroy' };

interface TouchPoint {
    x: number;
    y: number;
}

interface TapCandidate extends TouchPoint {
    startedAt: number;
}

declare const BRIDGE_VERSION: string;

const ACTIVITY_INTERVAL_MS = 500;
const INTERACTION_INTERVAL_MS = 100;

const ACTIVITY_EVENTS = [
    'pointermove',
    'pointerdown',
    'keydown',
    'wheel',
    'scroll',
    'touchstart',
] as const;

function send(msg: CreativeToHostMessage): void {
    window.parent.postMessage(msg, '*');
}

function isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parseGestures(value: unknown): GestureThresholds | null {
    if (typeof value !== 'object' || value === null) return null;
    const raw = value as Record<string, unknown>;
    const tapMaxOffsetPx = raw['tapMaxOffsetPx'];
    const tapMaxDurationMs = raw['tapMaxDurationMs'];
    const swipeMinDistancePx = raw['swipeMinDistancePx'];
    const pinchDeltaMinPx = raw['pinchDeltaMinPx'];

    if (
        !isPositiveNumber(tapMaxOffsetPx) ||
        !isPositiveNumber(tapMaxDurationMs) ||
        !isPositiveNumber(swipeMinDistancePx) ||
        !isPositiveNumber(pinchDeltaMinPx)
    ) {
        return null;
    }

    return {
        tapMaxOffsetPx,
        tapMaxDurationMs,
        swipeMinDistancePx,
        pinchDeltaMinPx,
    };
}

function isHostMessage(data: unknown): data is HostToCreativeMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg.type === 'string';
}

function touchDistance(
    first: Touch,
    second: Touch,
): number {
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function init(): void {
    let clickUrl: string | null = null;
    let gestures: GestureThresholds | null = null;
    let initialized = false;
    let lastActivityAt = 0;
    let lastPointerType = '';
    let tapCandidate: TapCandidate | null = null;
    let swipeOrigin: TouchPoint | null = null;
    let pinchStartDistance: number | null = null;
    const lastInteractionAt: Partial<Record<InteractionKind, number>> = {};
    const ac = new AbortController();
    const { signal } = ac;
    const passiveOptions: AddEventListenerOptions = {
        capture: true,
        passive: true,
        signal,
    };

    // События пересылаются только после handshake и только доверенные — хост дополнительно
    // подтверждает каждое событие собственным наблюдением
    function reportActivity(event: Event): void {
        if (!initialized || !event.isTrusted) return;
        const now = Date.now();
        if (now - lastActivityAt < ACTIVITY_INTERVAL_MS) return;
        lastActivityAt = now;
        send({ type: 'cpmind:activity' });
    }

    function reportInteraction(kind: InteractionKind): void {
        const now = Date.now();
        const last = lastInteractionAt[kind];
        if (last !== undefined && now - last < INTERACTION_INTERVAL_MS) return;
        lastInteractionAt[kind] = now;
        send({ type: 'cpmind:interaction', kind });
    }

    function resetTouchState(): void {
        tapCandidate = null;
        swipeOrigin = null;
        pinchStartDistance = null;
    }

    for (const type of ACTIVITY_EVENTS) {
        document.addEventListener(type, reportActivity, passiveOptions);
    }

    document.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.isTrusted) lastPointerType = e.pointerType;
    }, passiveOptions);

    // Перехватываем клики внутри creative и делегируем хосту. Тап сообщается жестом —
    // синтетический click после касания не дублируется
    document.addEventListener('click', (e: MouseEvent) => {
        if (!initialized) return;

        if (e.isTrusted && lastPointerType !== 'touch') {
            reportInteraction('click');
        }

        const target = e.target instanceof Element ? e.target.closest('a') : null;
        if (target === null) return;

        const href = target.getAttribute('href');
        if (href === null || href === '' || href === '#') return;

        e.preventDefault();

        const resolvedHref = clickUrl ?? href;
        send({ type: 'cpmind:click', href: resolvedHref });
    }, { signal });

    document.addEventListener('touchstart', (e: TouchEvent) => {
        if (!initialized || !e.isTrusted || gestures === null) return;

        const first = e.touches[0];
        const second = e.touches[1];

        if (e.touches.length === 1 && first !== undefined) {
            tapCandidate = {
                x: first.clientX,
                y: first.clientY,
                startedAt: Date.now(),
            };
            swipeOrigin = {
                x: first.clientX,
                y: first.clientY,
            };
            pinchStartDistance = null;
            return;
        }

        // Мультитач не является тапом или свайпом
        tapCandidate = null;
        swipeOrigin = null;

        if (e.touches.length === 2 && first !== undefined && second !== undefined) {
            pinchStartDistance = touchDistance(first, second);
        }
    }, passiveOptions);

    document.addEventListener('touchmove', (e: TouchEvent) => {
        if (!initialized || !e.isTrusted || gestures === null) return;

        const first = e.touches[0];
        const second = e.touches[1];

        if (
            e.touches.length === 2 &&
            first !== undefined &&
            second !== undefined &&
            pinchStartDistance !== null
        ) {
            const distance = touchDistance(first, second);
            if (Math.abs(distance - pinchStartDistance) > gestures.pinchDeltaMinPx) {
                reportInteraction('zoom');
                pinchStartDistance = distance;
            }
            return;
        }

        if (e.touches.length === 1 && first !== undefined && swipeOrigin !== null) {
            const distance = Math.hypot(
                first.clientX - swipeOrigin.x,
                first.clientY - swipeOrigin.y,
            );
            if (distance >= gestures.swipeMinDistancePx) {
                reportInteraction('swipe');
                swipeOrigin = {
                    x: first.clientX,
                    y: first.clientY,
                };
                tapCandidate = null;
            }
        }
    }, passiveOptions);

    document.addEventListener('touchend', (e: TouchEvent) => {
        const candidate = tapCandidate;
        tapCandidate = null;

        if (e.touches.length === 0) {
            swipeOrigin = null;
            pinchStartDistance = null;
        }

        if (!initialized || !e.isTrusted || gestures === null || candidate === null) return;

        const touch = e.changedTouches[0];
        if (touch === undefined) return;

        const dx = Math.abs(touch.clientX - candidate.x);
        const dy = Math.abs(touch.clientY - candidate.y);
        const durationMs = Date.now() - candidate.startedAt;

        if (
            dx < gestures.tapMaxOffsetPx &&
            dy < gestures.tapMaxOffsetPx &&
            durationMs < gestures.tapMaxDurationMs
        ) {
            reportInteraction('tap');
        }
    }, passiveOptions);

    document.addEventListener('touchcancel', resetTouchState, passiveOptions);

    // Слушаем команды от хоста
    window.addEventListener('message', (event: MessageEvent) => {
        // В sandbox без allow-same-origin event.origin === 'null'.
        // Единственная надёжная проверка — event.source === window.parent
        if (event.source !== window.parent) return;
        if (!isHostMessage(event.data)) return;

        const msg = event.data;

        if (msg.type === 'cpmind:init') {
            clickUrl = msg.clickUrl;
            gestures = parseGestures(msg.gestures);
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