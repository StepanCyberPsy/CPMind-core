// Валидация URL и clickthrough для баннеров и HTML5-bridge

function isValidClickthroughUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

export function assertValidClickthroughUrl(url: string): void {
    if (!isValidClickthroughUrl(url)) {
        throw new Error('INVALID_CLICKTHROUGH_URL');
    }
}

export function executeClickthrough(
    href: string,
    fallbackUrl: string | null,
): void {
    if (isValidClickthroughUrl(href)) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
    }
    if (fallbackUrl !== null && isValidClickthroughUrl(fallbackUrl)) {
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }
}