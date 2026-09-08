import { cookies } from 'next/headers';
import { decodeTokenRole } from '@/lib/shared/auth';
import { fetchCampaigns } from '@/lib/admin/api';
import { CampaignListClient } from '@/components/shared/CampaignListClient';
import styles from '@/styles/campaigns.module.css';

export default async function CampaignsPage(): Promise<React.ReactElement> {
    const cookieStore = cookies();
    const token = cookieStore.get('cpmind_token')?.value;
    const cookieHeader = token ? `cpmind_token=${token}` : undefined;
    const role = token ? decodeTokenRole(token) : null;
    const isAdmin = role === 'admin';

    const campaigns = await fetchCampaigns(cookieHeader);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.headerTitle}>Кампании</span>
            </header>
            <div className={styles.content}>
                <CampaignListClient campaigns={campaigns} isAdmin={isAdmin} />
            </div>
        </div>
    );
}