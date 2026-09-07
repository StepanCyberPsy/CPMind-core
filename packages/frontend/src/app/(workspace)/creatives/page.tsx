import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchCreatives } from '@/lib/admin/api';
import { CreativeStatusBadge } from '@/components/shared/CreativeStatusBadge';
import styles from '@/styles/creatives.module.css';

function formatCreativeType(type: string): string {
    switch (type) {
        case 'banner_static': return 'Статичный баннер';
        case 'banner_gif': return 'GIF-баннер';
        case 'banner_html5': return 'HTML5-баннер';
        case 'video_creative': return 'Видео';
        default: return type;
    }
}

export default async function CreativesPage(): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const creatives = await fetchCreatives(cookieHeader);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.headerTitle}>Креативы</span>
                <div className={styles.headerActions}>
                    <Link href="/campaigns" className={styles.navLink}>
                        ← Кампании
                    </Link>
                    <Link href="/uploads" className={styles.primaryLink}>
                        Загрузить
                    </Link>
                </div>
            </header>

            <div className={styles.content}>
                {creatives.length === 0 ? (
                    <div className={styles.empty}>
                        <div>Нет загруженных креативов.</div>
                        <div className={styles.emptyHint}>
                            <Link href="/uploads" className={styles.navLink}>
                                Загрузите первый файл →
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {creatives.map((c) => (
                            <Link
                                key={c.uuid}
                                href={`/placements?creativeUuid=${c.uuid}`}
                                className={styles.card}
                            >
                                <div className={styles.cardMain}>
                                    <span className={styles.cardName}>{c.name}</span>
                                    <div className={styles.cardMeta}>
                                        <span className={styles.cardType}>
                                            {formatCreativeType(c.creativeType)}
                                        </span>
                                    </div>
                                </div>
                                <CreativeStatusBadge status={c.status} />
                                <span className={styles.cardDate}>
                                    {new Date(c.createdAt).toLocaleDateString('ru-RU')}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}