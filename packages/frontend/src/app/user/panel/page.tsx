import { cookies } from 'next/headers';
import { fetchUserCampaigns } from '@/lib/user/api';
import { UserCampaignsTable } from '@/components/user/UserCampaignsTable';
import styles from '@/styles/user_panel.module.css';

export default async function UserPanelPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;

  const campaigns = await fetchUserCampaigns(cookieHeader);
  const impressionsTotal = campaigns.reduce((sum, campaign) => sum + campaign.impressionsCount, 0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          CP<span className={styles.logoAccent}>Mind</span>
        </div>
        <div className={styles.headerCenter}>
          Импрешены:{' '}
          <span className={styles.headerCount}>{impressionsTotal.toLocaleString('ru-RU')}</span>
        </div>
      </header>

      <div className={styles.content}>
        <UserCampaignsTable initialCampaigns={campaigns} />
      </div>
    </div>
  );
}