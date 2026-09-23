import type { MeasurementFinalizationReason } from '@cpmind/shared';
import type { Session, SdkSignalConfig } from '../types.js';
import type { SessionPayloadMeta } from '../session.js';
import type { PresenceHandle } from '../signals/presence.js';
import type {
    FrameInteractionKind,
    FrameInteractionTrust,
} from '../signals/frame_trust.js';
import { initS1, disposeS1 } from '../signals/s1.js';
import { initS2, disposeS2 } from '../signals/s2.js';
import { initS3, disposeS3 } from '../signals/s3.js';
import { initS4, disposeS4 } from '../signals/s4.js';
import {
    initS5,
    disposeS5,
    recordFrameInteraction,
} from '../signals/s5.js';
import { initS7, disposeS7 } from '../signals/s7.js';
import { initPresence } from '../signals/presence.js';
import { collectFpHash } from '../signals/headless.js';
import { finalizeAndSend, attachUnloadHandlers } from '../transport/send.js';
import { startNewSegment } from '../segment.js';
import { DebugOverlay } from '../debug/overlay.js';

export class MeasurementSurface {
    private presenceHandle: PresenceHandle | null = null;
    private debugOverlay: DebugOverlay | null = null;
    private detachUnloadHandlers: (() => void) | null = null;
    private initialized = false;
    private signalsDisposed = false;

    constructor(
        private readonly creativeEl: HTMLElement,
        readonly session: Session,
        private readonly config: SdkSignalConfig,
        private readonly meta: SessionPayloadMeta,
        private readonly resetVideoSegment: (() => void) | null = null,
    ) { }

    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        initS1(this.creativeEl, this.session, this.config);
        initS2(this.creativeEl, this.session, this.config);
        initS3(this.creativeEl, this.session, this.config);
        initS4(this.session, this.config);
        initS5(this.creativeEl, this.session, this.config);
        initS7(this.creativeEl, this.session, this.config);

        this.presenceHandle = initPresence(
            this.session,
            this.config,
            () => this.handlePresenceIdle(),
        );

        void collectFpHash().then((hash) => {
            this.session.fpHash = hash;
        });

        if (this.config.debug) {
            this.debugOverlay = new DebugOverlay(this.creativeEl, this.session);
        }

        this.detachUnloadHandlers = attachUnloadHandlers(
            this.creativeEl,
            this.session,
            this.meta,
            this.config,
            this.presenceHandle.cleanup,
        );
    }

    // Подтверждённое взаимодействие продлевает присутствие зрителя и учитывается в S5,
    // отклонённое — только в диагностическом счётчике
    reportFrameInteraction(
        kind: FrameInteractionKind,
        trust: FrameInteractionTrust,
    ): void {
        if (this.signalsDisposed) return;

        if (trust === 'rejected') {
            this.session.unconfirmedFrameEvents++;
            return;
        }

        this.presenceHandle?.reportActivity();

        if (kind !== 'activity') {
            recordFrameInteraction(this.session, kind);
        }
    }

    private handlePresenceIdle(): void {
        if (this.presenceHandle === null) return;
        startNewSegment(
            this.creativeEl,
            this.session,
            this.config,
            this.meta,
            this.presenceHandle,
            this.resetVideoSegment,
        );
    }

    // Освобождает наблюдатели, таймеры и обработчики сигналов: после финальной отправки
    // накопление бесполезно, а цикл роликов создаёт новую поверхность на каждый показ
    private disposeSignals(): void {
        if (this.signalsDisposed) return;
        this.signalsDisposed = true;

        this.presenceHandle?.cleanup();
        this.detachUnloadHandlers?.();
        this.detachUnloadHandlers = null;

        disposeS1(this.creativeEl);
        disposeS2(this.session);
        disposeS3(this.creativeEl);
        disposeS4(this.session);
        disposeS5(this.creativeEl);
        disposeS7(this.session);
    }

    finalize(reason: MeasurementFinalizationReason | null = null): void {
        finalizeAndSend(this.session, this.meta, this.config, {
            kind: 'final',
            finalizationReason: reason,
        });
        this.disposeSignals();
    }

    destroy(): void {
        this.disposeSignals();
        this.debugOverlay?.destroy();
        this.debugOverlay = null;
    }
}