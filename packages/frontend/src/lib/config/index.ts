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