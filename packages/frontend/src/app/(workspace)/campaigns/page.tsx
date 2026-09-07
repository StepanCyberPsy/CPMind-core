import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchCampaigns } from '@/lib/admin/api';
import { CampaignCreateForm } from '@/components/shared/CampaignCreateForm';
import styles from '@/styles/campaigns.module.css';

export default async function CampaignsPage(): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const campaigns = await fetchCampaigns(cookieHeader);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.headerTitle}>Кампании</span>
                <Link href="/admin/creatives" className={styles.navLink}>
                    Креативы →
                </Link>
            </header>

            <div className={styles.content}>
                <CampaignCreateForm />

                {campaigns.length === 0 ? (
                    <div className={styles.empty}>
                        Нет активных кампаний. Создайте первую.
                    </div>
                ) : (
                    <div className={styles.list}>
                        {campaigns.map((c) => (
                            <div key={c.uuid} className={styles.card}>
                                <div className={styles.cardLeft}>
                                    <span className={styles.cardName}>{c.name}</span>
                                    <span className={styles.cardKey}>{c.campaignKey}</span>
                                </div>
                                <span className={styles.cardDate}>
                                    {new Date(c.createdAt).toLocaleDateString('ru-RU')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}