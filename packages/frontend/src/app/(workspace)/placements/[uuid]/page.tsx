import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchPlacementDetail } from '@/lib/admin/api';
import { CreativeStatusBadge } from '@/components/shared/CreativeStatusBadge';
import { PlacementActions } from './PlacementActions';
import styles from '@/styles/placement-detail.module.css';

function formatMode(mode: string): string {
    switch (mode) {
        case 'display': return 'Display';
        case 'instream_preroll': return 'In-stream Pre-roll';
        case 'instream_midroll': return 'In-stream Mid-roll';
        case 'instream_postroll': return 'In-stream Post-roll';
        case 'outstream': return 'Outstream';
        case 'standalone_video': return 'Standalone Video';
        default: return mode;
    }
}

export default async function PlacementDetailPage({
    params,
}: {
    params: { uuid: string };
}): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const placement = await fetchPlacementDetail(params.uuid, cookieHeader);
    if (placement === null) notFound();

    const isReady = placement.currentVersionStatus === 'ready';

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/placements" className={styles.navLink}>
                        ← Размещения
                    </Link>
                    <span className={styles.headerTitle}>
                        {placement.creativeName}
                    </span>
                </div>
            </header>

            <div className={styles.content}>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Статус</div>
                    <div className={styles.statusRow}>
                        <CreativeStatusBadge
                            status={placement.currentVersionStatus ?? 'draft'}
                        />
                        {placement.currentVersionError !== null && (
                            <span style={{ fontSize: 12, color: 'var(--negative)' }}>
                                {placement.currentVersionError}
                            </span>
                        )}
                    </div>
                    {!isReady && (
                        <div className={styles.processingNote}>
                            Embed-код будет доступен после завершения обработки файла.
                        </div>
                    )}
                </div>

                <div className={styles.card}>
                    <div className={styles.cardTitle}>Параметры</div>
                    <div className={styles.metaGrid}>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Режим</span>
                            <span className={styles.metaValue}>{formatMode(placement.mode)}</span>
                        </div>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Тип creative</span>
                            <span className={styles.metaValue}>{placement.creativeType}</span>
                        </div>
                        {placement.width !== null && placement.height !== null && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Размер</span>
                                <span className={styles.metaValue}>
                                    {placement.width} × {placement.height}
                                </span>
                            </div>
                        )}
                        {placement.slotId !== null && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>ID слота</span>
                                <span className={styles.metaMono}>{placement.slotId}</span>
                            </div>
                        )}
                        {placement.videoSelector !== null && (
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Селектор видео</span>
                                <span className={styles.metaMono}>{placement.videoSelector}</span>
                            </div>
                        )}
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Delivery token</span>
                            <span className={styles.metaMono}>{placement.deliveryToken}</span>
                        </div>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Создан</span>
                            <span className={styles.metaValue}>
                                {new Date(placement.createdAt).toLocaleDateString('ru-RU')}
                            </span>
                        </div>
                    </div>
                </div>

                <PlacementActions placement={placement} />
            </div>
        </div>
    );
}