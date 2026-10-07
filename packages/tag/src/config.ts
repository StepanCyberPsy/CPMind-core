import type { CreativeType } from '@cpmind/shared';
import type { TagConfig } from './types.js';
import { TAG_CONSTANTS_VERSION } from './constants.js';

// Перечень типов креатива. Схема из shared здесь не используется: она тянет в бандл
// тега рантайм Zod целиком, вчетверо увеличивая загружаемый издателем файл.
// Расхождение с источником истины исключается проверкой исчерпываемости: Record
// требует ключ на каждое значение CreativeType, выведенного из той же схемы
const VALID_CREATIVE_TYPES: Record<CreativeType, true> = {
  banner_static: true,
  banner_gif: true,
  banner_html5: true,
  video_creative: true,
};

function isCreativeType(value: string): value is CreativeType {
  return Object.prototype.hasOwnProperty.call(VALID_CREATIVE_TYPES, value);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Отказ разбора конфигурации оставляет контейнер неинициализированным: ни сессии,
// ни сигналов, ни показа. Без диагностики причина на странице издателя неразличима,
// а в панели отказ выглядит как отсутствие трафика
function rejectConfig(
  reason: string,
  debug: boolean,
): null {
  if (debug) {
    console.warn('[CPMind] Конфигурация контейнера отклонена:', reason);
  }
  return null;
}

export function parseConfig(container: HTMLElement): TagConfig | null {
  // Режим диагностики определяется до проверок: иначе причина отказа теряется
  const debug = new URLSearchParams(location.search).has('cpmind_debug') || container.dataset['debug'] === 'true';

  const tagUuid = container.dataset['tagUuid'] ?? '';
  const campaignId = container.dataset['campaignId'] ?? '';
  const creativeId = container.dataset['creativeId'] ?? '';
  const creativeType = container.dataset['creativeType'] ?? '';
  const endpoint = container.dataset['endpoint'] ?? '';

  if (!tagUuid || !campaignId || !creativeId || !endpoint) {
    return rejectConfig('не заполнены обязательные атрибуты контейнера', debug);
  }

  if (!UUID_REGEX.test(tagUuid)) {
    return rejectConfig('tag_uuid не соответствует формату', debug);
  }

  if (!isCreativeType(creativeType)) {
    return rejectConfig(`неизвестный тип креатива: ${creativeType}`, debug);
  }

  const skippable = container.dataset['skippable'] === 'true';
  const rawPublisherDomain = container.dataset['publisherDomain']?.trim();

  return {
    tagUuid,
    tagConstantsVersion: TAG_CONSTANTS_VERSION,
    campaignId,
    creativeId,
    creativeType,
    skippable,
    ...(rawPublisherDomain ? { publisherDomain: rawPublisherDomain } : {}),
    endpoint,
    debug,
  };
}