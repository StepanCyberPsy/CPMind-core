import type { CpmindOmidFullInput, CpmindOmidFullSession } from './types.js';

const COMPLETED_TTL_MS = 30 * 60 * 1000;
const MAX_COMPLETED_RUNS = 1024;
const passiveSession: CpmindOmidFullSession = Object.freeze({
    reportMediaEvent() {},
    finalize() {},
});

export function getOmidRunKey(input: Pick<CpmindOmidFullInput, 'params' | 'startedAt' | 'omidSessionId'>): string {
    const identity = typeof input.omidSessionId === 'string' && input.omidSessionId !== ''
        ? ['omid', input.omidSessionId]
        : ['start', input.startedAt];
    return JSON.stringify([input.params.sid, ...identity]);
}

function metadata(input: CpmindOmidFullInput): string {
    const p = input.params;
    return JSON.stringify([
        p.tag_uuid, p.campaign_id, p.creative_id, p.placement_uuid,
        p.creative_version_uuid, p.delivery_mode, p.collect_endpoint, p.tag_constants_version,
    ]);
}

interface ActiveRun {
    metadata: string;
    element: HTMLElement | null;
}

/** Владение только OMID-измерениями; обычные SDK-сессии сюда не попадают. */
export class FullSessionRegistry {
    private readonly active = new Map<string, ActiveRun>();
    private readonly completed = new Map<string, { metadata: string; at: number }>();

    private prune(): void {
        const now = Date.now();
        for (const [key, record] of this.completed) {
            if (now - record.at < COMPLETED_TTL_MS) break;
            this.completed.delete(key);
        }
        while (this.completed.size > MAX_COMPLETED_RUNS) {
            this.completed.delete(this.completed.keys().next().value!);
        }
    }

    hasRun(input: CpmindOmidFullInput): boolean {
        this.prune();
        const key = getOmidRunKey(input);
        const record = this.active.get(key) ?? this.completed.get(key);
        return record !== undefined && record.metadata === metadata(input);
    }

    start(
        input: CpmindOmidFullInput,
        element: HTMLElement | null,
        create: (onFinalized: () => void) => CpmindOmidFullSession | null,
    ): CpmindOmidFullSession | null {
        this.prune();
        const key = getOmidRunKey(input);
        const fingerprint = metadata(input);
        const previous = this.active.get(key);
        if (previous !== undefined) {
            return previous.metadata === fingerprint && previous.element === element ? passiveSession : null;
        }
        const completed = this.completed.get(key);
        if (completed !== undefined) return completed.metadata === fingerprint ? passiveSession : null;

        this.active.set(key, { metadata: fingerprint, element });
        let owner: CpmindOmidFullSession | null = null;
        let closed = false;
        const close = (): void => {
            if (closed) return;
            closed = true;
            owner = null;
            this.active.delete(key);
            this.completed.set(key, { metadata: fingerprint, at: Date.now() });
            this.prune();
        };
        try {
            const created = create(close);
            if (created === null) {
                closed = true;
                owner = null;
                this.active.delete(key);
                this.completed.delete(key);
                return null;
            }
            if (!closed) owner = created;
        } catch (error) {
            closed = true;
            owner = null;
            this.active.delete(key);
            this.completed.delete(key);
            throw error;
        }
        return {
            reportMediaEvent(event): void { owner?.reportMediaEvent(event); },
            finalize(): void {
                if (closed) return;
                try { owner?.finalize(); } finally { close(); }
            },
        };
    }
}

// Состояние принадлежит окну исполнения; версии изолируются отдельными фабриками.
const registries = new WeakMap<Window, FullSessionRegistry>();

export function getFullSessionRegistry(targetWindow: Window): FullSessionRegistry {
    let registry = registries.get(targetWindow);
    if (registry === undefined) {
        registry = new FullSessionRegistry();
        registries.set(targetWindow, registry);
    }
    return registry;
}
