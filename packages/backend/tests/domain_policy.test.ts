import {
    describe,
    expect,
    it,
} from 'vitest';
import {
    evaluateDomainPolicy,
    toDomainEnforcement,
} from '../src/services/delivery/domain_policy.js';

const ALLOWED = ['example.com', 'partner.ru'];

describe('Приведение режима проверки домена', () => {

    it('допустимые значения проходят без изменения', () => {
        expect(toDomainEnforcement('off')).toBe('off');
        expect(toDomainEnforcement('monitor')).toBe('monitor');
        expect(toDomainEnforcement('block')).toBe('block');
    });

    it('неизвестное значение приводится к наблюдению', () => {
        expect(toDomainEnforcement('strict')).toBe('monitor');
        expect(toDomainEnforcement('')).toBe('monitor');
    });
});

describe('Проверка домена площадки', () => {

    it('режим off пропускает любой домен', () => {
        expect(evaluateDomainPolicy('other.com', ALLOWED, 'off')).toBe('allowed');
        expect(evaluateDomainPolicy(null, ALLOWED, 'off')).toBe('allowed');
    });

    it('пустой список означает отсутствие ограничения', () => {
        expect(evaluateDomainPolicy('other.com', null, 'block')).toBe('allowed');
        expect(evaluateDomainPolicy('other.com', [], 'block')).toBe('allowed');
    });

    // Referrer-Policy издателя не должна отклонять достоверные показы
    it('неопределённый домен не считается нарушением ни в одном режиме', () => {
        expect(evaluateDomainPolicy(null, ALLOWED, 'monitor')).toBe('unknown');
        expect(evaluateDomainPolicy(null, ALLOWED, 'block')).toBe('unknown');
        expect(evaluateDomainPolicy(undefined, ALLOWED, 'block')).toBe('unknown');
        expect(evaluateDomainPolicy('', ALLOWED, 'block')).toBe('unknown');
    });

    it('совпадающий домен разрешён в любом режиме', () => {
        expect(evaluateDomainPolicy('example.com', ALLOWED, 'monitor')).toBe('allowed');
        expect(evaluateDomainPolicy('partner.ru', ALLOWED, 'block')).toBe('allowed');
    });

    // Издатель указывает домен верхнего уровня, размещая рекламу в том числе
    // на www и региональных поддоменах
    it('поддомены разрешённого домена принимаются', () => {
        expect(evaluateDomainPolicy('www.example.com', ALLOWED, 'block')).toBe('allowed');
        expect(evaluateDomainPolicy('news.spb.example.com', ALLOWED, 'block')).toBe('allowed');
    });

    it('домен, оканчивающийся на разрешённый без разделителя, не принимается', () => {
        expect(evaluateDomainPolicy('notexample.com', ALLOWED, 'monitor')).toBe('violation');
        expect(evaluateDomainPolicy('fakeexample.com', ALLOWED, 'block')).toBe('blocked');
    });

    it('регистр не влияет на сравнение', () => {
        expect(evaluateDomainPolicy('EXAMPLE.COM', ALLOWED, 'block')).toBe('allowed');
        expect(evaluateDomainPolicy('example.com', ['Example.COM'], 'block')).toBe('allowed');
    });

    it('чужой домен помечается в режиме monitor и отклоняется в режиме block', () => {
        expect(evaluateDomainPolicy('other.com', ALLOWED, 'monitor')).toBe('violation');
        expect(evaluateDomainPolicy('other.com', ALLOWED, 'block')).toBe('blocked');
    });
});