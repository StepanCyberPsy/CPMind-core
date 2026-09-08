import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchCampaigns } from '@/lib/admin/api';
import { UploadFlowClient } from './UploadFlowClient';
import styles from '@/styles/uploads.module.css';

export default async function CampaignUploadPage({
    params,
}: {
    params: { uuid: string };
}): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;

    const campaigns = await fetchCampaigns(cookieHeader);
    const campaign = campaigns.find((c) => c.uuid === params.uuid);
    if (campaign === undefined) notFound();

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href={`/campaigns/${params.uuid}`} className={styles.navLink}>
                        ← {campaign.name}
                    </Link>
                    <span className={styles.headerTitle}>Загрузка файла</span>
                </div>
            </header>

            <div className={styles.content}>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Новый креатив</div>
                    <UploadFlowClient campaign={campaign} />
                </div>
            </div>
        </div>
    );
}