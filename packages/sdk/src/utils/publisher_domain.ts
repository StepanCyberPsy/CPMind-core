/**
 * Определение домена площадки для каждого показа.
 *
 * Приоритет источников:
 *   1. TagConfig.publisherDomain — явно задан при создании тега (самый надёжный)
 *   2. document.referrer hostname — родительская страница в iframe-контексте
 *   3. window.location.hostname — direct embed без iframe
 *   4. unknown_{hash} — детерминированный fallback по контексту страницы
 *
 * Hash: djb2 по строке `href + referrer`, 6 hex-символов.
 * Детерминированность: одна и та же площадка всегда даёт одинаковый hash,
 * что позволяет корректно группировать данные даже без явного домена.
 */

/** RFC 1123 hostname: метки a-z0-9, разделены точками, допускаются дефисы внутри */
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Localhost и IP-адреса — валидны для dev-окружения, но маркируются отдельно */
const LOCALHOST_REGEX = /^localhost(:\d+)?$/i;
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

/**
 * djb2 hash — быстрый детерминированный алгоритм с хорошим распределением.
 * Возвращает 6 hex-символов (16^6 = 16 777 216 комбинаций).
 *
 * Защита от коллизий: hash дополняется длиной входной строки (length-suffix),
 * что разделяет анаграммы и короткие строки с одинаковым hash-значением.
 * Полная защита невозможна при 6 символах, но для аналитической группировки
 * площадок вероятность значимой коллизии пренебрежимо мала.
 */
function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ (input.charCodeAt(i) & 0xff);
    hash = hash >>> 0; // приводим к uint32 на каждой итерации — предотвращаем overflow
  }
  // Подмешиваем длину строки для снижения вероятности коллизий анаграмм
  hash = ((hash << 5) + hash) ^ (input.length & 0xff);
  hash = hash >>> 0;
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

/**
 * Извлекает hostname из URL-строки.
 * Возвращает null при любой ошибке парсинга.
 */
function extractHostname(url: string): string | null {
  if (!url || url.trim() === '') return null;
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Валидирует домен как пригодный для использования в качестве publisher_domain.
 * Принимает: RFC 1123 hostname, localhost, IPv4.
 * Отклоняет: пустые строки, невалидные символы, слишком длинные домены (RFC 1035: max 253).
 */
export function isValidPublisherDomain(domain: string): boolean {
  if (!domain || domain.length === 0 || domain.length > 253) return false;
  if (LOCALHOST_REGEX.test(domain)) return true;
  if (IPV4_REGEX.test(domain)) return true;
  return DOMAIN_REGEX.test(domain);
}

/**
 * Генерирует детерминированный unknown-идентификатор для площадки.
 * Использует href + referrer как seed — одна и та же страница всегда
 * даёт одинаковый hash, разные страницы с высокой вероятностью — разные.
 */
function buildUnknownDomain(): string {
  let seed = '';
  try {
    seed = (window.location.href ?? '') + '|' + (document.referrer ?? '');
  } catch {
    seed = 'fallback';
  }
  return `unknown_${djb2Hash(seed)}`;
}

/**
 * Возвращает publisher_domain для текущего показа.
 *
 * @param configDomain — значение из TagConfig.publisherDomain (задаётся при создании тега)
 */
export function getPublisherDomain(configDomain?: string): string {
  // Приоритет 1: явно заданный домен в TagConfig
  if (configDomain !== undefined && configDomain.trim() !== '') {
    const normalized = configDomain.trim().toLowerCase();
    if (isValidPublisherDomain(normalized)) return normalized;
    // Невалидный configDomain — не падаем, продолжаем цепочку
  }

  // Приоритет 2: referrer родительской страницы (iframe-контекст)
  try {
    const referrerHost = extractHostname(document.referrer);
    if (referrerHost !== null && isValidPublisherDomain(referrerHost)) {
      return referrerHost;
    }
  } catch {
    // document.referrer недоступен — продолжаем
  }

  // Приоритет 3: hostname текущей страницы (direct embed)
  try {
    const locationHost = window.location.hostname.toLowerCase();
    if (locationHost && isValidPublisherDomain(locationHost)) {
      return locationHost;
    }
  } catch {
    // window.location недоступен — продолжаем
  }

  // Приоритет 4: детерминированный unknown-идентификатор
  return buildUnknownDomain();
}