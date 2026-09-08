'use client';

import { useEffect, useRef, useState } from 'react';
import { getUploadSessionStatus } from '@/lib/admin/api';
import { CreativeStatusBadge } from './CreativeStatusBadge';
import type { UploadSessionStatus } from '@cpmind/shared';
import styles from '@/styles/processing-poller.module.css';

const POLL_INITIAL_MS = 1_000;
const POLL_MAX_MS = 10_000;

const TERMINAL_STATUSES = new Set<string>(['ready', 'failed', 'expired']);

interface PollerResult {
    creativeUuid: string;
    creativeVersionUuid: string;
}

interface Props {
    uploadId: string;
    onReady: (result: PollerResult) => void;
    onFailed: (processingError: string | null) => void;
}

export function ProcessingPoller({ uploadId, onReady, onFailed }: Props): React.ReactElement {
    const [status, setStatus] = useState<UploadSessionStatus | null>(null);
    const [pollError, setPollError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const delayRef = useRef<number>(POLL_INITIAL_MS);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        delayRef.current = POLL_INITIAL_MS;

        async function poll(): Promise<void> {
            try {
                const result = await getUploadSessionStatus(uploadId);

                if (!mountedRef.current) return;

                setStatus(result);
                setPollError(null);

                if (
                    result.status === 'ready' &&
                    result.creativeUuid !== null &&
                    result.creativeVersionUuid !== null
                ) {
                    onReady({
                        creativeUuid: result.creativeUuid,
                        creativeVersionUuid: result.creativeVersionUuid,
                    });
                    return;
                }

                if (result.status === 'failed') {
                    onFailed(result.processingError);
                    return;
                }

                if (result.status === 'expired') {
                    onFailed('Сессия загрузки истекла');
                    return;
                }

                if (!TERMINAL_STATUSES.has(result.status)) {
                    const delay = delayRef.current;
                    delayRef.current = Math.min(delay * 2, POLL_MAX_MS);
                    timerRef.current = setTimeout(() => { void poll(); }, delay);
                }
            } catch (err) {
                if (!mountedRef.current) return;
                setPollError(err instanceof Error ? err.message : 'Ошибка получения статуса');
                const delay = delayRef.current;
                delayRef.current = Math.min(delay * 2, POLL_MAX_MS);
                timerRef.current = setTimeout(() => { void poll(); }, delay);
            }
        }

        void poll();

        return () => {
            mountedRef.current = false;
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, [uploadId, onReady, onFailed]);

    const displayStatus = status?.status ?? 'processing';
    const isTerminal = status !== null && TERMINAL_STATUSES.has(status.status);

    return (
        <div className={styles.root}>
            <div className={styles.row}>
                {!isTerminal && <span className={styles.spinner} aria-hidden="true" />}
                <span className={styles.label}>
                    {isTerminal ? 'Обработка завершена' : 'Обработка файла…'}
                </span>
                <CreativeStatusBadge status={displayStatus} />
            </div>
            {status?.processingError !== null && status?.processingError !== undefined && (
                <div className={styles.error}>{status.processingError}</div>
            )}
            {pollError !== null && (
                <div className={styles.error}>Ошибка соединения: {pollError}</div>
            )}
        </div>
    );
}