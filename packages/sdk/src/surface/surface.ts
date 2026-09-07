import type { Session, SdkSignalConfig } from '../types.js';
import type { SessionPayloadMeta } from '../session.js';
import type { PresenceHandle } from '../signals/presence.js';
import { initS1 } from '../signals/s1.js';
import { initS2 } from '../signals/s2.js';
import { initS3 } from '../signals/s3.js';
import { initS4 } from '../signals/s4.js';
import { initS5 } from '../signals/s5.js';
import { initS7 } from '../signals/s7.js';
import { initPresence } from '../signals/presence.js';
import { collectFpHash } from '../signals/headless.js';
import { finalizeAndSend, attachUnloadHandlers } from '../transport/send.js';
import { startNewSegment } from '../segment.js';
import { DebugOverlay } from '../debug/overlay.js';

export class MeasurementSurface {
    private presenceHandle: PresenceHandle | null = null;
    private debugOverlay: DebugOverlay | null = null;
    private initialized = false;

    constructor(
        private readonly creativeEl: HTMLElement,
        readonly session: Session,
        private readonly config: SdkSignalConfig,
        private readonly meta: SessionPayloadMeta,
    ) {}

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

        attachUnloadHandlers(
            this.creativeEl,
            this.session,
            this.meta,
            this.config,
            this.presenceHandle.cleanup,
        );
    }

    private handlePresenceIdle(): void {
        if (this.presenceHandle === null) return;
        startNewSegment(
            this.creativeEl,
            this.session,
            this.config,
            this.meta,
            this.presenceHandle,
        );
    }

    finalize(): void {
        finalizeAndSend(this.session, this.meta, this.config, true);
        this.presenceHandle?.cleanup();
    }

    destroy(): void {
        this.debugOverlay?.destroy();
        this.debugOverlay = null;
    }
}