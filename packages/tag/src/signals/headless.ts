const FP_COMPONENTS_MAX_LENGTH = 256;

function truncate(value: string): string {
  return value.length > FP_COMPONENTS_MAX_LENGTH
    ? value.slice(0, FP_COMPONENTS_MAX_LENGTH)
    : value;
}

async function collectCanvas(): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 50;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText('CPMind fp', 2, 15);
  ctx.fillStyle = 'rgba(102,204,0,0.7)';
  ctx.fillText('CPMind fp', 4, 17);

  return canvas.toDataURL();
}

function collectComponents(): Promise<string[]> {
  return Promise.all([
    collectCanvas(),
    Promise.resolve(truncate(navigator.userAgent)),
    Promise.resolve(`${screen.width}x${screen.height}x${screen.colorDepth}`),
    Promise.resolve(String(new Date().getTimezoneOffset())),
    Promise.resolve(truncate(navigator.language ?? '')),
  ]);
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Вычисляет необратимый отпечаток устройства для детекции частотных аномалий (SIVT).
 * Компоненты: canvas fingerprint, UserAgent, разрешение экрана, часовой пояс, язык.
 * Возвращает первые 32 hex-символа SHA-256 (16 байт / 128 бит).
 * При любой ошибке или блокировке браузером возвращает null — показ не отбрасывается.
 */
export async function collectFpHash(): Promise<string | null> {
  try {
    const components = await collectComponents();
    const raw = components.join('|');
    const hex = await sha256Hex(raw);
    return hex.slice(0, 32);
  } catch {
    return null;
  }
}