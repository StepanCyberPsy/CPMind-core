/**
 * Отправка измерения показа. Приёмник частичных измерений — отдельная точка
 * /api/collect/omid: основной /api/collect и его контракт не затрагиваются.
 */

// sendBeacon переживает выгрузку страницы, но ограничен по размеру и может быть
// недоступен. fetch с keepalive — равноценный запасной путь
export function sendMeasurement(endpoint: string, payload: unknown): void {
    const body = JSON.stringify(payload);

    try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const blob = new Blob([body], { type: 'application/json' });
            if (navigator.sendBeacon(endpoint, blob)) return;
        }
    } catch {
        // переходим к запасному пути
    }

    try {
        void fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
            mode: 'cors',
            credentials: 'omit',
        }).catch(() => undefined);
    } catch {
        // Отказ отправки не должен влиять на воспроизведение рекламы
    }
}

export function buildPartialEndpoint(collectEndpoint: string): string {
    return `${collectEndpoint.replace(/\/+$/, '')}/omid`;
}

export function buildSimidEndpoint(collectEndpoint: string): string {
    return `${collectEndpoint.replace(/\/+$/, '')}/simid`;
}
