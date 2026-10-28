import { describe, expect, it } from 'vitest';
import { DEFAULT_TAG_CONSTANTS } from '@cpmind/shared';
import { generateVastWrapper, type VastWrapperInput } from '../src/services/vast/wrapper.js';
import {
    CPMIND_OMID_VENDOR,
    type OmidVerificationParams,
} from '../src/services/vast/verification.js';
import { assertWellFormed } from './helpers/xml.js';

const CLIENT_TAG = 'https://ads.adfox.ru/123456/getCode?p1=abcde&p2=fghij';

const VERIFICATION: OmidVerificationParams = {
    adSessionId: '11111111-2222-4333-8444-555555555555',
    tagUuid: '66666666-7777-4888-8999-aaaaaaaaaaaa',
    tagConstantsVersion: 'tc-v1',
    campaignKey: 'camp-1',
    creativeKey: 'cr-1',
    creativeType: 'video_creative',
    placementUuid: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    creativeVersionUuid: 'dddddddd-eeee-4fff-8000-111111111111',
    deliveryKind: 'wrapper',
    collectEndpoint: 'https://app.cpmind.test/api/collect',
    deliveryMode: 'outstream',
    tagConstants: DEFAULT_TAG_CONSTANTS,
};

function baseInput(): VastWrapperInput {
    return {
        adSessionId: VERIFICATION.adSessionId,
        creativeVersionUuid: VERIFICATION.creativeVersionUuid,
        vastAdTagUri: CLIENT_TAG,
        skippable: false,
        verification: VERIFICATION,
    };
}

describe('generateVastWrapper', () => {

    it('формирует Wrapper с тегом клиента и корректными атрибутами', () => {
        const xml = generateVastWrapper(baseInput());

        expect(xml).toContain('<Wrapper followAdditionalWrappers="true" allowMultipleAds="false" fallbackOnNoAd="false">');
        expect(xml).toContain(`<VASTAdTagURI><![CDATA[${CLIENT_TAG}]]></VASTAdTagURI>`);
        expect(xml).not.toContain('<InLine>');
        assertWellFormed(xml);
    });

    it('не передаёт медиафайлы — Wrapper служит только для трекинга', () => {
        const xml = generateVastWrapper(baseInput());

        expect(xml).not.toContain('<MediaFiles>');
        expect(xml).not.toContain('<MediaFile');
        expect(xml).not.toContain('<Duration>');
        expect(xml).not.toContain('<InteractiveCreativeFile');
    });

    it('соблюдает порядок элементов Wrapper по VAST 4.3 §3.19', () => {
        const xml = generateVastWrapper(baseInput());

        const order = [
            '<Impression id="cpmind">',
            '<VASTAdTagURI>',
            '<AdSystem version="1.0">',
            '<Error>',
            '<AdVerifications>',
            '<Extensions>',
            '<Creatives>',
        ].map((tag) => xml.indexOf(tag));

        expect(order.every((position) => position >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it('содержит блок верификации и дубль для потребителей ниже VAST 4.1', () => {
        const xml = generateVastWrapper(baseInput());

        expect(xml).toContain(`<Verification vendor="${CPMIND_OMID_VENDOR}">`);
        expect(xml).toContain('<Extension type="AdVerifications">');

        const verifications = xml.match(/<Verification vendor=/g);
        expect(verifications).toHaveLength(2);
    });

    it('подставляет CACHEBUSTING во все трекинговые адреса', () => {
        const xml = generateVastWrapper(baseInput());

        const trackingUrls = [...xml.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)]
            .map((m) => m[1]!)
            .filter((url) => url.includes('/t/vast/'));

        expect(trackingUrls.length).toBeGreaterThan(0);
        for (const url of trackingUrls) {
            expect(url).toContain('cb=[CACHEBUSTING]');
        }
    });

    it('добавляет трекинг пропуска только для пропускаемого размещения', () => {
        expect(generateVastWrapper(baseInput())).not.toContain('event="skip"');
        expect(generateVastWrapper({ ...baseInput(), skippable: true }))
            .toContain('event="skip"');
    });

    it('отклоняет пустой адрес стороннего тега', () => {
        expect(() => generateVastWrapper({ ...baseInput(), vastAdTagUri: '' }))
            .toThrow('VAST_WRAPPER_TAG_URI_EMPTY');
    });

    it('передаёт delivery_kind = wrapper в параметрах верификации', () => {
        const xml = generateVastWrapper(baseInput());
        const match = /<VerificationParameters><!\[CDATA\[([\s\S]*?)\]\]><\/VerificationParameters>/.exec(xml);

        expect(match).not.toBeNull();
        expect((JSON.parse(match![1]!) as Record<string, unknown>)['delivery_kind']).toBe('wrapper');
    });
});
