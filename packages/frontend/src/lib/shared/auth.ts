import type { UserRole } from '@cpmind/shared';

interface TokenPayload {
  uuid: string;
  id: number;
  role: UserRole;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  return atob(base64 + '='.repeat(padding));
}

// Извлекает role из payload JWT без проверки подписи — только для UX-роутинга
// Подпись и isActive проверяются backend на requireAuth при каждом запросе данных
function decodeTokenPayload(token: string): Partial<TokenPayload> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payloadJson = base64UrlDecode(parts[1]!);
    return JSON.parse(payloadJson) as Partial<TokenPayload>;
  } catch {
    return null;
  }
}

export function decodeTokenRole(token: string): UserRole | null {
  const payload = decodeTokenPayload(token);
  return payload?.role === 'admin' || payload?.role === 'user' ? payload.role : null;
}

// Только для UI-решений типа "скрыть действие над собственной учётной записью"
// backend (409 на самодеактивацию) остаётся реальной защитой независимо от этого значения
export function decodeTokenUuid(token: string): string | null {
  const payload = decodeTokenPayload(token);
  return typeof payload?.uuid === 'string' ? payload.uuid : null;
}