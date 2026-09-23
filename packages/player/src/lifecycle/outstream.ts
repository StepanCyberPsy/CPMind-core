import { observeEligibility, observePlayback } from './viewport.js';
import type { ViewportObservers } from './viewport.js';
import {
    OUTSTREAM_ASPECT_RATIO,
    OUTSTREAM_MIN_HEIGHT_PX,
    STICKY_MIN_CYCLE_MS as MIN_CYCLE_MS,
} from '../player-config.js';

export type OutstreamState =
    | 'mounting'
    | 'loading'
    | 'eligible'
    | 'playing'
    | 'paused_by_scroll'
    | 'completed'
    | 'closed';

export interface OutstreamAutoplayResult {
    outcome: 'started' | 'blocked' | 'error';
    finallyMuted: boolean;
}

export interface OutstreamLifecycleCallbacks {
    onLoad(): Promise<void>;
    onRequestPlay(): Promise<OutstreamAutoplayResult>;
    onPlaybackStarted(finallyMuted: boolean): void;
    onAutoplayBlocked(): void;
    onScrollPause(): void;
    onScrollResume(): void;
    onClose(): void;

    // Переход к следующему ролику набора перед новым циклом
    onAdvance(): Promise<void>;

    // Сессия предыдущего цикла освобождается до создания следующей
    onReleaseSession(): void;
}

export interface OutstreamLifecycle {
    notifyStartedByViewer(): void;
    notifyCompleted(): void;
    notifyClosed(): void;
    destroy(): void;
}

export interface OutstreamSurfaceSize {
    width: number | null;
    height: number | null;
}

// Резервирует высоту контейнера до начала наблюдения. Элемент нулевой высоты
// не пересекает viewport при threshold 0 и не достигает PLAYBACK_THRESHOLD —
// без резервирования eligibility не срабатывает и сессия не создаётся никогда.
// Высота ставится один раз при монтировании: содержимое ещё не загружено,
// поэтому определить её из медиа невозможно
function reserveSurfaceHeight(
    surface: HTMLElement,
    size: OutstreamSurfaceSize,
): void {
    if (size.width !== null) {
        surface.style.width = `${size.width}px`;
    }

    if (size.height !== null) {
        surface.style.height = `${size.height}px`;
        return;
    }

    const measuredWidth = surface.getBoundingClientRect().width;
    const baseWidth = measuredWidth > 0
        ? measuredWidth
        : (size.width ?? 0);

    const derivedHeight = baseWidth > 0
        ? Math.round(baseWidth / OUTSTREAM_ASPECT_RATIO)
        : 0;

    surface.style.height = `${Math.max(derivedHeight, OUTSTREAM_MIN_HEIGHT_PX)}px`;
}

export function createOutstreamLifecycle(
    surface: HTMLElement,
    callbacks: OutstreamLifecycleCallbacks,
    size: OutstreamSurfaceSize,
    autoplay: boolean,
): OutstreamLifecycle {
    let state: OutstreamState = 'mounting';
    let eligibilityObs: ViewportObservers | null = null;
    let playbackObs: ViewportObservers | null = null;
    let loadingInProgress = false;
    let isInViewport = false;
    let startedByViewer = false;
    let cycleStartedAt = 0;
    let visibilityHandler: (() => void) | null = null;

    function isTerminal(): boolean {
        return state === 'completed' || state === 'closed';
    }

    // Зритель видит рекламу, когда она в области просмотра и вкладка активна.
    // IntersectionObserver переключение вкладки не отслеживает: без этой проверки
    // S6 копил бы досмотр и время со звуком в скрытой вкладке, противореча S4
    function isVisibleToViewer(): boolean {
        return isInViewport && document.visibilityState === 'visible';
    }

    async function startLoad(): Promise<void> {
        if (loadingInProgress || isTerminal()) return;
        loadingInProgress = true;
        state = 'loading';
        cycleStartedAt = Date.now();

        try {
            await callbacks.onLoad();
        } catch {
            loadingInProgress = false;
            return;
        }

        if (isTerminal()) {
            loadingInProgress = false;
            return;
        }

        state = 'eligible';
        loadingInProgress = false;

        if (playbackObs === null) {
            playbackObs = observePlayback(surface, onViewportEnter, onViewportExit);
        }

        // Наблюдатель уже сообщил о видимости в предыдущем цикле: повторного
        // события пересечения не будет, запуск выполняется сразу
        if (isInViewport) void resumePlayback();
    }

    // Набор проигрывается по кругу: завершение ролика начинает следующий цикл
    // с очередным роликом. Мгновенно завершившийся цикл означает ролик нулевой
    // длительности либо отказ media — зацикливание превратилось бы в поток запросов
    async function startNextCycle(): Promise<void> {
        if (isTerminal()) return;

        if (Date.now() - cycleStartedAt < MIN_CYCLE_MS) {
            state = 'completed';
            releaseObservers();
            return;
        }

        callbacks.onReleaseSession();
        await callbacks.onAdvance();

        if (isTerminal()) return;

        state = 'mounting';
        await startLoad();
    }

    async function resumePlayback(): Promise<void> {
        if (isTerminal()) return;
        if (state === 'playing') return;
        if (!isVisibleToViewer()) return;

        if (state === 'paused_by_scroll') {
            const result = await callbacks.onRequestPlay();
            if (!isTerminal() && result.outcome === 'started') {
                state = 'playing';
                callbacks.onScrollResume();
            }
            return;
        }

        if (state !== 'eligible') return;

        // Без автозапуска первый запуск выполняет зритель: плеер показывает
        // первый кадр и кнопку воспроизведения. Возврат в область просмотра
        // после запуска возобновляет показ на общих основаниях
        if (!autoplay && !startedByViewer) return;

        const result = await callbacks.onRequestPlay();

        if (isTerminal()) return;

        if (result.outcome === 'started') {
            state = 'playing';
            callbacks.onPlaybackStarted(result.finallyMuted);
        } else {
            callbacks.onAutoplayBlocked();
        }
    }

    function pausePlayback(): void {
        if (isTerminal()) return;
        if (state !== 'playing') return;

        state = 'paused_by_scroll';
        callbacks.onScrollPause();
    }

    async function onViewportEnter(): Promise<void> {
        isInViewport = true;
        await resumePlayback();
    }

    function onViewportExit(): void {
        isInViewport = false;
        pausePlayback();
    }

    // Возврат во вкладку возобновляет показ только при выполнении обоих условий:
    // реклама в области просмотра и вкладка активна
    function onVisibilityChange(): void {
        if (document.visibilityState === 'visible') {
            void resumePlayback();
            return;
        }

        pausePlayback();
    }

    state = 'mounting';
    reserveSurfaceHeight(surface, size);

    eligibilityObs = observeEligibility(surface, () => {
        void startLoad();
    });

    visibilityHandler = onVisibilityChange;
    document.addEventListener('visibilitychange', visibilityHandler);

    function releaseObservers(): void {
        eligibilityObs?.disconnect();
        eligibilityObs = null;
        playbackObs?.disconnect();
        playbackObs = null;

        if (visibilityHandler !== null) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            visibilityHandler = null;
        }
    }

    return {
        // Зритель запустил ролик сам: дальше жизненный цикл ведёт показ
        // по видимости так же, как при автозапуске
        notifyStartedByViewer(): void {
            if (isTerminal()) return;
            startedByViewer = true;
            state = 'playing';
        },

        notifyCompleted(): void {
            if (isTerminal()) return;
            void startNextCycle();
        },

        notifyClosed(): void {
            if (isTerminal()) return;
            state = 'closed';
            releaseObservers();
            callbacks.onClose();
        },

        destroy(): void {
            releaseObservers();
        },
    };
}