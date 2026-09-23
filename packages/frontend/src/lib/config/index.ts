export const CREATIVE_TYPE_LABELS: Readonly<Record<string, string>> = {
    banner_static: 'Статичный баннер',
    banner_gif: 'GIF-баннер',
    banner_html5: 'HTML5-баннер',
    video_creative: 'Видеокреатив',
};

export const DELIVERY_MODE_LABELS: Readonly<Record<string, string>> = {
    display: 'Display (баннер)',
    outstream: 'Out-stream видео',
    instream_preroll: 'In-stream Pre-roll',
    instream_midroll: 'In-stream Mid-roll',
    instream_postroll: 'In-stream Post-roll',
    standalone_video: 'Standalone видео',
};

// Таксономия размещений: формат задаёт способ доставки, подтип — точку вставки
// для in-stream либо способ закрепления для out-stream
export const PLACEMENT_FORMAT_LABELS: Readonly<Record<string, string>> = {
    banner: 'Баннер',
    instream: 'In-stream видео',
    outstream: 'Out-stream видео',
};

export const PLACEMENT_SUBTYPE_LABELS: Readonly<Record<string, string>> = {
    preroll: 'Pre-roll — перед контентом',
    midroll: 'Mid-roll — в середине контента',
    postroll: 'Post-roll — после контента',
    pauseroll: 'Pause-roll — при возобновлении после паузы',
    inpage: 'In-Page — в потоке страницы',
    sticky: 'Sticky — закреплённое в углу окна',
};

// Краткие подписи для таблиц и карточек
export const PLACEMENT_SUBTYPE_SHORT_LABELS: Readonly<Record<string, string>> = {
    preroll: 'Pre-roll',
    midroll: 'Mid-roll',
    postroll: 'Post-roll',
    pauseroll: 'Pause-roll',
    inpage: 'In-Page',
    sticky: 'Sticky',
};

export const VIDEO_PLACEMENT_FORMATS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'outstream', label: 'Out-stream видео' },
    { value: 'instream', label: 'In-stream видео' },
];

export const FORMAT_SUBTYPE_OPTIONS: Readonly<Record<string, ReadonlyArray<{ value: string; label: string }>>> = {
    banner: [],
    instream: [
        { value: 'preroll', label: PLACEMENT_SUBTYPE_LABELS['preroll']! },
        { value: 'midroll', label: PLACEMENT_SUBTYPE_LABELS['midroll']! },
        { value: 'postroll', label: PLACEMENT_SUBTYPE_LABELS['postroll']! },
        { value: 'pauseroll', label: PLACEMENT_SUBTYPE_LABELS['pauseroll']! },
    ],
    outstream: [
        { value: 'inpage', label: PLACEMENT_SUBTYPE_LABELS['inpage']! },
        { value: 'sticky', label: PLACEMENT_SUBTYPE_LABELS['sticky']! },
    ],
};

export const STICKY_CORNER_LABELS: Readonly<Record<string, string>> = {
    top_left: 'Сверху слева',
    top_right: 'Сверху справа',
    bottom_left: 'Снизу слева',
    bottom_right: 'Снизу справа',
};

export const STICKY_CORNER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'bottom_right', label: STICKY_CORNER_LABELS['bottom_right']! },
    { value: 'bottom_left', label: STICKY_CORNER_LABELS['bottom_left']! },
    { value: 'top_right', label: STICKY_CORNER_LABELS['top_right']! },
    { value: 'top_left', label: STICKY_CORNER_LABELS['top_left']! },
];

export const ROTATION_MODE_LABELS: Readonly<Record<string, string>> = {
    weighted_random: 'Случайно по весам',
    sequential: 'По очереди',
};

export const ROTATION_MODE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'weighted_random', label: ROTATION_MODE_LABELS['weighted_random']! },
    { value: 'sequential', label: ROTATION_MODE_LABELS['sequential']! },
];

export const DOMAIN_ENFORCEMENT_LABELS: Readonly<Record<string, string>> = {
    off: 'Не проверять',
    monitor: 'Отмечать нарушения',
    block: 'Отклонять показы',
};

export const DOMAIN_ENFORCEMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'monitor', label: DOMAIN_ENFORCEMENT_LABELS['monitor']! },
    { value: 'off', label: DOMAIN_ENFORCEMENT_LABELS['off']! },
    { value: 'block', label: DOMAIN_ENFORCEMENT_LABELS['block']! },
];

export const AUTOPLAY_MODE_LABELS: Readonly<Record<string, string>> = {
    autoplay: 'Автоматически',
    click_to_play: 'По клику зрителя',
};

export const AUTOPLAY_MODE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'autoplay', label: AUTOPLAY_MODE_LABELS['autoplay']! },
    { value: 'click_to_play', label: AUTOPLAY_MODE_LABELS['click_to_play']! },
];

// Значения по умолчанию для закреплённого видео. Совпадают с константами плеера:
// STICKY_DEFAULT_WIDTH_PX, STICKY_DEFAULT_OFFSET_PX, STICKY_DEFAULT_CORNER
export const STICKY_DEFAULTS = {
    corner: 'bottom_right',
    offsetX: 16,
    offsetY: 16,
    width: 320,
    height: 180,
} as const;

export const CREATIVE_STATUS_LABELS: Readonly<Record<string, string>> = {
    draft: 'Черновик',
    processing: 'В обработке',
    ready: 'Готов',
    active: 'Активен',
    archived: 'Архив',
    failed: 'Ошибка',
};

export const BANNER_CREATIVE_TYPES: ReadonlySet<string> = new Set([
    'banner_static',
    'banner_gif',
    'banner_html5',
]);

export const VIDEO_DELIVERY_MODES: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'outstream', label: 'Out-stream видео' },
    { value: 'instream_preroll', label: 'In-stream Pre-roll' },
    { value: 'instream_midroll', label: 'In-stream Mid-roll' },
    { value: 'instream_postroll', label: 'In-stream Post-roll' },
    { value: 'standalone_video', label: 'Standalone видео' },
];

export const INSTREAM_MODES: ReadonlySet<string> = new Set([
    'instream_preroll',
    'instream_midroll',
    'instream_postroll',
]);

export function formatCreativeType(type: string): string {
    return CREATIVE_TYPE_LABELS[type] ?? type;
}

export function formatDeliveryMode(mode: string): string {
    return DELIVERY_MODE_LABELS[mode] ?? mode;
}

export function formatPlacementFormat(format: string | null): string {
    if (format === null) return '—';
    return PLACEMENT_FORMAT_LABELS[format] ?? format;
}

export function formatPlacementSubtype(subtype: string | null): string {
    if (subtype === null) return '—';
    return PLACEMENT_SUBTYPE_SHORT_LABELS[subtype] ?? subtype;
}

// Подпись размещения: формат и подтип одной строкой. Баннер подтипа не имеет
export function formatPlacement(
    format: string | null,
    subtype: string | null,
): string {
    if (format === null) return '—';

    const formatLabel = PLACEMENT_FORMAT_LABELS[format] ?? format;
    if (subtype === null) return formatLabel;

    const subtypeLabel = PLACEMENT_SUBTYPE_SHORT_LABELS[subtype] ?? subtype;
    return `${formatLabel} · ${subtypeLabel}`;
}

export function formatStickyCorner(corner: string | null): string {
    if (corner === null) return '—';
    return STICKY_CORNER_LABELS[corner] ?? corner;
}

export function formatRotationMode(mode: string): string {
    return ROTATION_MODE_LABELS[mode] ?? mode;
}

export function formatDomainEnforcement(value: string): string {
    return DOMAIN_ENFORCEMENT_LABELS[value] ?? value;
}

export function formatAutoplayMode(mode: string | null): string {
    if (mode === null) return '—';
    return AUTOPLAY_MODE_LABELS[mode] ?? mode;
}

// Звук по умолчанию определяет формат: in-stream воспроизводится внутри контента,
// который зритель уже смотрит со звуком, out-stream появляется без его запроса.
// Повторяет resolveDefaultInitialMuted из shared
export function resolveDefaultInitialMutedByFormat(format: string): boolean {
    return format !== 'instream';
}

export function formatCreativeStatus(status: string): string {
    return CREATIVE_STATUS_LABELS[status] ?? status;
}

export function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function buildDefaultCreativeName(
    campaignName: string,
    creativeType: string,
): string {
    const typeLabel = CREATIVE_TYPE_LABELS[creativeType] ?? creativeType;
    const ts = new Date().toISOString().slice(0, 10);
    return `${campaignName} — ${typeLabel} — ${ts}`;
}

export const CREATIVE_TYPE_CARD_LABELS: Readonly<Record<string, string>> = {
    banner_static: 'Баннеры',
    banner_gif: 'GIF',
    banner_html5: 'HTML5',
    video_creative: 'Видео',
};

export const CREATIVE_TYPE_KEYS: ReadonlyArray<
    | 'banner_static'
    | 'banner_gif'
    | 'banner_html5'
    | 'video_creative'
> = [
        'banner_static',
        'banner_gif',
        'banner_html5',
        'video_creative',
    ];