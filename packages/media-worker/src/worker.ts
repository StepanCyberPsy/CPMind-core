import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { getDb } from './db/index.js';
import { readBoundedInt } from './config.js';
import {
    claimProcessingJob,
    recoverExpiredProcessingJobs,
    renewProcessingJobLease,
    scheduleProcessingJobRetry,
    type ProcessingJobRow,
} from './db/queries.js';
import {
    finalizeTerminalProcessingFailure,
    formatProcessingError,
    isPermanentProcessingError,
    processJob,
} from './jobs.js';
import { createLogger } from './logger.js';
import { createTempDir, cleanupTempDir } from './utils/temp.js';

const logger = createLogger('worker');

const POLL_INTERVAL_MS = readBoundedInt('WORKER_POLL_INTERVAL_MS', 5_000, 100, 60_000);
const WORKER_CONCURRENCY = readBoundedInt('WORKER_CONCURRENCY', 1, 1, 32);
const LEASE_MS = readBoundedInt('WORKER_LEASE_MS', 900_000, 30_000, 3_600_000);
const HEARTBEAT_MS = readBoundedInt('WORKER_HEARTBEAT_MS', 30_000, 1_000, 1_800_000);

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 60_000;

const RECOVERY_INTERVAL_MS = Math.max(
    30_000,
    Math.min(
        Math.floor(LEASE_MS / 2),
        HEARTBEAT_MS * 2,
    ),
);

if (HEARTBEAT_MS >= LEASE_MS) {
    throw new Error('WORKER_HEARTBEAT_MS must be less than WORKER_LEASE_MS');
}

function calculateRetryBackoffMs(
    attempts: number,
): number {
    const exponent = Math.max(0, attempts - 1);
    const base = Math.min(
        RETRY_BASE_MS * 2 ** exponent,
        RETRY_MAX_MS,
    );

    const jitter = Math.floor(
        Math.random() * Math.max(1, base * 0.2),
    );

    return Math.min(base + jitter, RETRY_MAX_MS);
}

async function wait(
    durationMs: number,
    signal: AbortSignal,
): Promise<void> {
    if (signal.aborted) return;

    await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, durationMs);

        const onAbort = (): void => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            resolve();
        };

        signal.addEventListener('abort', onAbort, {
            once: true,
        });
    });
}

async function runLeaseHeartbeat(
    job: ProcessingJobRow,
    workerId: string,
    signal: AbortSignal,
    onLeaseLost: () => void,
): Promise<void> {
    const db = getDb();
    let lastSuccessfulRenewalAt = Date.now();

    while (!signal.aborted) {
        await wait(HEARTBEAT_MS, signal);

        if (signal.aborted) return;

        try {
            const renewed = await renewProcessingJobLease(
                db,
                job.id,
                workerId,
                LEASE_MS,
            );

            if (!renewed) {
                logger.warn(
                    {
                        jobId: job.id,
                        workerId,
                    },
                    'Processing job lease lost',
                );

                onLeaseLost();
                return;
            }

            lastSuccessfulRenewalAt = Date.now();
        } catch (err) {
            logger.warn(
                {
                    err,
                    jobId: job.id,
                    workerId,
                },
                'Processing job heartbeat failed',
            );

            if (
                Date.now() - lastSuccessfulRenewalAt >=
                LEASE_MS - HEARTBEAT_MS
            ) {
                logger.error(
                    {
                        jobId: job.id,
                        workerId,
                    },
                    'Processing job lease can no longer be guaranteed',
                );

                onLeaseLost();
                return;
            }
        }
    }
}

async function handleProcessingFailure(
    job: ProcessingJobRow,
    workerId: string,
    err: unknown,
    shuttingDown: boolean,
): Promise<void> {
    const db = getDb();
    const error = formatProcessingError(err);

    if (shuttingDown && job.attempts < job.maxAttempts) {
        await scheduleProcessingJobRetry(
            db,
            job.id,
            workerId,
            'WORKER_SHUTDOWN',
            0,
        );

        logger.info(
            {
                jobId: job.id,
                workerId,
            },
            'Processing job released during shutdown',
        );

        return;
    }

    if (
        isPermanentProcessingError(err) ||
        job.attempts >= job.maxAttempts
    ) {
        await finalizeTerminalProcessingFailure(
            job,
            workerId,
            error,
        );

        logger.error(
            {
                jobId: job.id,
                workerId,
                attempts: job.attempts,
                error,
            },
            'Processing job permanently failed',
        );

        return;
    }

    const backoffMs = calculateRetryBackoffMs(
        job.attempts,
    );

    await scheduleProcessingJobRetry(
        db,
        job.id,
        workerId,
        error,
        backoffMs,
    );

    logger.warn(
        {
            jobId: job.id,
            workerId,
            attempts: job.attempts,
            backoffMs,
            error,
        },
        'Processing job scheduled for retry',
    );
}

async function runOnce(
    slotId: number,
    signal: AbortSignal,
): Promise<boolean> {
    signal.throwIfAborted();

    const db = getDb();
    const workerId = [
        os.hostname(),
        process.pid,
        slotId,
        randomUUID(),
    ].join(':');

    const job = await claimProcessingJob(
        db,
        workerId,
        LEASE_MS,
    );

    if (!job) {
        return false;
    }

    const tempDir = await createTempDir(job.id);
    const processingController = new AbortController();

    let leaseLost = false;

    const abortFromParent = (): void => {
        if (!processingController.signal.aborted) {
            processingController.abort(
                signal.reason ??
                new Error('Worker shutdown requested'),
            );
        }
    };

    if (signal.aborted) {
        abortFromParent();
    } else {
        signal.addEventListener(
            'abort',
            abortFromParent,
            { once: true },
        );
    }

    const heartbeatPromise = runLeaseHeartbeat(
        job,
        workerId,
        processingController.signal,
        () => {
            leaseLost = true;

            if (!processingController.signal.aborted) {
                processingController.abort(
                    new Error('PROCESSING_LEASE_LOST'),
                );
            }
        },
    );

    logger.info(
        {
            jobId: job.id,
            workerId,
            uploadSessionId: job.uploadSessionId,
            creativeVersionId: job.creativeVersionId,
            processingProfileVersion:
                job.processingProfileVersion,
            attempt: job.attempts,
            maxAttempts: job.maxAttempts,
        },
        'Processing job claimed',
    );

    try {
        await processJob(
            job,
            workerId,
            tempDir,
            processingController.signal,
        );

        logger.info(
            {
                jobId: job.id,
                workerId,
            },
            'Processing job completed',
        );
    } catch (err) {
        if (leaseLost) {
            logger.warn(
                {
                    err,
                    jobId: job.id,
                    workerId,
                },
                'Processing stopped after lease loss',
            );

            return true;
        }

        try {
            await handleProcessingFailure(
                job,
                workerId,
                err,
                signal.aborted,
            );
        } catch (stateErr) {
            logger.error(
                {
                    err: stateErr,
                    processingError: err,
                    jobId: job.id,
                    workerId,
                },
                'Failed to persist processing failure state',
            );

            throw stateErr;
        }
    } finally {
        if (!processingController.signal.aborted) {
            processingController.abort();
        }

        await heartbeatPromise;

        signal.removeEventListener(
            'abort',
            abortFromParent,
        );

        try {
            await cleanupTempDir(tempDir);
        } catch (err) {
            logger.warn(
                {
                    err,
                    jobId: job.id,
                },
                'Temporary directory cleanup failed',
            );
        }
    }

    return true;
}

async function runWorkerSlot(
    slotId: number,
    signal: AbortSignal,
): Promise<void> {
    while (!signal.aborted) {
        try {
            const didWork = await runOnce(
                slotId,
                signal,
            );

            if (!didWork) {
                await wait(
                    POLL_INTERVAL_MS,
                    signal,
                );
            }
        } catch (err) {
            if (signal.aborted) {
                return;
            }

            logger.error(
                {
                    err,
                    slotId,
                },
                'Worker slot error',
            );

            await wait(
                POLL_INTERVAL_MS,
                signal,
            );
        }
    }
}

async function runRecoveryLoop(
    signal: AbortSignal,
): Promise<void> {
    const db = getDb();

    while (!signal.aborted) {
        try {
            const result =
                await recoverExpiredProcessingJobs(db);

            if (
                result.requeued > 0 ||
                result.failed > 0
            ) {
                logger.warn(
                    result,
                    'Expired processing jobs recovered',
                );
            }
        } catch (err) {
            if (!signal.aborted) {
                logger.error(
                    { err },
                    'Processing job recovery failed',
                );
            }
        }

        await wait(
            RECOVERY_INTERVAL_MS,
            signal,
        );
    }
}

export async function runWorkerLoop(
    signal?: AbortSignal,
): Promise<void> {
    const fallbackController = new AbortController();
    const workerSignal =
        signal ?? fallbackController.signal;

    logger.info(
        {
            concurrency: WORKER_CONCURRENCY,
            pollIntervalMs: POLL_INTERVAL_MS,
            leaseMs: LEASE_MS,
            heartbeatMs: HEARTBEAT_MS,
            recoveryIntervalMs: RECOVERY_INTERVAL_MS,
        },
        'Media worker started',
    );

    const slots = Array.from(
        { length: WORKER_CONCURRENCY },
        (_, slotId) => runWorkerSlot(
            slotId,
            workerSignal,
        ),
    );

    await Promise.all([
        ...slots,
        runRecoveryLoop(workerSignal),
    ]);

    logger.info('Media worker stopped');
}