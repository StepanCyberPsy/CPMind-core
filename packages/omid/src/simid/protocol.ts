/**
 * Транспорт SIMID 1.2. Креатив исполняется в кросс-доменном iframe, поэтому
 * единственный канал с плеером — postMessage; сообщения сериализуются
 * JSON.stringify (SIMID 1.2 §8.1.1).
 */

export interface SimidMessage {
    sessionId: string;
    messageId: number;
    timestamp: number;
    type: string;
    args: unknown;
}

// Сессию открывает креатив: он генерирует идентификатор и посылает
// createSession первым сообщением с messageId 0 (SIMID 1.2 §8.4)
export const CREATE_SESSION_MESSAGE_ID = 0;
export const CREATE_SESSION_TYPE = 'createSession';
export const RESOLVE_TYPE = 'resolve';
export const REJECT_TYPE = 'reject';

/**
 * Идентификатор сессии должен быть криптографически стойким (SIMID 1.2 §8.4):
 * им подтверждается принадлежность сообщений нашей паре креатив—плеер.
 * crypto.randomUUID доступен не во всех целевых браузерах, поэтому
 * предусмотрен путь через getRandomValues.
 */
export function createSessionId(): string {
    const cryptoRef: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;

    if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
        return cryptoRef.randomUUID();
    }

    if (cryptoRef !== undefined && typeof cryptoRef.getRandomValues === 'function') {
        const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
        let out = '';
        for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
        return out;
    }

    throw new Error('SIMID_NO_SECURE_RANDOM');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * Разбор входящего сообщения. Плеер — чужой код, в окно прилетают и сообщения
 * посторонних скриптов, поэтому принимается только полностью валидная структура,
 * а решение о принадлежности сессии остаётся за вызывающим.
 */
export function parseSimidMessage(data: unknown): SimidMessage | null {
    let raw: unknown = data;

    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch {
            return null;
        }
    }

    if (!isRecord(raw)) return null;

    const { sessionId, messageId, timestamp, type } = raw;

    if (typeof sessionId !== 'string' || sessionId.length === 0) return null;
    if (typeof messageId !== 'number' || !Number.isFinite(messageId)) return null;
    if (typeof type !== 'string' || type.length === 0) return null;

    return {
        sessionId,
        messageId,
        timestamp: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : 0,
        type,
        args: raw['args'] ?? {},
    };
}

export function buildSimidMessage(
    sessionId: string,
    messageId: number,
    type: string,
    args: unknown,
): SimidMessage {
    return {
        sessionId,
        messageId,
        timestamp: Date.now(),
        type,
        args,
    };
}

// Ответ на запрос плеера адресуется по messageId исходного сообщения (§8.1.2)
export function buildResolve(
    sessionId: string,
    messageId: number,
    inResponseTo: number,
    value: unknown,
): SimidMessage {
    return buildSimidMessage(sessionId, messageId, RESOLVE_TYPE, {
        messageId: inResponseTo,
        value,
    });
}

export function buildReject(
    sessionId: string,
    messageId: number,
    inResponseTo: number,
    errorCode: number,
    message: string,
): SimidMessage {
    return buildSimidMessage(sessionId, messageId, REJECT_TYPE, {
        messageId: inResponseTo,
        value: { errorCode, message },
    });
}
