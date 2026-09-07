import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchPlacements } from '@/lib/admin/api';
import { CreatePlacementForm } from './CreatePlacementForm';
import styles from '@/styles/placements.module.css';

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

interface SearchParams {
    creativeUuid?: string;
    creativeVersionUuid?: string;
}

export default async function PlacementsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const placements = await fetchPlacements(cookieHeader);

    const preselectedCreativeUuid = searchParams.creativeUuid;
    const fromUpload = searchParams.creativeVersionUuid !== undefined;

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.headerTitle}>Размещения</span>
                <div className={styles.headerActions}>
                    <Link href="/creatives" className={styles.navLink}>
                        ← Креативы
                    </Link>
                </div>
            </header>

            <div className={styles.content}>
                {fromUpload && (
                    <div className={styles.notice}>
                        Файл успешно загружен. Создайте placement чтобы получить embed-код.
                    </div>
                )}

                <CreatePlacementForm preselectedCreativeUuid={preselectedCreativeUuid} />

                {placements.length === 0 ? (
                    <div className={styles.empty}>
                        Нет созданных размещений.
                    </div>
                ) : (
                    <div className={styles.list}>
                        {placements.map((p) => (
                            <Link
                                key={p.uuid}
                                href={`/placements/${p.uuid}`}
                                className={styles.card}
                            >
                                <span
                                    className={`${styles.statusDot} ${p.isActive ? styles.statusActive : styles.statusInactive}`}
                                    aria-label={p.isActive ? 'Активен' : 'Неактивен'}
                                />
                                <div className={styles.cardMain}>
                                    <span className={styles.cardName}>{p.creativeName}</span>
                                    <div className={styles.cardMeta}>
                                        <span className={styles.cardMode}>
                                            {formatMode(p.mode)}
                                        </span>
                                    </div>
                                </div>
                                <span className={styles.cardDate}>
                                    {new Date(p.createdAt).toLocaleDateString('ru-RU')}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}