'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { setPlacementActive, updatePlacement } from '@/lib/admin/api';
import { PlacementEmbedModal } from '@/components/shared/PlacementEmbedModal';
import { PlacementCreativeSetEditor } from '@/components/shared/PlacementCreativeSetEditor';
import {
    STICKY_CORNER_OPTIONS,
    AUTOPLAY_MODE_OPTIONS,
    DOMAIN_ENFORCEMENT_OPTIONS,
    resolveDefaultInitialMutedByFormat,
} from '@/lib/config';
import type { PlacementDetail } from '@/lib/admin/api';
import type { UpdatePlacementPayload } from '@cpmind/shared';
import styles from '@/styles/placement-detail.module.css';

interface Props {
    placement: PlacementDetail;
}

type SoundChoice =
    | 'default'
    | 'sound_on'
    | 'muted';

function resolveSoundChoice(placement: PlacementDetail): SoundChoice {
    if (!placement.initialMutedOverridden) return 'default';
    return placement.initialMuted ? 'muted' : 'sound_on';
}

export function PlacementActions({ placement }: Props): React.ReactElement {
    const router = useRouter();
    const [showEmbed, setShowEmbed] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editingSet, setEditingSet] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [soundChoice, setSoundChoice] = useState<SoundChoice>(resolveSoundChoice(placement));
    const [autoplayMode, setAutoplayMode] = useState(placement.autoplayMode ?? 'autoplay');
    const [skippable, setSkippable] = useState(placement.skippable);
    const [skipOffsetSec, setSkipOffsetSec] = useState(String(placement.skipOffsetSec ?? 5));
    const [stickyCorner, setStickyCorner] = useState(placement.stickyCorner ?? 'bottom_right');
    const [stickyOffsetX, setStickyOffsetX] = useState(String(placement.stickyOffsetX ?? 16));
    const [stickyOffsetY, setStickyOffsetY] = useState(String(placement.stickyOffsetY ?? 16));
    const [stickyWidth, setStickyWidth] = useState(String(placement.stickyWidth ?? 320));
    const [stickyHeight, setStickyHeight] = useState(String(placement.stickyHeight ?? 180));
    const [publisherDomain, setPublisherDomain] = useState(placement.publisherDomain ?? '');
    const [allowedDomains, setAllowedDomains] = useState(
        placement.allowedDomains !== null ? placement.allowedDomains.join(', ') : '',
    );
    const [domainEnforcement, setDomainEnforcement] = useState(placement.domainEnforcement);

    const isReady = placement.currentVersionStatus === 'ready';
    const isVideo = placement.format === 'instream' || placement.format === 'outstream';
    const isInstream = placement.format === 'instream';
    const isOutstream = placement.format === 'outstream';
    const isSticky = placement.subtype === 'sticky';

    const handleToggleActive = async (): Promise<void> => {
        setToggling(true);
        setError(null);
        try {
            await setPlacementActive(placement.uuid, !placement.isActive);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка изменения статуса');
        } finally {
            setToggling(false);
        }
    };

    // null очищает значение на сервере, undefined оставляет прежнее
    function resolveInitialMuted(): boolean | undefined {
        if (soundChoice === 'default') return undefined;
        return soundChoice === 'muted';
    }

    function parseAllowedDomains(): string[] | null {
        const parsed = allowedDomains
            .split(/[\s,]+/)
            .map((domain) => domain.trim().toLowerCase())
            .filter((domain) => domain !== '');

        return parsed.length > 0 ? parsed : null;
    }

    function buildPayload(): UpdatePlacementPayload {
        const initialMuted = resolveInitialMuted();
        const domains = parseAllowedDomains();
        const trimmedDomain = publisherDomain.trim().toLowerCase();

        return {
            ...(initialMuted !== undefined && { initialMuted }),
            ...(isInstream && {
                skippable,
                skipOffsetSec: skippable && skipOffsetSec !== ''
                    ? Number(skipOffsetSec)
                    : null,
            }),
            ...(isOutstream && {
                autoplayMode: autoplayMode as 'autoplay' | 'click_to_play',
            }),
            ...(isSticky && {
                stickyCorner: stickyCorner as 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right',
                stickyOffsetX: Number(stickyOffsetX),
                stickyOffsetY: Number(stickyOffsetY),
                stickyWidth: Number(stickyWidth),
                stickyHeight: Number(stickyHeight),
            }),
            publisherDomain: trimmedDomain !== '' ? trimmedDomain : null,
            allowedDomains: domains,
            domainEnforcement: domainEnforcement as 'off' | 'monitor' | 'block',
        };
    }

    const handleSave = async (): Promise<void> => {
        setSaving(true);
        setError(null);
        try {
            await updatePlacement(placement.uuid, buildPayload());
            setEditing(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = useCallback((): void => {
        setSoundChoice(resolveSoundChoice(placement));
        setAutoplayMode(placement.autoplayMode ?? 'autoplay');
        setSkippable(placement.skippable);
        setSkipOffsetSec(String(placement.skipOffsetSec ?? 5));
        setStickyCorner(placement.stickyCorner ?? 'bottom_right');
        setStickyOffsetX(String(placement.stickyOffsetX ?? 16));
        setStickyOffsetY(String(placement.stickyOffsetY ?? 16));
        setStickyWidth(String(placement.stickyWidth ?? 320));
        setStickyHeight(String(placement.stickyHeight ?? 180));
        setPublisherDomain(placement.publisherDomain ?? '');
        setAllowedDomains(
            placement.allowedDomains !== null ? placement.allowedDomains.join(', ') : '',
        );
        setDomainEnforcement(placement.domainEnforcement);
        setError(null);
        setEditing(false);
    }, [placement]);

    const handleCloseModal = useCallback(() => setShowEmbed(false), []);
    const handleSetDone = useCallback(() => setEditingSet(false), []);

    return (
        <>
            {editingSet && (
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Набор роликов</div>
                    <PlacementCreativeSetEditor
                        placement={placement}
                        onDone={handleSetDone}
                    />
                </div>
            )}

            {editing && (
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Настройки</div>

                    <div className={styles.editForm}>
                        {isVideo && (
                            <div className={styles.editField}>
                                <label className={styles.editLabel} htmlFor="pa-sound">
                                    Звук при старте
                                </label>
                                <select
                                    id="pa-sound"
                                    value={soundChoice}
                                    onChange={(e) => setSoundChoice(e.target.value as SoundChoice)}
                                    disabled={saving}
                                >
                                    <option value="default">
                                        {resolveDefaultInitialMutedByFormat(placement.format ?? 'outstream')
                                            ? 'По умолчанию — без звука'
                                            : 'По умолчанию — со звуком'}
                                    </option>
                                    <option value="sound_on">Со звуком</option>
                                    <option value="muted">Без звука</option>
                                </select>
                            </div>
                        )}

                        {isOutstream && (
                            <div className={styles.editField}>
                                <label className={styles.editLabel} htmlFor="pa-autoplay">
                                    Запуск ролика
                                </label>
                                <select
                                    id="pa-autoplay"
                                    value={autoplayMode}
                                    onChange={(e) => setAutoplayMode(e.target.value)}
                                    disabled={saving}
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
                                <label className={styles.editCheckRow}>
                                    <input
                                        type="checkbox"
                                        checked={skippable}
                                        onChange={(e) => setSkippable(e.target.checked)}
                                        disabled={saving}
                                    />
                                    <span>Можно пропустить</span>
                                </label>

                                {skippable && (
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="pa-skip">
                                            Пропуск через (сек)
                                        </label>
                                        <input
                                            id="pa-skip"
                                            type="number"
                                            min={0}
                                            max={30}
                                            step={1}
                                            value={skipOffsetSec}
                                            onChange={(e) => setSkipOffsetSec(e.target.value)}
                                            disabled={saving}
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {isSticky && (
                            <>
                                <div className={styles.editField}>
                                    <label className={styles.editLabel} htmlFor="pa-corner">
                                        Угол привязки
                                    </label>
                                    <select
                                        id="pa-corner"
                                        value={stickyCorner}
                                        onChange={(e) => setStickyCorner(e.target.value)}
                                        disabled={saving}
                                    >
                                        {STICKY_CORNER_OPTIONS.map((item) => (
                                            <option key={item.value} value={item.value}>
                                                {item.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.editRow}>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="pa-offset-x">
                                            Отступ по горизонтали
                                        </label>
                                        <input
                                            id="pa-offset-x"
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={stickyOffsetX}
                                            onChange={(e) => setStickyOffsetX(e.target.value)}
                                            disabled={saving}
                                        />
                                    </div>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="pa-offset-y">
                                            Отступ по вертикали
                                        </label>
                                        <input
                                            id="pa-offset-y"
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={stickyOffsetY}
                                            onChange={(e) => setStickyOffsetY(e.target.value)}
                                            disabled={saving}
                                        />
                                    </div>
                                </div>

                                <div className={styles.editRow}>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="pa-width">
                                            Ширина (px)
                                        </label>
                                        <input
                                            id="pa-width"
                                            type="number"
                                            min={120}
                                            step={10}
                                            value={stickyWidth}
                                            onChange={(e) => setStickyWidth(e.target.value)}
                                            disabled={saving}
                                        />
                                    </div>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="pa-height">
                                            Высота (px)
                                        </label>
                                        <input
                                            id="pa-height"
                                            type="number"
                                            min={80}
                                            step={10}
                                            value={stickyHeight}
                                            onChange={(e) => setStickyHeight(e.target.value)}
                                            disabled={saving}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className={styles.editField}>
                            <label className={styles.editLabel} htmlFor="pa-domain">
                                Домен площадки
                            </label>
                            <input
                                id="pa-domain"
                                type="text"
                                value={publisherDomain}
                                onChange={(e) => setPublisherDomain(e.target.value)}
                                placeholder="Определяется автоматически"
                                disabled={saving}
                            />
                        </div>

                        <div className={styles.editField}>
                            <label className={styles.editLabel} htmlFor="pa-allowed">
                                Разрешённые домены
                            </label>
                            <input
                                id="pa-allowed"
                                type="text"
                                value={allowedDomains}
                                onChange={(e) => setAllowedDomains(e.target.value)}
                                placeholder="example.com, partner.ru"
                                disabled={saving}
                            />
                        </div>

                        {allowedDomains.trim() !== '' && (
                            <div className={styles.editField}>
                                <label className={styles.editLabel} htmlFor="pa-enforcement">
                                    Показ с чужого домена
                                </label>
                                <select
                                    id="pa-enforcement"
                                    value={domainEnforcement}
                                    onChange={(e) => setDomainEnforcement(e.target.value)}
                                    disabled={saving}
                                >
                                    {DOMAIN_ENFORCEMENT_OPTIONS.map((item) => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className={styles.editActions}>
                            <button
                                type="button"
                                className={styles.embedBtn}
                                onClick={() => { void handleSave(); }}
                                disabled={saving}
                            >
                                {saving ? 'Сохранение…' : 'Сохранить'}
                            </button>
                            <button
                                type="button"
                                className={styles.cancelBtn}
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.card}>
                <div className={styles.cardTitle}>Действия</div>
                <div className={styles.actionsColumn}>
                    {isReady && (
                        <button
                            type="button"
                            className={styles.embedBtn}
                            onClick={() => setShowEmbed(true)}
                        >
                            Получить embed-код
                        </button>
                    )}

                    {!editing && (
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => setEditing(true)}
                        >
                            Изменить настройки
                        </button>
                    )}

                    {isVideo && !editingSet && (
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => setEditingSet(true)}
                        >
                            {placement.creativeSet.length > 0
                                ? 'Изменить набор роликов'
                                : 'Настроить набор роликов'}
                        </button>
                    )}

                    <div className={styles.toggleRow}>
                        <span className={styles.toggleLabel}>
                            Размещение {placement.isActive ? 'активно' : 'неактивно'}
                        </span>
                        <button
                            type="button"
                            className={`${styles.toggleBtn} ${placement.isActive ? styles.toggleActive : styles.toggleInactive}`}
                            onClick={() => { void handleToggleActive(); }}
                            disabled={toggling}
                        >
                            {toggling
                                ? '…'
                                : placement.isActive
                                    ? 'Деактивировать'
                                    : 'Активировать'}
                        </button>
                    </div>

                    {error !== null && (
                        <div className={styles.errorText}>{error}</div>
                    )}
                </div>
            </div>

            {showEmbed && (
                <PlacementEmbedModal
                    placement={placement}
                    onClose={handleCloseModal}
                />
            )}
        </>
    );
}