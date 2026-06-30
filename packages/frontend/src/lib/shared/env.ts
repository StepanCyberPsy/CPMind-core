// Только для server-only переменных без NEXT_PUBLIC_ префикса
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Server-only. Внутренний адрес backend для Server Components (Docker-сеть в prod, localhost в dev)
export function getBackendUrl(): string {
  return requireEnv('BACKEND_URL');
}

export function getPublicBackendUrl(): string {
  const value = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (value === undefined) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_BACKEND_URL');
  }
  return value;
}