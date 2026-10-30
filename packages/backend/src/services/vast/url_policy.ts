/**
 * Допустимость стороннего VAST-тега, который CPMind публикует в <VASTAdTagURI>.
 *
 * Запрос по этому адресу выполняет плеер площадки, не наш сервер, поэтому классический
 * SSRF здесь не возникает. Проверка решает другую задачу: не дать опубликовать от своего
 * имени адрес, который уводит плеер во внутреннюю сеть, на незашифрованный канал или
 * в заведомо нерабочее место. Резолв имени в адрес мы не контролируем — проверяется то,
 * что записано в URL.
 */

export type VastTagUrlRejection =
    | 'VAST_TAG_URL_MALFORMED'
    | 'VAST_TAG_URL_NOT_HTTPS'
    | 'VAST_TAG_URL_PRIVATE_HOST'
    | 'VAST_TAG_URL_HAS_CREDENTIALS'
    | 'VAST_TAG_URL_TOO_LONG';

export type VastTagUrlResult =
    | { ok: true; url: string }
    | { ok: false; reason: VastTagUrlRejection };

// Ответ адсервера с макросами и таргетингом бывает длинным, но не безразмерным
const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES: ReadonlySet<string> = new Set([
    'localhost',
    'broadcasthost',
    'ip6-localhost',
    'ip6-loopback',
]);

const BLOCKED_SUFFIXES: readonly string[] = [
    '.localhost',
    '.local',
    '.internal',
    '.home.arpa',
];

function isPrivateIpv4(hostname: string): boolean {
    const parts = hostname.split('.');
    if (parts.length !== 4) return false;

    const octets = parts.map((p) => Number(p));
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;

    const [a, b] = octets as [number, number, number, number];

    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT

    return false;
}

function isPrivateIpv6(hostname: string): boolean {
    // URL оборачивает литерал IPv6 в квадратные скобки
    if (!hostname.startsWith('[') || !hostname.endsWith(']')) return false;

    const address = hostname.slice(1, -1).toLowerCase();

    if (address === '::1' || address === '::') return true;
    if (address.startsWith('fe8') || address.startsWith('fe9')) return true; // fe80::/10
    if (address.startsWith('fea') || address.startsWith('feb')) return true;
    if (address.startsWith('fc') || address.startsWith('fd')) return true;   // fc00::/7

    return false;
}

export function validateExternalVastTagUrl(raw: string): VastTagUrlResult {
    const trimmed = raw.trim();

    if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
        return { ok: false, reason: 'VAST_TAG_URL_TOO_LONG' };
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return { ok: false, reason: 'VAST_TAG_URL_MALFORMED' };
    }

    if (parsed.protocol !== 'https:') {
        return { ok: false, reason: 'VAST_TAG_URL_NOT_HTTPS' };
    }

    // Учётные данные в URL утекут всем, кто видит VAST
    if (parsed.username !== '' || parsed.password !== '') {
        return { ok: false, reason: 'VAST_TAG_URL_HAS_CREDENTIALS' };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (hostname === '') {
        return { ok: false, reason: 'VAST_TAG_URL_MALFORMED' };
    }

    if (BLOCKED_HOSTNAMES.has(hostname)) {
        return { ok: false, reason: 'VAST_TAG_URL_PRIVATE_HOST' };
    }

    if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
        return { ok: false, reason: 'VAST_TAG_URL_PRIVATE_HOST' };
    }

    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
        return { ok: false, reason: 'VAST_TAG_URL_PRIVATE_HOST' };
    }

    return { ok: true, url: parsed.toString() };
}
