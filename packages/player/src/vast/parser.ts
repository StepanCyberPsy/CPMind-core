import type { VastVerification } from '@cpmind/shared';
import type { ParsedVastAd } from './types.js';

// Парсит длительность в формате HH:MM:SS или HH:MM:SS.mmm → секунды.
// Возвращает -1 при невалидном формате (вызывающий проверяет > 0)
export function parseDuration(value: string): number {
    const trimmed = value.trim();
    const parts = trimmed.split(':');
    if (parts.length !== 3) return -1;

    const [hStr, mStr, sStr] = parts;
    if (hStr === undefined || mStr === undefined || sStr === undefined) return -1;

    const h = Number(hStr);
    const m = Number(mStr);
    const s = parseFloat(sStr);

    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return -1;
    if (h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return -1;

    return h * 3600 + m * 60 + s;
}

function getText(el: Element | null, selector: string): string {
    return el?.querySelector(selector)?.textContent?.trim() ?? '';
}

function getAttr(el: Element | null, attr: string): string {
    return el?.getAttribute(attr)?.trim() ?? '';
}

// Парсит <AdVerifications> — OMID vendor scripts.
// Parsed but not executed in v1
function parseAdVerifications(inLine: Element): VastVerification[] {
    const container = inLine.querySelector('AdVerifications');
    if (container === null) return [];

    const results: VastVerification[] = [];

    for (const verification of Array.from(container.querySelectorAll('Verification'))) {
        const jsResource = verification.querySelector('JavaScriptResource');
        if (jsResource === null) continue;

        const uri = jsResource.textContent?.trim() ?? '';
        if (uri === '') continue;

        try {
            new URL(uri);
        } catch {
            continue;
        }

        results.push({
            vendor: getAttr(verification, 'vendor') || null,
            apiFramework: getAttr(jsResource, 'apiFramework') || 'omid',
            javascriptResourceUri: uri,
            verificationParameters:
                verification.querySelector('VerificationParameters')?.textContent?.trim() ?? null,
        });
    }

    return results;
}

// Парсит VAST 4.3 InLine XML-строку в ParsedVastAd.
// Бросает Error с кодом ошибки при любом структурном нарушении.
export function parseVastXml(xml: string): ParsedVastAd {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    // DOMParser не бросает — возвращает документ с <parsererror> при невалидном XML
    const parseError = doc.querySelector('parsererror');
    if (parseError !== null) {
        throw new Error('VAST_XML_INVALID');
    }

    const vast = doc.documentElement;
    if (vast.tagName !== 'VAST') {
        throw new Error('VAST_XML_INVALID');
    }

    const inLine = vast.querySelector('Ad > InLine');
    if (inLine === null) {
        throw new Error('VAST_STRUCTURE_UNSUPPORTED');
    }

    const durationText = getText(inLine, 'Linear > Duration');
    const durationSec = parseDuration(durationText);
    if (durationSec <= 0) {
        throw new Error('VAST_STRUCTURE_UNSUPPORTED');
    }

    // MediaFiles — обязательны, MIME нормализуется toLowerCase
    const mediaFileEls = Array.from(inLine.querySelectorAll('Linear > MediaFiles > MediaFile'));
    if (mediaFileEls.length === 0) {
        throw new Error('VAST_STRUCTURE_UNSUPPORTED');
    }

    const mediaFiles = mediaFileEls
        .map((el) => ({
            id: el.getAttribute('id') || null,
            url: el.textContent?.trim() ?? '',
            type: (el.getAttribute('type') ?? '').toLowerCase(),
            delivery: (el.getAttribute('delivery') ?? 'progressive') as 'progressive' | 'streaming',
            width: parseInt(el.getAttribute('width') ?? '0', 10),
            height: parseInt(el.getAttribute('height') ?? '0', 10),
            codec: el.getAttribute('codec') || null,
            bitrateKbps: el.getAttribute('bitrate') !== null
                ? parseInt(el.getAttribute('bitrate')!, 10)
                : null,
            minBitrateKbps: el.getAttribute('minBitrate') !== null
                ? parseInt(el.getAttribute('minBitrate')!, 10)
                : null,
            maxBitrateKbps: el.getAttribute('maxBitrate') !== null
                ? parseInt(el.getAttribute('maxBitrate')!, 10)
                : null,
            scalable: el.getAttribute('scalable') !== null
                ? el.getAttribute('scalable') === 'true'
                : null,
            maintainAspectRatio: el.getAttribute('maintainAspectRatio') !== null
                ? el.getAttribute('maintainAspectRatio') === 'true'
                : null,
            fileSizeBytes: el.getAttribute('fileSize') !== null
                ? parseInt(el.getAttribute('fileSize')!, 10)
                : null,
            mediaType: el.getAttribute('mediaType') || null,
        }))
        .filter((f) => f.url !== '' && f.width > 0 && f.height > 0);

    if (mediaFiles.length === 0) {
        throw new Error('NO_SUPPORTED_MEDIA');
    }

    // Impressions
    const impressions = Array.from(inLine.querySelectorAll(':scope > Impression'))
        .map((el) => ({
            id: el.getAttribute('id') || null,
            url: el.textContent?.trim() ?? '',
        }))
        .filter((imp) => imp.url !== '');

    // Error URLs
    const errorUrls = Array.from(inLine.querySelectorAll(':scope > Error'))
        .map((el) => el.textContent?.trim() ?? '')
        .filter((u) => u !== '');

    // Tracking events
    const trackingEvents = Array.from(
        inLine.querySelectorAll('Linear > TrackingEvents > Tracking'),
    ).map((el) => {
        const offsetAttr = el.getAttribute('offset');
        let offset = null;
        if (offsetAttr !== null) {
            if (offsetAttr.endsWith('%')) {
                offset = { kind: 'percent' as const, value: parseFloat(offsetAttr) };
            } else {
                const sec = parseDuration(offsetAttr);
                if (sec >= 0) offset = { kind: 'seconds' as const, value: sec };
            }
        }
        return {
            event: el.getAttribute('event') ?? '',
            url: el.textContent?.trim() ?? '',
            offset,
        };
    }).filter((t) => t.event !== '' && t.url !== '') as ParsedVastAd['trackingEvents'];

    // Skip offset
    const linearEl = inLine.querySelector('Linear');
    const skipOffsetAttr = linearEl?.getAttribute('skipoffset') ?? null;
    let skipOffset: ParsedVastAd['skipOffset'] = null;
    if (skipOffsetAttr !== null) {
        if (skipOffsetAttr.endsWith('%')) {
            skipOffset = { kind: 'percent', value: parseFloat(skipOffsetAttr) };
        } else {
            const sec = parseDuration(skipOffsetAttr);
            if (sec >= 0) skipOffset = { kind: 'seconds', value: sec };
        }
    }

    // Clicks
    const videoClicksEl = inLine.querySelector('Linear > VideoClicks');
    const clickThroughEl = videoClicksEl?.querySelector('ClickThrough') ?? null;
    const clickThrough = clickThroughEl !== null
        ? {
            id: clickThroughEl.getAttribute('id') || null,
            url: clickThroughEl.textContent?.trim() ?? '',
        }
        : null;

    const clickTrackings = Array.from(
        videoClicksEl?.querySelectorAll('ClickTracking') ?? [],
    ).map((el) => ({
        id: el.getAttribute('id') || null,
        url: el.textContent?.trim() ?? '',
    })).filter((ct) => ct.url !== '');

    // Identification
    const adEl = vast.querySelector('Ad');
    const adId = adEl?.getAttribute('id') ?? null;
    const adServingId = getText(inLine, 'AdServingId') || null;
    const title = getText(inLine, 'AdTitle') || undefined;

    return {
        adId,
        adServingId,
        title,
        durationSec,
        skipOffset,
        mediaFiles,
        impressions,
        errorUrls,
        trackingEvents,
        clickThrough,
        clickTrackings,
        adVerifications: parseAdVerifications(inLine),
    };
}