export function extractPublisherDomain(
    referer: string | undefined,
): string | null {
    if (!referer) return null;
    try {
        const hostname = new URL(referer).hostname;
        return hostname.length > 0 ? hostname : null;
    } catch {
        return null;
    }
}