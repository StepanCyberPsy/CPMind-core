import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchWeightsConfigs } from '@/lib/api';
import { WeightsConfigPanel } from '@/components/WeightsConfigPanel';
import styles from '@/styles/weights.module.css';

export default async function WeightsPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;

  const configs = await fetchWeightsConfigs(cookieHeader);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/impressions" className={styles.backBtn}>
          ← Назад
        </Link>
        <div className={styles.headerTitle}>Калибровка весов</div>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <WeightsConfigPanel initialConfigs={configs} />
      </div>
    </div>
  );
}