import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchWeightsConfigs } from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { WeightsConfigPanel } from '@/components/admin/WeightsConfigPanel';
import styles from '@/styles/weights.module.css';
import recalibStyles from '@/styles/recalibration.module.css';

export default async function WeightsPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const ownUuid = token ? decodeTokenUuid(token) : null;
  const backHref = ownUuid !== null
    ? `/admin/impressions?userUuid=${ownUuid}`
    : '/admin/impressions';

  const configs = await fetchWeightsConfigs(cookieHeader);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.backBtn}>
          ← Назад
        </Link>
        <div className={styles.headerTitle}>Калибровка весов</div>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <WeightsConfigPanel initialConfigs={configs} />

        <div className={recalibStyles.dangerZone}>
          <div className={recalibStyles.dangerZoneTitle}>Пересчитать значения по версии весов</div>
          <div className={recalibStyles.dangerZoneSubtitle}>
            Необратимо изменяет CPMind Score у выбранных импрешенов после сохранения. Действие нельзя отменить — рекомендуем проверить результат на тестовых данных перед применением к реальным показам.
          </div>
          <Link
            href="/admin/weights/recalculate"
            target="_blank"
            rel="noopener noreferrer"
            className={recalibStyles.dangerZoneBtn}
          >
            Пересчитать значения
          </Link>
        </div>
      </div>
    </div>
  );
}