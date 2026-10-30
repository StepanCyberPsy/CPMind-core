import { getDeliveryBaseUrl } from '../../lib/env.js';
import { escapeXml } from './xml.js';
import {
    buildAdVerificationsBlock,
    buildAdVerificationsExtensionBlock,
    type OmidVerificationParams,
} from './verification.js';

export interface VastWrapperInput {
    adSessionId: string;
    creativeVersionUuid: string;

    // Адрес стороннего VAST-ответа. Проверяется validateExternalVastTagUrl
    // до записи версии креатива, здесь считается уже допустимым
    vastAdTagUri: string;

    skippable: boolean;
    verification?: OmidVerificationParams;
}

// События, которые плеер обязан продублировать на наши URL при проигрывании
// ролика, пришедшего из вложенного VAST-ответа
const WRAPPER_TRACKING_EVENTS: readonly string[] = [
    'start',
    'firstQuartile',
    'midpoint',
    'thirdQuartile',
    'complete',
    'pause',
    'resume',
    'mute',
    'unmute',
    'rewind',
];

/**
 * VAST 4.3 Wrapper: собственный трекинг и блок верификации CPMind поверх
 * стороннего ответа адсервера клиента.
 *
 * Порядок вложенных элементов — по §3.19:
 * Impression, VASTAdTagURI, AdSystem, Pricing, Error, ViewableImpression,
 * AdVerifications, Extensions, Creatives, BlockedAdCategories.
 * Он отличается от порядка в InLine: там Extensions идёт перед AdVerifications.
 *
 * Медиафайлы во Wrapper не передаются — <Linear> служит только для трекинга (§3.19).
 * SIMID через Wrapper недоступен: <InteractiveCreativeFile> допустим только
 * в MediaFiles формата InLine (§3.9.3), поэтому в этом сценарии частичный S5
 * из событий креатива не собирается.
 */
export function generateVastWrapper(input: VastWrapperInput): string {
    const {
        adSessionId,
        creativeVersionUuid,
        vastAdTagUri,
        skippable,
        verification,
    } = input;

    if (vastAdTagUri.length === 0) {
        throw new Error('VAST_WRAPPER_TAG_URI_EMPTY');
    }

    const trackBase = `${getDeliveryBaseUrl()}/t/vast`;
    const sid = adSessionId;

    const trackingLines = WRAPPER_TRACKING_EVENTS.map(
        (event) =>
            `              <Tracking event="${event}">`
            + `<![CDATA[${trackBase}/${event}?sid=${sid}&cb=[CACHEBUSTING]]]>`
            + '</Tracking>',
    );

    if (skippable) {
        trackingLines.push(
            `              <Tracking event="skip">`
            + `<![CDATA[${trackBase}/skip?sid=${sid}&cb=[CACHEBUSTING]]]>`
            + '</Tracking>',
        );
    }

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="4.3">',
        `  <Ad id="${escapeXml(creativeVersionUuid)}">`,
        '    <Wrapper followAdditionalWrappers="true" allowMultipleAds="false" fallbackOnNoAd="false">',
        `      <Impression id="cpmind"><![CDATA[${trackBase}/impression?sid=${sid}&cb=[CACHEBUSTING]]]></Impression>`,
        `      <VASTAdTagURI><![CDATA[${vastAdTagUri}]]></VASTAdTagURI>`,
        '      <AdSystem version="1.0">CPMind</AdSystem>',
        `      <Error><![CDATA[${trackBase}/error?sid=${sid}&code=[ERRORCODE]&cb=[CACHEBUSTING]]]></Error>`,
        ...(verification !== undefined ? buildAdVerificationsBlock(verification) : []),
        ...(verification !== undefined ? buildAdVerificationsExtensionBlock(verification) : []),
        '      <Creatives>',
        `        <Creative id="${escapeXml(creativeVersionUuid)}" adId="${escapeXml(creativeVersionUuid)}">`,
        '          <Linear>',
        '            <TrackingEvents>',
        ...trackingLines,
        '            </TrackingEvents>',
        '            <VideoClicks>',
        `              <ClickTracking id="cpmind"><![CDATA[${trackBase}/click?sid=${sid}&cb=[CACHEBUSTING]]]></ClickTracking>`,
        '            </VideoClicks>',
        '          </Linear>',
        '        </Creative>',
        '      </Creatives>',
        '    </Wrapper>',
        '  </Ad>',
        '</VAST>',
    ].join('\n');
}
