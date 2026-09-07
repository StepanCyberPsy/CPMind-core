'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { setPlacementActive } from '@/lib/admin/api';
import { PlacementEmbedModal } from '@/components/shared/PlacementEmbedModal';
import type { PlacementDetail } from '@/lib/admin/api';
import styles from '@/styles/placement-detail.module.css';

interface Props {
    placement: PlacementDetail;
}

export function PlacementActions({ placement }: Props): React.ReactElement {
    const router = useRouter();
    const [showEmbed, setShowEmbed] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isReady = placement.currentVersionStatus === 'ready';

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

    const handleCloseModal = useCallback(() => setShowEmbed(false), []);

    return (
        <>
            <div className={styles.card}>
                <div className={styles.cardTitle}>Действия</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {isReady && (
                        <button
                            type="button"
                            className={styles.embedBtn}
                            onClick={() => setShowEmbed(true)}
                        >
                            Получить embed-код
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
                        <div style={{ fontSize: 13, color: 'var(--negative)' }}>{error}</div>
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