import { STICKY_MIN_CYCLE_MS } from '../player-config.js';
import type { PlayerTerminalOutcome } from '@cpmind/shared';

export type StickyState =
    | 'mounting'
    | 'loading'
    | 'ready'
    | 'playing'
    | 'paused_by_visibility'
    | 'closed';

export interface StickyAutoplayResult {
    outcome: 'started' | 'blocked' | 'error';
    finallyMuted: boolean;
}

export interface StickyLifecycleCallbacks {
    onLoad(): Promise<void>;
    onRequestPlay(): Promise<StickyAutoplayResult>;
    onPause(): void;
    onReleaseSession(): void;

    // Переход к следующему ролику набора перед новым циклом
    onAdvance(): Promise<void>;
}

export interface StickyLifecycle {
    notifyFinished(outcome: PlayerTerminalOutcome): void;
    destroy(): void;
}

// Закреплённая поверхность видна с момента монтирования и не зависит от прокрутки:
// наблюдатели пересечения не нужны, загрузка начинается сразу. Ролик зациклен —
// каждый цикл создаёт новую сессию измерения внутри той же рекламной сессии
export function createStickyLifecycle(
    autoplay: boolean,
    callbacks: StickyLifecycleCallbacks,
): StickyLifecycle {
    let state: StickyState = 'mounting';
    let loading = false;
    let cycleStartedAt = 0;
    let visibilityHandler: (() => void) | null = null;

    function isTerminal(): boolean {
        return state === 'closed';
    }

    function isVisibleToViewer(): boolean {
        return document.visibilityState === 'visible';
    }

    function releaseVisibilityHandler(): void {
        if (visibilityHandler === null) return;
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
    }

    async function requestPlay(): Promise<void> {
        if (isTerminal()) return;
        if (!isVisibleToViewer()) return;

        const result = await callbacks.onRequestPlay();

        if (isTerminal()) return;
        if (result.outcome === 'started') state = 'playing';
    }

    async function startCycle(): Promise<void> {
        if (loading || isTerminal()) return;

        loading = true;
        state = 'loading';
        cycleStartedAt = Date.now();

        try {
            await callbacks.onLoad();
        } catch {
            loading = false;
            return;
        }

        loading = false;

        if (isTerminal()) return;

        state = 'ready';

        // Без автозапуска ролик ждёт действия зрителя: плеер показывает первый кадр
        // и кнопку воспроизведения
        if (!autoplay) return;

        await requestPlay();
    }

    function onVisibilityChange(): void {
        if (isTerminal()) return;

        if (!isVisibleToViewer()) {
            if (state !== 'playing') return;
            state = 'paused_by_visibility';
            callbacks.onPause();
            return;
        }

        if (state !== 'paused_by_visibility') return;
        void requestPlay();
    }

    visibilityHandler = onVisibilityChange;
    document.addEventListener('visibilitychange', visibilityHandler);

    void startCycle();

    return {
        notifyFinished(outcome: PlayerTerminalOutcome): void {
            if (isTerminal()) return;

            if (outcome.type !== 'completed') {
                state = 'closed';
                releaseVisibilityHandler();
                callbacks.onReleaseSession();
                return;
            }

            // Мгновенно завершившийся цикл означает ролик нулевой длительности
            // либо отказ media: зацикливание превратилось бы в поток запросов VAST
            if (Date.now() - cycleStartedAt < STICKY_MIN_CYCLE_MS) {
                state = 'closed';
                releaseVisibilityHandler();
                callbacks.onReleaseSession();
                return;
            }

            callbacks.onReleaseSession();

            // Ролик следующего цикла выбирает сервер: VAST с прежним sid вернул бы
            // версию, зафиксированную в сессии, и набор не сменился бы
            void callbacks.onAdvance().then(() => startCycle());
        },

        destroy(): void {
            state = 'closed';
            releaseVisibilityHandler();
        },
    };
}