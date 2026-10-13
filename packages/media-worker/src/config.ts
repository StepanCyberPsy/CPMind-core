export function readBoundedInt(
    name: string,
    fallback: number,
    min: number,
    max: number,
): number {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

// Database
export function getDatabaseUrl(): string {
    return requireEnv('DATABASE_URL');
}

export function getDbPoolMax(): number {
    return readBoundedInt('WORKER_DB_POOL_MAX', 5, 1, 50);
}

export function getDbIdleTimeoutMs(): number {
    return readBoundedInt('WORKER_DB_IDLE_TIMEOUT_MS', 30_000, 1_000, 300_000);
}

export function getDbConnectionTimeoutMs(): number {
    return readBoundedInt('WORKER_DB_CONNECTION_TIMEOUT_MS', 5_000, 500, 60_000);
}

// Object Storage — worker credentials
export function getWorkerKeyId(): string {
    return requireEnv('BUCKET_WORKER_KEY_ID');
}

export function getWorkerSecret(): string {
    return requireEnv('BUCKET_WORKER_SECRET');
}

// Buckets
export function getStagingBucket(): string {
    return requireEnv('STAGING_BUCKET');
}

export function getSourceBucket(): string {
    return requireEnv('SOURCE_BUCKET');
}

export function getDeliveryBucket(): string {
    return requireEnv('DELIVERY_BUCKET');
}

export function getCdnBaseUrl(): string {
    return requireEnv('CDN_BASE_URL');
}

// Версия creative-bridge — должна совпадать с BRIDGE_VERSION, с которой собран
// артефакт в runtime-publisher: значение участвует и в CDN-URL инжектируемого
// скрипта, и в handshake cpmind:ready внутри iframe
export function getBridgeVersion(): string {
    return process.env['BRIDGE_VERSION'] ?? '1';
}

// Worker runtime
export function getWorkerConcurrency(): number {
    return readBoundedInt('WORKER_CONCURRENCY', 1, 1, 32);
}

export function getWorkerLeaseMs(): number {
    return readBoundedInt('WORKER_LEASE_MS', 900_000, 30_000, 3_600_000);
}

export function getWorkerHeartbeatMs(): number {
    return readBoundedInt('WORKER_HEARTBEAT_MS', 30_000, 1_000, 1_800_000);
}

export function getWorkerPollIntervalMs(): number {
    return readBoundedInt('WORKER_POLL_INTERVAL_MS', 5_000, 100, 60_000);
}

export function getWorkerTempDir(): string {
    return process.env['WORKER_TEMP_DIR'] ?? '/tmp/cpmind-worker';
}