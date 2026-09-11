'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPlacementActive } from '@/lib/admin/api';
import { CopyableText } from './CopyableText';
import { PlacementEmbedModal } from './PlacementEmbedModal';
import { formatDeliveryMode } from '@/lib/config';
import type { PlacementDetail } from '@/lib/admin/api';
import styles from '@/styles/creative-placement-panel.module.css';

interface Props {
    placement: PlacementDetail;
}

export function CreativePlacementPanel({ placement }: Props): React.ReactElement {
    const router = useRouter();
    const [showModal, setShowModal] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isReady = placement.currentVersionStatus === 'ready';

    const handleToggle = async (): Promise<void> => {
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

    const handleCloseModal = useCallback(() => setShowModal(false), []);

    return (
        <>
            <div className={styles.root}>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Режим</span>
                    <span className={styles.infoValue}>
                        {formatDeliveryMode(placement.mode)}
                    </span>
                </div>

                {placement.slotId !== null && (
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>ID слота</span>
                        <CopyableText text={placement.slotId} />
                    </div>
                )}

                {placement.videoSelector !== null && (
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Селектор видео</span>
                        <CopyableText text={placement.videoSelector} />
                    </div>
                )}

                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Delivery token</span>
                    <CopyableText
                        text={placement.deliveryToken}
                        truncate
                    />
                </div>

                <div className={styles.infoRow}>
                    <span
                        className={`${styles.statusDot} ${placement.isActive ? styles.statusActive : styles.statusInactive}`}
                        aria-hidden="true"
                    />
                    <span className={styles.infoValue}>
                        {placement.isActive ? 'Активно' : 'Неактивно'}
                    </span>
                </div>

                <div className={styles.actions}>
                    {isReady && (
                        <button
                            type="button"
                            className={styles.embedBtn}
                            onClick={() => setShowModal(true)}
                        >
                            Embed-код
                        </button>
                    )}
                    <button
                        type="button"
                        className={placement.isActive ? styles.toggleActive : styles.toggleInactive}
                        onClick={() => { void handleToggle(); }}
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
                    <span className={styles.error}>{error}</span>
                )}
            </div>

            {showModal && (
                <PlacementEmbedModal
                    placement={placement}
                    onClose={handleCloseModal}
                />
            )}
        </>
    );
}