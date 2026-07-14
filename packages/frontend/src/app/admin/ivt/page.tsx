import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchIvtListConfigs, fetchIvtThresholdsConfigs } from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { IvtPanel } from '@/components/admin/IvtPanel';
import styles from '@/styles/ivt.module.css';

export default async function IvtPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const ownUuid = token ? decodeTokenUuid(token) : null;
  const backHref = ownUuid !== null
    ? `/admin/impressions?userUuid=${ownUuid}`
    : '/admin/impressions';

  const [listConfigs, thresholdsConfigs] = await Promise.all([
    fetchIvtListConfigs(cookieHeader),
    fetchIvtThresholdsConfigs(cookieHeader),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.backBtn}>
          ← Назад
        </Link>
        <div className={styles.headerTitle}>Калибровка порогов бот-трафика</div>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <IvtPanel
          listConfigs={listConfigs}
          thresholdsConfigs={thresholdsConfigs}
        />
      </div>
    </div>
  );
}