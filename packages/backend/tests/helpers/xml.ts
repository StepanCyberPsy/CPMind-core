import { expect } from 'vitest';

/**
 * Парность тегов без внешних зависимостей: секции CDATA вырезаются,
 * затем открывающие и закрывающие теги укладываются в стек.
 */
export function assertWellFormed(xml: string): void {
    const withoutCdata = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    const stack: string[] = [];

    for (const match of withoutCdata.matchAll(/<\/?([A-Za-z][\w.-]*)[^>]*?(\/?)>/g)) {
        const [raw, name, selfClosing] = match;
        if (raw.startsWith('<?') || raw.startsWith('<!')) continue;
        if (selfClosing === '/') continue;

        if (raw.startsWith('</')) {
            expect(stack.pop()).toBe(name);
        } else {
            stack.push(name!);
        }
    }

    expect(stack).toEqual([]);
}
