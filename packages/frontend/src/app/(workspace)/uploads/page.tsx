import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchCampaigns } from '@/lib/admin/api';
import { UploadFlow } from '@/components/shared/UploadFlow';
import styles from '@/styles/uploads.module.css';

export default async function UploadsPage(): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const campaigns = await fetchCampaigns(cookieHeader);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.headerTitle}>Загрузка файла</span>
                <Link href="/creatives" className={styles.navLink}>
                    ← Креативы
                </Link>
            </header>

            <div className={styles.content}>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Новый creative</div>
                    {campaigns.length === 0 ? (
                        <div className={styles.noCampaigns}>
                            <span>⚠</span>
                            <span>
                                Нет активных кампаний.{' '}
                                <Link href="/campaigns" className={styles.navLink}>
                                    Создайте кампанию
                                </Link>
                                {' '}перед загрузкой.
                            </span>
                        </div>
                    ) : (
                        <UploadFlow
                            campaigns={campaigns}
                            redirectOnDone="/placements?creativeVersionUuid="
                        />
                    )}
                </div>
            </div>
        </div>
    );
}