// Режим применения списка разрешённых доменов площадки
export type DomainEnforcement =
    | 'off'
    | 'monitor'
    | 'block';

export type DomainPolicyOutcome =
    | 'allowed'
    | 'unknown'
    | 'violation'
    | 'blocked';

const DOMAIN_ENFORCEMENT_VALUES: ReadonlySet<string> = new Set([
    'off',
    'monitor',
    'block',
]);

// Значение из БД ограничено CHECK, приведение выполняется на границе слоя данных
export function toDomainEnforcement(value: string): DomainEnforcement {
    return DOMAIN_ENFORCEMENT_VALUES.has(value)
        ? value as DomainEnforcement
        : 'monitor';
}

// Поддомены площадки считаются разрешёнными: издатель указывает домен верхнего
// уровня, а рекламу размещает в том числе на www и региональных поддоменах
function matchesDomain(
    domain: string,
    allowed: string,
): boolean {
    if (domain === allowed) return true;
    return domain.endsWith(`.${allowed}`);
}

/**
 * Проверяет домен площадки по списку разрешённых. Домен, который не удалось
 * определить, нарушением не считается ни в одном режиме: политика Referrer-Policy
 * издателя не должна отклонять достоверные показы. Пустой список означает,
 * что ограничение не настроено.
 */
export function evaluateDomainPolicy(
    publisherDomain: string | null | undefined,
    allowedDomains: string[] | null,
    enforcement: DomainEnforcement,
): DomainPolicyOutcome {
    if (enforcement === 'off') return 'allowed';
    if (allowedDomains === null || allowedDomains.length === 0) return 'allowed';
    if (publisherDomain === null || publisherDomain === undefined || publisherDomain === '') {
        return 'unknown';
    }

    const normalized = publisherDomain.toLowerCase();
    const isAllowed = allowedDomains.some(
        (allowed) => matchesDomain(normalized, allowed.toLowerCase()),
    );

    if (isAllowed) return 'allowed';

    return enforcement === 'block' ? 'blocked' : 'violation';
}