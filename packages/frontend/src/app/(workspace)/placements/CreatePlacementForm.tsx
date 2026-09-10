'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    fetchCampaigns,
    fetchCreatives,
    createPlacement,
} from '@/lib/admin/api';
import type { CampaignRow, CreativeListItem } from '@/lib/admin/api';
import type { DeliveryMode } from '@cpmind/shared';
import styles from '@/styles/placements.module.css';

const DELIVERY_MODES: Array<{ value: DeliveryMode; label: string }> = [
    { value: 'display', label: 'Display' },
    { value: 'outstream', label: 'Outstream' },
    { value: 'instream_preroll', label: 'In-stream Pre-roll' },
    { value: 'instream_midroll', label: 'In-stream Mid-roll' },
    { value: 'instream_postroll', label: 'In-stream Post-roll' },
    { value: 'standalone_video', label: 'Standalone Video' },
];

const INSTREAM_MODES = new Set<DeliveryMode>([
    'instream_preroll',
    'instream_midroll',
    'instream_postroll',
]);

interface Props {
    preselectedCreativeUuid?: string | undefined;
}

export function CreatePlacementForm({ preselectedCreativeUuid }: Props): React.ReactElement {
    const router = useRouter();
    const [open, setOpen] = useState(preselectedCreativeUuid !== undefined);
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    const [creatives, setCreatives] = useState<CreativeListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [campaignUuid, setCampaignUuid] = useState('');
    const [creativeUuid, setCreativeUuid] = useState(preselectedCreativeUuid ?? '');
    const [mode, setMode] = useState<DeliveryMode>('display');
    const [slotId, setSlotId] = useState('');
    const [videoSelector, setVideoSelector] = useState('');

    const isInstream = INSTREAM_MODES.has(mode);

    const openForm = async (): Promise<void> => {
        if (open) { setOpen(false); return; }
        setLoading(true);
        try {
            const [c, cr] = await Promise.all([fetchCampaigns(), fetchCreatives()]);
            setCampaigns(c);
            setCreatives(cr);
            if (c[0] && campaignUuid === '') setCampaignUuid(c[0].uuid);
            if (cr[0] && creativeUuid === '') setCreativeUuid(cr[0].uuid);
            setOpen(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        if (campaignUuid === '' || creativeUuid === '') return;

        setSubmitting(true);
        setError(null);

        try {
            const result = await createPlacement({
                campaignUuid,
                creativeUuid,
                mode,
                initialMuted: true,
                skippable: false,
                ...(!isInstream && slotId !== '' && { slotId }),
                ...(isInstream && videoSelector !== '' && { videoSelector }),
            });
            router.push(`/placements/${result.uuid}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания размещения');
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.formWrap}>
            <button
                type="button"
                className={styles.createBtn}
                onClick={() => { void openForm(); }}
                disabled={loading}
            >
                {loading ? 'Загрузка…' : open ? '× Свернуть' : '+ Новое размещение'}
            </button>

            {error !== null && (
                <div className={styles.errorBox}>{error}</div>
            )}

            {open && (
                <form
                    onSubmit={(e) => { void handleSubmit(e); }}
                    className={styles.form}
                >
                    <div className={styles.formRow}>
                        <label className={styles.formLabel} htmlFor="pl-campaign">
                            Кампания
                        </label>
                        <select
                            id="pl-campaign"
                            className={styles.formSelect}
                            value={campaignUuid}
                            onChange={(e) => setCampaignUuid(e.target.value)}
                            disabled={submitting}
                        >
                            {campaigns.map((c) => (
                                <option key={c.uuid} value={c.uuid}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formRow}>
                        <label className={styles.formLabel} htmlFor="pl-creative">
                            Креатив
                        </label>
                        <select
                            id="pl-creative"
                            className={styles.formSelect}
                            value={creativeUuid}
                            onChange={(e) => setCreativeUuid(e.target.value)}
                            disabled={submitting}
                        >
                            {creatives.map((c) => (
                                <option key={c.uuid} value={c.uuid}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formRow}>
                        <label className={styles.formLabel} htmlFor="pl-mode">
                            Режим доставки
                        </label>
                        <select
                            id="pl-mode"
                            className={styles.formSelect}
                            value={mode}
                            onChange={(e) => setMode(e.target.value as DeliveryMode)}
                            disabled={submitting}
                        >
                            {DELIVERY_MODES.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    {isInstream ? (
                        <div className={styles.formRow}>
                            <label className={styles.formLabel} htmlFor="pl-video-selector">
                                CSS-селектор видео
                            </label>
                            <input
                                id="pl-video-selector"
                                type="text"
                                className={styles.formInput}
                                value={videoSelector}
                                onChange={(e) => setVideoSelector(e.target.value)}
                                disabled={submitting}
                                placeholder=".entry-content video"
                            />
                            <span className={styles.formHint}>
                                Ограничивает привязку конкретными видео на странице.
                                Пустое поле — реклама перед каждым видео.
                            </span>
                        </div>
                    ) : (
                        <div className={styles.formRow}>
                            <label className={styles.formLabel} htmlFor="pl-slot-id">
                                ID слота
                            </label>
                            <input
                                id="pl-slot-id"
                                type="text"
                                className={styles.formInput}
                                value={slotId}
                                onChange={(e) => setSlotId(e.target.value)}
                                disabled={submitting}
                                placeholder="cpmind-sidebar"
                            />
                            <span className={styles.formHint}>
                                Идентификатор пустого div на странице издателя, внутрь которого
                                монтируется креатив. Пустое поле — креатив добавляется в конец страницы.
                            </span>
                        </div>
                    )}

                    <div className={styles.formActions}>
                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={submitting || campaignUuid === '' || creativeUuid === ''}
                        >
                            {submitting ? 'Создание…' : 'Создать размещение'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}