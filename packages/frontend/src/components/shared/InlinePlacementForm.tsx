'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPlacement } from '@/lib/admin/api';
import {
    BANNER_CREATIVE_TYPES,
    INSTREAM_MODES,
    VIDEO_DELIVERY_MODES,
} from '@/lib/config';
import { PlacementEmbedModal } from './PlacementEmbedModal';
import type { CreativeDetail, PlacementDetail } from '@/lib/admin/api';
import type { DeliveryMode } from '@cpmind/shared';
import styles from '@/styles/inline-placement-form.module.css';

interface Props {
    creative: CreativeDetail;
}

const DEFAULT_VIDEO_MODE: DeliveryMode = 'outstream';

export function InlinePlacementForm({ creative }: Props): React.ReactElement {
    const router = useRouter();
    const isBanner = BANNER_CREATIVE_TYPES.has(creative.creativeType);

    const latestVersion = creative.versions[0];
    const sourceAsset = latestVersion?.assets.find((a) => a.role === 'source');

    const [clickUrl, setClickUrl] = useState('');
    const [mode, setMode] = useState<DeliveryMode>(DEFAULT_VIDEO_MODE);
    const [slotId, setSlotId] = useState('');
    const [videoSelector, setVideoSelector] = useState('');
    const [initialMuted, setInitialMuted] = useState(true);
    const [skippable, setSkippable] = useState(false);
    const [skipOffsetSec, setSkipOffsetSec] = useState('5');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdPlacement, setCreatedPlacement] = useState<PlacementDetail | null>(null);
    const [showModal, setShowModal] = useState(false);
    const isInstream = !isBanner && INSTREAM_MODES.has(mode);

    const handleSubmit = async (): Promise<void> => {
        setLoading(true);
        setError(null);

        try {
            const base = {
                campaignUuid: creative.campaignUuid,
                creativeUuid: creative.uuid,
            };

            const result = isBanner
                ? await createPlacement({
                    ...base,
                    mode: 'display' as DeliveryMode,
                    initialMuted: false,
                    skippable: false,
                    ...(clickUrl.trim() !== '' && { clickUrl: clickUrl.trim() }),
                    ...(slotId.trim() !== '' && { slotId: slotId.trim() }),
                    ...(sourceAsset?.width != null && { width: sourceAsset.width }),
                    ...(sourceAsset?.height != null && { height: sourceAsset.height }),
                })
                : await createPlacement({
                    ...base,
                    mode,
                    initialMuted,
                    skippable,
                    ...(isInstream
                        ? videoSelector.trim() !== '' && { videoSelector: videoSelector.trim() }
                        : slotId.trim() !== '' && { slotId: slotId.trim() }),
                    ...(skippable && skipOffsetSec !== '' && {
                        skipOffsetSec: Number(skipOffsetSec),
                    }),
                });

            setCreatedPlacement(result);
            setShowModal(true);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания размещения');
        } finally {
            setLoading(false);
        }
    };

    const handleCloseModal = useCallback(() => setShowModal(false), []);

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
        <>
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
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="ipl-mode">
                                Режим доставки
                            </label>
                            <select
                                id="ipl-mode"
                                value={mode}
                                onChange={(e) => setMode(e.target.value as DeliveryMode)}
                                disabled={loading}
                            >
                                {VIDEO_DELIVERY_MODES.map((m) => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <label className={styles.checkRow}>
                            <input
                                type="checkbox"
                                className={styles.checkInput}
                                checked={initialMuted}
                                onChange={(e) => setInitialMuted(e.target.checked)}
                                disabled={loading}
                            />
                            <span className={styles.checkLabel}>Начать без звука</span>
                        </label>

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

                {isInstream ? (
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
                            Пустое поле — реклама перед каждым видео.
                        </span>
                    </div>
                ) : (
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
        </>
    );
}