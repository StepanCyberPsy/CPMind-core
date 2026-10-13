const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_AD_SESSION_TTL_HOURS = 24;
const MAX_AD_SESSION_TTL_HOURS = 168;

export function requireEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

// Object Storage
export function getSignerKeyId(): string {
    return requireEnv('BUCKET_SIGNER_KEY_ID');
}

export function getSignerSecret(): string {
    return requireEnv('BUCKET_SIGNER_SECRET');
}

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

export function getDeliveryBaseUrl(): string {
    return requireEnv('DELIVERY_BASE_URL');
}

export function getCreativeBaseUrl(): string {
    return requireEnv('CREATIVE_BASE_URL');
}

export function getCollectEndpoint(): string {
    return requireEnv('COLLECT_ENDPOINT');
}

export function getLoaderRuntimeVersion(): string {
    return process.env['LOADER_RUNTIME_VERSION'] ?? '1';
}

export function getDisplayRuntimeVersion(): string {
    return process.env['DISPLAY_RUNTIME_VERSION'] ?? '1';
}

export function getPlayerRuntimeVersion(): string {
    return process.env['PLAYER_RUNTIME_VERSION'] ?? '1';
}

export function getAdSessionTtlMs(): number {
    const raw = process.env['AD_SESSION_TTL_HOURS'];
    if (!raw) return DEFAULT_AD_SESSION_TTL_HOURS * HOUR_MS;
    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 1 || value > MAX_AD_SESSION_TTL_HOURS) {
        return DEFAULT_AD_SESSION_TTL_HOURS * HOUR_MS;
    }
    return value * HOUR_MS;
}

export function getDbPoolMax(): number {
    const raw = process.env['BACKEND_DB_POOL_MAX'];
    if (!raw) return 20;
    const value = parseInt(raw, 10);
    return Number.isNaN(value) ? 20 : value;
}

export function getDbIdleTimeoutMs(): number {
    const raw = process.env['BACKEND_DB_IDLE_TIMEOUT_MS'];
    if (!raw) return 30_000;
    const value = parseInt(raw, 10);
    return Number.isNaN(value) ? 30_000 : value;
}

export function getDbConnectionTimeoutMs(): number {
    const raw = process.env['BACKEND_DB_CONNECTION_TIMEOUT_MS'];
    if (!raw) return 2_000;
    const value = parseInt(raw, 10);
    return Number.isNaN(value) ? 2_000 : value;
}