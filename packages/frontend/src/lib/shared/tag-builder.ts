import type { TagBuilderFormState, TagBuilderCreativeType } from '@/lib/user/types';

export type TagBuilderPlatform = 'html' | 'bitrix' | 'bitrix_component' | 'wordpress' | 'tilda' | 'react' | 'python';
export type TagBuilderFormat = 'html' | 'php' | 'jsx' | 'python';
export type TagBuilderStep = 'params' | 'code';
export type TagBuilderCopyTarget = 'container' | 'script';

export interface TagBuilderPlatformOption {
  value: TagBuilderPlatform;
  label: string;
  description: string;
  formats: TagBuilderFormat[];
}

export interface TagBuilderFormatOption {
  value: TagBuilderFormat;
  label: string;
}

export interface TagBuilderGeneratedCode {
  container: string;
  script: string;
}

export interface TagBuilderFormErrors {
  campaignId?: string;
  creativeId?: string;
  width?: string;
  height?: string;
}

export const TAG_BUILDER_CONSTANTS_VERSION = 'v0';
export const TAG_BUILDER_ENDPOINT = 'https://app.cpmind.tech/api/collect';
export const TAG_BUILDER_SCRIPT_SRC = `https://app.cpmind.tech/tag/cpmind-tag_${TAG_BUILDER_CONSTANTS_VERSION}.min.js`;

export const TAG_BUILDER_CREATIVE_TYPES: TagBuilderCreativeType[] = [
  'banner_static',
  'banner_gif',
  'banner_html5',
];

export const TAG_BUILDER_ID_PATTERN = /^[A-Za-z0-9_]{1,100}$/;

export const TAG_BUILDER_DEFAULT_FORM_STATE: TagBuilderFormState = {
  campaignId: '',
  creativeId: '',
  creativeType: 'banner_static',
  width: '728',
  height: '90',
};

export const TAG_BUILDER_DEFAULT_PLATFORM: TagBuilderPlatform = 'html';
export const TAG_BUILDER_DEFAULT_FORMAT: TagBuilderFormat = 'html';

export const TAG_BUILDER_HTML_PLATFORM_OPTION: TagBuilderPlatformOption = {
  value: 'html',
  label: 'Universal HTML',
  description: 'Для прямой вставки в HTML-шаблон страницы',
  formats: ['html'],
};

export const TAG_BUILDER_PLATFORM_OPTIONS: TagBuilderPlatformOption[] = [
  TAG_BUILDER_HTML_PLATFORM_OPTION,
  {
    value: 'bitrix',
    label: '1C-Битрикс',
    description: 'Для PHP-шаблонов сайта и включаемых областей',
    formats: ['php', 'html'],
  },
  {
    value: 'bitrix_component',
    label: 'Bitrix component template',
    description: 'Для template.php внутри компонента Битрикс',
    formats: ['php'],
  },
  {
    value: 'wordpress',
    label: 'WordPress',
    description: 'Для theme template, shortcode или template part',
    formats: ['php', 'html'],
  },
  {
    value: 'tilda',
    label: 'Tilda',
    description: 'Для блока HTML / T123',
    formats: ['html'],
  },
  {
    value: 'react',
    label: 'React / Next.js',
    description: 'Для JSX/TSX компонентов',
    formats: ['jsx'],
  },
  {
    value: 'python',
    label: 'Python',
    description: 'Для server-rendered HTML/Jinja/Django templates',
    formats: ['python', 'html'],
  },
];

export const TAG_BUILDER_FORMAT_OPTIONS: TagBuilderFormatOption[] = [
  { value: 'html', label: 'HTML' },
  { value: 'php', label: 'PHP' },
  { value: 'jsx', label: 'React / JSX' },
  { value: 'python', label: 'Python' },
];

export function getTagBuilderPlatformOption(
  platform: TagBuilderPlatform,
): TagBuilderPlatformOption {
  return TAG_BUILDER_PLATFORM_OPTIONS.find((item) => item.value === platform) ?? TAG_BUILDER_HTML_PLATFORM_OPTION;
}

export function getTagBuilderDefaultFormat(
  platform: TagBuilderPlatform,
): TagBuilderFormat {
  const option = getTagBuilderPlatformOption(platform);
  return option.formats[0] ?? TAG_BUILDER_DEFAULT_FORMAT;
}