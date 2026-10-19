'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPlacement } from '@/lib/admin/api';
import {
    BANNER_CREATIVE_TYPES,
    VIDEO_PLACEMENT_FORMATS,
    FORMAT_SUBTYPE_OPTIONS,
    STICKY_CORNER_OPTIONS,
    AUTOPLAY_MODE_OPTIONS,
    DOMAIN_ENFORCEMENT_OPTIONS,
    STICKY_DEFAULTS,
    resolveDefaultInitialMutedByFormat,
} from '@/lib/config';
import { toDeliveryMode } from '@cpmind/shared';
import { PlacementEmbedModal } from './PlacementEmbedModal';
import type { CreativeDetail, PlacementDetail } from '@/lib/admin/api';
import type {
    CreatePlacementPayload,
    PlacementFormat,
    PlacementSubtype,
} from '@cpmind/shared';
import styles from '@/styles/inline-placement-form.module.css';

interface Props {
    creative: CreativeDetail;
}

// Три состояния звука: значение по умолчанию выводит сервер из формата,
// явный выбор закрепляется признаком initial_muted_overridden
type SoundChoice =
    | 'default'
    | 'sound_on'
    | 'muted';

const DEFAULT_VIDEO_FORMAT: PlacementFormat = 'outstream';
const DEFAULT_OUTSTREAM_SUBTYPE: PlacementSubtype = 'inpage';

function resolveFirstSubtype(format: PlacementFormat): PlacementSubtype | null {
    const options = FORMAT_SUBTYPE_OPTIONS[format] ?? [];
    const first = options[0];
    return first !== undefined ? first.value as PlacementSubtype : null;
}

export function InlinePlacementForm({ creative }: Props): React.ReactElement {
    const router = useRouter();
    const isBanner = BANNER_CREATIVE_TYPES.has(creative.creativeType);

    const latestVersion = creative.versions[0];
    const sourceAsset = latestVersion?.assets.find((a) => a.role === 'source');

    const [clickUrl, setClickUrl] = useState('');
    const [format, setFormat] = useState<PlacementFormat>(DEFAULT_VIDEO_FORMAT);
    const [subtype, setSubtype] = useState<PlacementSubtype>(DEFAULT_OUTSTREAM_SUBTYPE);
    const [slotId, setSlotId] = useState('');
    const [videoSelector, setVideoSelector] = useState('');
    const [soundChoice, setSoundChoice] = useState<SoundChoice>('default');
    const [autoplayMode, setAutoplayMode] = useState('autoplay');
    const [skippable, setSkippable] = useState(false);
    const [skipOffsetSec, setSkipOffsetSec] = useState('5');
    const [stickyCorner, setStickyCorner] = useState<string>(STICKY_DEFAULTS.corner);
    const [stickyOffsetX, setStickyOffsetX] = useState(String(STICKY_DEFAULTS.offsetX));
    const [stickyOffsetY, setStickyOffsetY] = useState(String(STICKY_DEFAULTS.offsetY));
    const [stickyWidth, setStickyWidth] = useState(String(STICKY_DEFAULTS.width));
    const [stickyHeight, setStickyHeight] = useState(String(STICKY_DEFAULTS.height));
    const [publisherDomain, setPublisherDomain] = useState('');
    const [allowedDomains, setAllowedDomains] = useState('');
    const [domainEnforcement, setDomainEnforcement] = useState('monitor');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdPlacement, setCreatedPlacement] = useState<PlacementDetail | null>(null);
    const [showModal, setShowModal] = useState(false);

    const effectiveFormat: PlacementFormat = isBanner ? 'banner' : format;
    const isInstream = effectiveFormat === 'instream';
    const isOutstream = effectiveFormat === 'outstream';
    const isSticky = isOutstream && subtype === 'sticky';
    const usesSlot = isBanner || (isOutstream && subtype === 'inpage');

    // Смена формата сбрасывает подтип: набор допустимых значений у форматов не пересекается
    const handleFormatChange = useCallback((value: string): void => {
        const nextFormat = value as PlacementFormat;
        setFormat(nextFormat);

        const nextSubtype = resolveFirstSubtype(nextFormat);
        if (nextSubtype !== null) setSubtype(nextSubtype);
    }, []);

    function resolveInitialMuted(): boolean | undefined {
        if (soundChoice === 'default') return undefined;
        return soundChoice === 'muted';
    }

    function parseAllowedDomains(): string[] | undefined {
        const parsed = allowedDomains
            .split(/[\s,]+/)
            .map((domain) => domain.trim().toLowerCase())
            .filter((domain) => domain !== '');

        return parsed.length > 0 ? parsed : undefined;
    }

    function buildPayload(): CreatePlacementPayload {
        const effectiveSubtype = isBanner ? null : subtype;
        const initialMuted = resolveInitialMuted();
        const domains = parseAllowedDomains();

        return {
            campaignUuid: creative.campaignUuid,
            creativeUuid: creative.uuid,

            // mode вычисляется из таксономии: сервер принимает его обязательным,
            // пока прежняя модель не снята со схемы
            mode: toDeliveryMode(effectiveFormat, effectiveSubtype),
            format: effectiveFormat,
            ...(effectiveSubtype !== null && { subtype: effectiveSubtype }),

            skippable: isInstream && skippable,
            ...(initialMuted !== undefined && { initialMuted }),
            ...(clickUrl.trim() !== '' && { clickUrl: clickUrl.trim() }),
            ...(usesSlot && slotId.trim() !== '' && { slotId: slotId.trim() }),
            ...(isInstream && videoSelector.trim() !== '' && {
                videoSelector: videoSelector.trim(),
            }),
            ...(isOutstream && { autoplayMode: autoplayMode as 'autoplay' | 'click_to_play' }),
            ...(isInstream && skippable && skipOffsetSec !== '' && {
                skipOffsetSec: Number(skipOffsetSec),
            }),
            ...(isSticky && {
                stickyCorner: stickyCorner as 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right',
                stickyOffsetX: Number(stickyOffsetX),
                stickyOffsetY: Number(stickyOffsetY),
                stickyWidth: Number(stickyWidth),
                stickyHeight: Number(stickyHeight),
            }),
            ...(isBanner && sourceAsset?.width != null && { width: sourceAsset.width }),
            ...(isBanner && sourceAsset?.height != null && { height: sourceAsset.height }),
            ...(publisherDomain.trim() !== '' && {
                publisherDomain: publisherDomain.trim().toLowerCase(),
            }),
            ...(domains !== undefined && {
                allowedDomains: domains,
                domainEnforcement: domainEnforcement as 'off' | 'monitor' | 'block',
            }),
        };
    }

    const handleSubmit = async (): Promise<void> => {
        setLoading(true);
        setError(null);

        try {
            const result = await createPlacement(buildPayload());
            setCreatedPlacement(result);
            setShowModal(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания размещения');
        } finally {
            setLoading(false);
        }
    };

    const handleCloseModal = useCallback(() => {
        setShowModal(false);
        router.refresh();
    }, [router]);

    if (createdPlacement !== null) {
        return (
            <>
                <div className={styles.successRow}>
                    <span className={styles.successText}>Размещение создано.</span>
                    <button
                        type="button"
                        className={styles.embedBtn}
                        onClick={() => setShowModal(true)}
                    >
                        Показать embed-код
                    </button>
                </div>

                {showModal && (
                    <PlacementEmbedModal
                        placement={createdPlacement}
                        onClose={handleCloseModal}
                    />
                )}
            </>
        );
    }

    return (
        <div className={styles.root}>
            {isBanner ? (
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="ipl-click-url">
                        Ссылка для клика (необязательно)
                    </label>
                    <input
                        id="ipl-click-url"
                        type="url"
                        value={clickUrl}
                        onChange={(e) => setClickUrl(e.target.value)}
                        placeholder="https://example.com"
                        disabled={loading}
                    />
                </div>
            ) : (
                <>
                    <div className={styles.fieldRow}>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="ipl-format">
                                Формат размещения
                            </label>
                            <select
                                id="ipl-format"
                                value={format}
                                onChange={(e) => handleFormatChange(e.target.value)}
                                disabled={loading}
                            >
                                {VIDEO_PLACEMENT_FORMATS.map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="ipl-subtype">
                                Тип
                            </label>
                            <select
                                id="ipl-subtype"
                                value={subtype}
                                onChange={(e) => setSubtype(e.target.value as PlacementSubtype)}
                                disabled={loading}
                            >
                                {(FORMAT_SUBTYPE_OPTIONS[effectiveFormat] ?? []).map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="ipl-sound">
                            Звук при старте
                        </label>
                        <select
                            id="ipl-sound"
                            value={soundChoice}
                            onChange={(e) => setSoundChoice(e.target.value as SoundChoice)}
                            disabled={loading}
                        >
                            <option value="default">
                                {resolveDefaultInitialMutedByFormat(effectiveFormat)
                                    ? 'По умолчанию — без звука'
                                    : 'По умолчанию — со звуком'}
                            </option>
                            <option value="sound_on">Со звуком</option>
                            <option value="muted">Без звука</option>
                        </select>
                        <span className={styles.hint}>
                            In-stream воспроизводится внутри контента, который зритель уже
                            смотрит со звуком. Out-stream появляется в потоке страницы
                            без его запроса и стартует беззвучно.
                        </span>
                    </div>

                    {isOutstream && (
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="ipl-autoplay">
                                Запуск ролика
                            </label>
                            <select
                                id="ipl-autoplay"
                                value={autoplayMode}
                                onChange={(e) => setAutoplayMode(e.target.value)}
                                disabled={loading}
                            >
                                {AUTOPLAY_MODE_OPTIONS.map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {isInstream && (
                        <>
                            <label className={styles.checkRow}>
                                <input
                                    type="checkbox"
                                    className={styles.checkInput}
                                    checked={skippable}
                                    onChange={(e) => setSkippable(e.target.checked)}
                                    disabled={loading}
                                />
                                <span className={styles.checkLabel}>Можно пропустить</span>
                            </label>

                            {skippable && (
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="ipl-skip-offset">
                                        Пропуск через (сек)
                                    </label>
                                    <input
                                        id="ipl-skip-offset"
                                        type="number"
                                        min={0}
                                        max={30}
                                        step={1}
                                        value={skipOffsetSec}
                                        onChange={(e) => setSkipOffsetSec(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {isSticky && (
                        <div className={styles.group}>
                            <span className={styles.groupTitle}>Положение на странице</span>

                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="ipl-sticky-corner">
                                    Угол привязки
                                </label>
                                <select
                                    id="ipl-sticky-corner"
                                    value={stickyCorner}
                                    onChange={(e) => setStickyCorner(e.target.value)}
                                    disabled={loading}
                                >
                                    {STICKY_CORNER_OPTIONS.map((item) => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.fieldRow}>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="ipl-sticky-offset-x">
                                        Отступ по горизонтали (px)
                                    </label>
                                    <input
                                        id="ipl-sticky-offset-x"
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={stickyOffsetX}
                                        onChange={(e) => setStickyOffsetX(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>

                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="ipl-sticky-offset-y">
                                        Отступ по вертикали (px)
                                    </label>
                                    <input
                                        id="ipl-sticky-offset-y"
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={stickyOffsetY}
                                        onChange={(e) => setStickyOffsetY(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div className={styles.fieldRow}>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="ipl-sticky-width">
                                        Ширина (px)
                                    </label>
                                    <input
                                        id="ipl-sticky-width"
                                        type="number"
                                        min={120}
                                        step={10}
                                        value={stickyWidth}
                                        onChange={(e) => setStickyWidth(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>

                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="ipl-sticky-height">
                                        Высота (px)
                                    </label>
                                    <input
                                        id="ipl-sticky-height"
                                        type="number"
                                        min={80}
                                        step={10}
                                        value={stickyHeight}
                                        onChange={(e) => setStickyHeight(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <span className={styles.hint}>
                                На узком экране ширина автоматически ограничивается размером окна.
                            </span>
                        </div>
                    )}
                </>
            )}

            {isInstream && (
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="ipl-video-selector">
                        CSS-селектор видео
                    </label>
                    <input
                        id="ipl-video-selector"
                        type="text"
                        value={videoSelector}
                        onChange={(e) => setVideoSelector(e.target.value)}
                        placeholder=".entry-content video"
                        disabled={loading}
                    />
                    <span className={styles.hint}>
                        Ограничивает привязку конкретными видео на странице.
                        Пустое поле — реклама во всех видео.
                    </span>
                </div>
            )}

            {usesSlot && (
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="ipl-slot-id">
                        ID слота
                    </label>
                    <input
                        id="ipl-slot-id"
                        type="text"
                        value={slotId}
                        onChange={(e) => setSlotId(e.target.value)}
                        placeholder="cpmind-sidebar"
                        disabled={loading}
                    />
                    <span className={styles.hint}>
                        Идентификатор пустого div на странице издателя, внутрь которого
                        монтируется креатив. Пустое поле — креатив добавляется в конец страницы.
                    </span>
                </div>
            )}

            <div className={styles.group}>
                <span className={styles.groupTitle}>Площадка</span>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="ipl-publisher-domain">
                        Домен площадки (необязательно)
                    </label>
                    <input
                        id="ipl-publisher-domain"
                        type="text"
                        value={publisherDomain}
                        onChange={(e) => setPublisherDomain(e.target.value)}
                        placeholder="example.com"
                        disabled={loading}
                    />
                    <span className={styles.hint}>
                        Переопределяет домен, определённый автоматически. Пустое поле —
                        домен берётся из запроса издателя либо со страницы.
                    </span>
                </div>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="ipl-allowed-domains">
                        Разрешённые домены (необязательно)
                    </label>
                    <input
                        id="ipl-allowed-domains"
                        type="text"
                        value={allowedDomains}
                        onChange={(e) => setAllowedDomains(e.target.value)}
                        placeholder="example.com, partner.ru"
                        disabled={loading}
                    />
                    <span className={styles.hint}>
                        Через запятую. Поддомены разрешены автоматически.
                    </span>
                </div>

                {allowedDomains.trim() !== '' && (
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="ipl-domain-enforcement">
                            Показ с чужого домена
                        </label>
                        <select
                            id="ipl-domain-enforcement"
                            value={domainEnforcement}
                            onChange={(e) => setDomainEnforcement(e.target.value)}
                            disabled={loading}
                        >
                            {DOMAIN_ENFORCEMENT_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                        <span className={styles.hint}>
                            Показ с неопределённым доменом принимается в любом режиме:
                            политика приватности издателя не должна отклонять достоверные данные.
                        </span>
                    </div>
                )}
            </div>

            {error !== null && (
                <span className={styles.error}>{error}</span>
            )}

            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.submitBtn}
                    onClick={() => { void handleSubmit(); }}
                    disabled={loading}
                >
                    {loading ? 'Создание…' : 'Создать размещение'}
                </button>
            </div>
        </div>
    );
}
