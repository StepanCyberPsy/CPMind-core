import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchTagConstantsConfigs } from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { TagConstantsPanel } from '@/components/admin/TagConstantsPanel';
import styles from '@/styles/tag-constants.module.css';

export default async function TagConstantsPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const ownUuid = token ? decodeTokenUuid(token) : null;
  const backHref = ownUuid !== null ? `/admin/impressions?userUuid=${ownUuid}` : '/admin/impressions';

  const configs = await fetchTagConstantsConfigs(cookieHeader);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.backBtn}>
          ← Назад
        </Link>
        <div className={styles.headerTitle}>Калибровка констант тега</div>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <TagConstantsPanel initialConfigs={configs} />

        <div className={styles.warningZone}>
          <div className={styles.warningZoneTitle}>Важно при переходе на новую версию</div>
          <div className={styles.warningZoneText}>
            Создание новой версии констант не применяется к уже размещённым тегам автоматически.
            Чтобы перевести тег клиента на новую версию, необходима ручная замена адреса{' '}
            <code className={styles.warningZoneCode}>&lt;script src&gt;</code>
            {' '}в HTML-разметке страницы. Старые версии тега продолжают собирать данные
            до тех пор, пока они не будут явно деактивированы.
          </div>
        </div>
      </div>
    </div>
  );
}