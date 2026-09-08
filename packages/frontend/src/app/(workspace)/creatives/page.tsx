import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchCreatives } from '@/lib/admin/api';
import { CreativeStatusBadge } from '@/components/shared/CreativeStatusBadge';
import { formatDateTime, formatCreativeType } from '@/lib/config';
import styles from '@/styles/creatives.module.css';

export default async function CreativesPage(): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const creatives = await fetchCreatives(cookieHeader);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.headerTitle}>Все креативы</span>
                <Link href="/campaigns" className={styles.navLink}>
                    ← Кампании
                </Link>
            </header>

            <div className={styles.content}>
                {creatives.length === 0 ? (
                    <div className={styles.empty}>
                        <div>Нет загруженных креативов.</div>
                        <div className={styles.emptyHint}>
                            <Link href="/campaigns" className={styles.navLink}>
                                Выберите кампанию для загрузки →
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {creatives.map((c) => (
                            <Link
                                key={c.uuid}
                                href={`/creatives/${c.uuid}`}
                                className={styles.card}
                            >
                                <div className={styles.cardMain}>
                                    <span className={styles.cardName}>{c.name}</span>
                                    <span className={styles.cardType}>
                                        {formatCreativeType(c.creativeType)}
                                    </span>
                                </div>
                                <CreativeStatusBadge status={c.status} />
                                <span className={styles.cardDate}>
                                    {formatDateTime(c.createdAt)}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}