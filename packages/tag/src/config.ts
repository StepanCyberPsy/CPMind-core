import type { TagConfig, CreativeType } from './types.js';
import { TAG_CONSTANTS_VERSION } from './constants.js';

const VALID_CREATIVE_TYPES: CreativeType[] = [
  'banner_static',
  'banner_gif',
  'banner_html5'
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseConfig(container: HTMLElement): TagConfig | null {
  const tagUuid = container.dataset['tagUuid'] ?? '';
  const campaignId = container.dataset['campaignId'] ?? '';
  const creativeId = container.dataset['creativeId'] ?? '';
  const creativeType = container.dataset['creativeType'] ?? '';
  const endpoint = container.dataset['endpoint'] ?? '';

  if (!tagUuid || !campaignId || !creativeId || !endpoint) return null;
  if (!UUID_REGEX.test(tagUuid)) return null;
  if (!VALID_CREATIVE_TYPES.includes(creativeType as CreativeType)) return null;

  const debug = new URLSearchParams(location.search).has('cpmind_debug') || container.dataset['debug'] === 'true';

  return {
    tagUuid,
    tagConstantsVersion: TAG_CONSTANTS_VERSION,
    campaignId,
    creativeId,
    creativeType: creativeType as CreativeType,
    endpoint,
    debug,
  };
}