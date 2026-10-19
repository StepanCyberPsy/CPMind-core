import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  fetchS1WeibullConfigs,
  fetchS2Configs,
  fetchS3LogisticConfigs,
  fetchS4Configs,
  fetchS5LogisticConfigs,
  fetchS6LogisticConfigs,
  fetchS7QuantileConfigs,
} from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { SignalModelsPanel } from '@/components/admin/SignalModelsPanel';
import styles from '@/styles/signals.module.css';

export default async function SignalsPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const ownUuid = token ? decodeTokenUuid(token) : null;
  const backHref = ownUuid !== null
    ? `/admin/impressions?userUuid=${ownUuid}`
    : '/admin/impressions';

  const [s1, s2, s3, s4, s5, s6, s7] = await Promise.all([
    fetchS1WeibullConfigs(cookieHeader),
    fetchS2Configs(cookieHeader),
    fetchS3LogisticConfigs(cookieHeader),
    fetchS4Configs(cookieHeader),
    fetchS5LogisticConfigs(cookieHeader),
    fetchS6LogisticConfigs(cookieHeader),
    fetchS7QuantileConfigs(cookieHeader),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.backBtn}>
          ← Назад
        </Link>
        <div className={styles.headerTitle}>Калибровка данных сигналов</div>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <SignalModelsPanel
          initialS1={s1}
          initialS2={s2}
          initialS3={s3}
          initialS4={s4}
          initialS5={s5}
          initialS6={s6}
          initialS7={s7}
        />
      </div>
    </div>
  );
}
