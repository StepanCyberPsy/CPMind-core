import { describe, expect, it } from 'vitest';
import { DEFAULT_TAG_CONSTANTS } from '@cpmind/shared';
import { generateVastInLine, type VastInLineInput } from '../src/services/vast/inline.js';
import {
    CPMIND_OMID_VENDOR,
    type OmidVerificationParams,
} from '../src/services/vast/verification.js';
import { assertWellFormed } from './helpers/xml.js';

const RENDITION = {
    cdnUrl: `${process.env['CDN_BASE_URL']}/creatives/clip.mp4`,
    mimeType: 'video/mp4',
    width: 1280,
    height: 720,
    bitrateKbps: 2200,
    codec: 'avc1',
};

const VERIFICATION: OmidVerificationParams = {
    adSessionId: '11111111-2222-4333-8444-555555555555',
    tagUuid: '66666666-7777-4888-8999-aaaaaaaaaaaa',
    tagConstantsVersion: 'tc-v1',
    campaignKey: 'camp-1',
    creativeKey: 'cr-1',
    creativeType: 'video_creative',
    placementUuid: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    creativeVersionUuid: 'dddddddd-eeee-4fff-8000-111111111111',
    deliveryKind: 'inline',
    collectEndpoint: 'https://app.cpmind.test/api/collect',
    deliveryMode: 'outstream',
    tagConstants: DEFAULT_TAG_CONSTANTS,
};

function baseInput(): VastInLineInput {
    return {
        adSessionId: VERIFICATION.adSessionId,
        creativeVersionUuid: VERIFICATION.creativeVersionUuid,
        adTitle: 'Ролик',
        clickUrl: 'https://example.test/landing',
        skippable: true,
        skipOffsetSec: 5,
        durationSec: 30,
        renditions: [RENDITION],
    };
}

describe('generateVastInLine — блок верификации OMID', () => {

    it('не выводит AdVerifications, когда параметры не переданы', () => {
        const xml = generateVastInLine(baseInput());

        expect(xml).not.toContain('<AdVerifications>');
        assertWellFormed(xml);
    });

    it('выводит Verification с ключом вендора и ресурсом OMID', () => {
        const xml = generateVastInLine({ ...baseInput(), verification: VERIFICATION });

        expect(xml).toContain(`<Verification vendor="${CPMIND_OMID_VENDOR}">`);
        expect(xml).toContain('<JavaScriptResource apiFramework="omid" browserOptional="false">');
        expect(xml).toMatch(/<!\[CDATA\[https:\/\/[^\]]*\/runtime\/cpmind-omid_v\d+\.min\.js\]\]>/);
        assertWellFormed(xml);
    });

    it('размещает AdVerifications перед Creatives по порядку VAST 4.3', () => {
        const xml = generateVastInLine({ ...baseInput(), verification: VERIFICATION });

        expect(xml.indexOf('<AdVerifications>')).toBeGreaterThan(xml.indexOf('<Error>'));
        expect(xml.indexOf('<AdVerifications>')).toBeLessThan(xml.indexOf('<Creatives>'));
    });

    it('передаёт verificationNotExecuted с макросом REASON', () => {
        const xml = generateVastInLine({ ...baseInput(), verification: VERIFICATION });

        expect(xml).toContain('<Tracking event="verificationNotExecuted">');
        expect(xml).toContain(`/t/vast/verificationNotExecuted?sid=${VERIFICATION.adSessionId}&reason=[REASON]`);
    });

    it('передаёт параметры сессии в VerificationParameters', () => {
        const xml = generateVastInLine({ ...baseInput(), verification: VERIFICATION });

        const match = /<VerificationParameters><!\[CDATA\[([\s\S]*?)\]\]><\/VerificationParameters>/.exec(xml);
        expect(match).not.toBeNull();

        const payload = JSON.parse(match![1]!) as Record<string, unknown>;

        expect(payload).toMatchObject({
            sid: VERIFICATION.adSessionId,
            tag_uuid: VERIFICATION.tagUuid,
            tag_constants_version: VERIFICATION.tagConstantsVersion,
            campaign_id: VERIFICATION.campaignKey,
            creative_id: VERIFICATION.creativeKey,
            creative_type: VERIFICATION.creativeType,
            placement_uuid: VERIFICATION.placementUuid,
            creative_version_uuid: VERIFICATION.creativeVersionUuid,
            delivery_kind: 'inline',
            collect_endpoint: VERIFICATION.collectEndpoint,
        });
    });
});
