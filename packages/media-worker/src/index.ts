import { closeDb } from './db/index.js';
import { createLogger } from './logger.js';
import { runWorkerLoop } from './worker.js';

const logger = createLogger('index');
const shutdownController = new AbortController();
let shuttingDown = false;

process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received, draining jobs');

    shutdownController.abort();

    try {
        await closeDb();
    } catch (err) {
        logger.error({ err }, 'DB pool close failed during shutdown');
    }

    process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

logger.info('Media worker starting');

runWorkerLoop(shutdownController.signal).then(() => {
    logger.info('Worker loop exited cleanly');
    void shutdown('LOOP_EXIT');
}).catch((err) => {
    logger.error({ err }, 'Worker loop fatal error');
    process.exit(1);
});