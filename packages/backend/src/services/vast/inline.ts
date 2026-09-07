import { getCdnBaseUrl, getDeliveryBaseUrl } from '../../lib/env.js';
import { escapeXml, formatDuration } from './xml.js';

export interface VastRendition {
    cdnUrl: string;
    mimeType: string;
    width: number;
    height: number;
    bitrateKbps: number | null;
    codec: string | null;
}

export interface VastInLineInput {
    adSessionId: string;
    creativeVersionUuid: string;
    adTitle: string;
    clickUrl: string | null;
    skippable: boolean;
    skipOffsetSec: number | null;
    durationSec: number;
    renditions: VastRendition[];
}

function assertTrustedMediaUrl(
    url: string,
    cdnHostname: string,
): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`VAST_MEDIA_URL_INVALID: ${url}`);
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== cdnHostname) {
        throw new Error(`VAST_MEDIA_ORIGIN_NOT_ALLOWED: ${parsed.hostname}`);
    }
}

export function generateVastInLine(input: VastInLineInput): string {
    const {
        adSessionId,
        creativeVersionUuid,
        adTitle,
        clickUrl,
        skippable,
        skipOffsetSec,
        durationSec,
        renditions,
    } = input;

    if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new Error('VAST_DURATION_INVALID');
    }
    if (renditions.length === 0) {
        throw new Error('VAST_NO_RENDITIONS');
    }

    const deliveryBase = getDeliveryBaseUrl();
    const cdnHostname = new URL(getCdnBaseUrl()).hostname;
    const trackBase = `${deliveryBase}/t/vast`;
    const sid = adSessionId;

    for (const rendition of renditions) {
        assertTrustedMediaUrl(rendition.cdnUrl, cdnHostname);
    }

    const skipoffsetAttr = skippable
        ? ` skipoffset="${formatDuration(skipOffsetSec ?? 0)}"`
        : '';

    const trackingLines: string[] = [
        `              <Tracking event="start"><![CDATA[${trackBase}/start?sid=${sid}]]></Tracking>`,
        `              <Tracking event="firstQuartile"><![CDATA[${trackBase}/firstQuartile?sid=${sid}]]></Tracking>`,
        `              <Tracking event="midpoint"><![CDATA[${trackBase}/midpoint?sid=${sid}]]></Tracking>`,
        `              <Tracking event="thirdQuartile"><![CDATA[${trackBase}/thirdQuartile?sid=${sid}]]></Tracking>`,
        `              <Tracking event="complete"><![CDATA[${trackBase}/complete?sid=${sid}]]></Tracking>`,
        `              <Tracking event="pause"><![CDATA[${trackBase}/pause?sid=${sid}]]></Tracking>`,
        `              <Tracking event="resume"><![CDATA[${trackBase}/resume?sid=${sid}]]></Tracking>`,
        `              <Tracking event="mute"><![CDATA[${trackBase}/mute?sid=${sid}]]></Tracking>`,
        `              <Tracking event="unmute"><![CDATA[${trackBase}/unmute?sid=${sid}]]></Tracking>`,
        `              <Tracking event="rewind"><![CDATA[${trackBase}/rewind?sid=${sid}]]></Tracking>`,
    ];

    if (skippable) {
        trackingLines.push(
            `              <Tracking event="skip"><![CDATA[${trackBase}/skip?sid=${sid}]]></Tracking>`,
        );
    }

    const mediaFilesLines = renditions.map((r) => {
        const bitrateAttr = r.bitrateKbps !== null
            ? ` bitrate="${r.bitrateKbps}"`
            : '';
        const codecAttr = r.codec !== null
            ? ` codec="${escapeXml(r.codec)}"`
            : '';
        return (
            `        <MediaFile delivery="progressive" type="${escapeXml(r.mimeType)}"` +
            ` width="${r.width}" height="${r.height}"${bitrateAttr}${codecAttr}` +
            ` maintainAspectRatio="true" scalable="true">` +
            `<![CDATA[${r.cdnUrl}]]></MediaFile>`
        );
    });

    const videoClickLines: string[] = [];
    if (clickUrl !== null) {
        videoClickLines.push(
            `              <ClickThrough id="cpmind"><![CDATA[${clickUrl}]]></ClickThrough>`,
        );
    }
    videoClickLines.push(
        `              <ClickTracking id="cpmind"><![CDATA[${trackBase}/click?sid=${sid}]]></ClickTracking>`,
    );

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="4.3">',
        `  <Ad id="${escapeXml(creativeVersionUuid)}">`,
        '    <InLine>',
        '      <AdSystem version="1.0">CPMind</AdSystem>',
        `      <AdTitle>${escapeXml(adTitle)}</AdTitle>`,
        `      <AdServingId>${escapeXml(adSessionId)}</AdServingId>`,
        `      <Impression id="cpmind"><![CDATA[${trackBase}/impression?sid=${sid}]]></Impression>`,
        `      <Error><![CDATA[${trackBase}/error?sid=${sid}&code=[ERRORCODE]]]></Error>`,
        '      <Creatives>',
        `        <Creative id="${escapeXml(creativeVersionUuid)}" adId="${escapeXml(creativeVersionUuid)}">`,
        `          <UniversalAdId idRegistry="unknown">${escapeXml(creativeVersionUuid)}</UniversalAdId>`,
        `          <Linear${skipoffsetAttr}>`,
        `            <Duration>${formatDuration(durationSec)}</Duration>`,
        '            <TrackingEvents>',
        ...trackingLines,
        '            </TrackingEvents>',
        '            <MediaFiles>',
        ...mediaFilesLines,
        '            </MediaFiles>',
        '            <VideoClicks>',
        ...videoClickLines,
        '            </VideoClicks>',
        '          </Linear>',
        '        </Creative>',
        '      </Creatives>',
        '    </InLine>',
        '  </Ad>',
        '</VAST>',
    ].join('\n');
}