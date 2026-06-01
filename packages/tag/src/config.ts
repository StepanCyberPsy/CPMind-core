import type { TagConfig, CreativeType } from './types.js';

const VALID_CREATIVE_TYPES: CreativeType[] = [
  'banner_static',
  'banner_gif',
  'banner_html5'
];

export function parseConfig(container: HTMLElement): TagConfig | null {
  const campaignId = container.dataset['campaignId'] ?? '';
  const creativeId = container.dataset['creativeId'] ?? '';
  const creativeType = container.dataset['creativeType'] ?? '';
  const endpoint = container.dataset['endpoint'] ?? '';

  if (!campaignId || !creativeId || !endpoint) return null;
  if (!VALID_CREATIVE_TYPES.includes(creativeType as CreativeType)) return null;

  const debug = new URLSearchParams(location.search).has('cpmind_debug') || container.dataset['debug'] === 'true';

  return {
    campaignId,
    creativeId,
    creativeType: creativeType as CreativeType,
    endpoint,
    debug,
  };
}