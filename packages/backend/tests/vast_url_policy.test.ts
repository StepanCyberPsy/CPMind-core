import { describe, expect, it } from 'vitest';
import { validateExternalVastTagUrl } from '../src/services/vast/url_policy.js';

describe('validateExternalVastTagUrl', () => {

    it('принимает обычный тег адсервера с параметрами', () => {
        const result = validateExternalVastTagUrl(
            'https://ads.adfox.ru/123456/getCode?p1=abcde&p2=fghij&pfc=xyz',
        );

        expect(result).toEqual({
            ok: true,
            url: 'https://ads.adfox.ru/123456/getCode?p1=abcde&p2=fghij&pfc=xyz',
        });
    });

    it.each([
        ['http://ads.example.com/vast', 'VAST_TAG_URL_NOT_HTTPS'],
        ['ftp://ads.example.com/vast', 'VAST_TAG_URL_NOT_HTTPS'],
        ['javascript:alert(1)', 'VAST_TAG_URL_NOT_HTTPS'],
        ['не ссылка', 'VAST_TAG_URL_MALFORMED'],
        ['https://user:pass@ads.example.com/vast', 'VAST_TAG_URL_HAS_CREDENTIALS'],
    ])('отклоняет %s', (input, reason) => {
        expect(validateExternalVastTagUrl(input)).toEqual({ ok: false, reason });
    });

    it.each([
        'https://localhost/vast',
        'https://service.localhost/vast',
        'https://adserver.local/vast',
        'https://adserver.internal/vast',
        'https://127.0.0.1/vast',
        'https://10.1.2.3/vast',
        'https://172.16.0.1/vast',
        'https://172.31.255.254/vast',
        'https://192.168.1.1/vast',
        'https://169.254.169.254/latest/meta-data',
        'https://100.100.0.1/vast',
        'https://[::1]/vast',
        'https://[fd00::1]/vast',
        'https://[fe80::1]/vast',
    ])('отклоняет внутренний адрес %s', (input) => {
        expect(validateExternalVastTagUrl(input)).toEqual({
            ok: false,
            reason: 'VAST_TAG_URL_PRIVATE_HOST',
        });
    });

    it('не принимает публичные адреса за внутренние', () => {
        for (const url of [
            'https://172.15.0.1/vast',
            'https://172.32.0.1/vast',
            'https://11.0.0.1/vast',
            'https://8.8.8.8/vast',
        ]) {
            expect(validateExternalVastTagUrl(url).ok).toBe(true);
        }
    });

    it('отклоняет пустое значение и превышение длины', () => {
        expect(validateExternalVastTagUrl('   ')).toEqual({
            ok: false,
            reason: 'VAST_TAG_URL_TOO_LONG',
        });

        const long = `https://ads.example.com/vast?p=${'x'.repeat(2100)}`;
        expect(validateExternalVastTagUrl(long)).toEqual({
            ok: false,
            reason: 'VAST_TAG_URL_TOO_LONG',
        });
    });
});
