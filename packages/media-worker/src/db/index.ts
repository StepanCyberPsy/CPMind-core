import { Pool, type PoolClient } from 'pg';
import {
    getDatabaseUrl,
    getDbPoolMax,
    getDbIdleTimeoutMs,
    getDbConnectionTimeoutMs,
} from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('db');

let pool: Pool | null = null;

export type Db = Pool;
export type DbClient = PoolClient;
export type DbExecutor = Pool | PoolClient;

export function getDb(): Db {
    if (!pool) {
        pool = new Pool({
            connectionString: getDatabaseUrl(),
            application_name: 'cpmind-media-worker',
            max: getDbPoolMax(),
            idleTimeoutMillis: getDbIdleTimeoutMs(),
            connectionTimeoutMillis: getDbConnectionTimeoutMs(),
        });

        pool.on('error', (err) => {
            logger.error({ err }, 'Unexpected PostgreSQL pool error');
        });
    }
    return pool;
}

export async function withTransaction<T>(
    callback: (client: DbClient) => Promise<T>,
): Promise<T> {
    const client = await getDb().connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            logger.error({ err: rollbackErr }, 'PostgreSQL rollback failed');
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function closeDb(): Promise<void> {
    if (!pool) return;
    const current = pool;
    pool = null;
    await current.end();
}