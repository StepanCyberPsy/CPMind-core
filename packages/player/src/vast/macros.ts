import { type PlayerErrorCode } from '../errors.js';
import { toVastErrorCode } from './error-codes.js';

// Контекст для substitution макросов
export interface MacroContext {
    errorCode?: PlayerErrorCode | undefined;
    contentPlayheadSec?: number | undefined;
}

// Форматирует секунды в HH:MM:SS.mmm для [CONTENTPLAYHEAD]
function formatPlayhead(totalSec: number): string {
    const totalMs = Math.round(Math.max(0, totalSec) * 1000);
    const ms = totalMs % 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    return (
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0') + '.' +
        String(ms).padStart(3, '0')
    );
}

// Заменяет IAB VAST макросы в tracking/error URL.
// Нераспознанные макросы удаляются (пустая строка) — IAB spec §2.4.1
export function substituteMacros(
    url: string,
    ctx: MacroContext,
): string {
    // [CACHEBUSTING] — crypto-random 8 цифр, не Math.random() (предсказуем)
    const cachebust = String(
        Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296 * 1e8),
    ).padStart(8, '0');

    const errorCodeNum = ctx.errorCode !== undefined
        ? String(toVastErrorCode(ctx.errorCode))
        : '';

    const playhead = ctx.contentPlayheadSec !== undefined
        ? formatPlayhead(ctx.contentPlayheadSec)
        : '';

    const timestamp = String(Math.floor(Date.now() / 1000));

    return url
        .replace(/\[ERRORCODE\]/g, errorCodeNum)
        .replace(/\[CACHEBUSTING\]/g, cachebust)
        .replace(/\[TIMESTAMP\]/g, timestamp)
        .replace(/\[CONTENTPLAYHEAD\]/g, playhead)
        // Удаляем все оставшиеся нераспознанные макросы
        .replace(/\[[A-Z][A-Z0-9_]*\]/g, '');
}