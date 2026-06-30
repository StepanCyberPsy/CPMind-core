import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { fetchImpressions, fetchWeightsConfigs, fetchTagConstantsConfigs } from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { parseListSearchParams, type ImpressionsSearchParams } from '@/lib/admin/search-params';
import { Filters } from '@/components/admin/Filters';
import { RecalibrationWorkspace } from '@/components/admin/RecalibrationWorkspace';
import type { ListParams } from '@/lib/admin/api';
import styles from '@/styles/recalibration.module.css';

export default async function RecalculatePage({
  searchParams,
}: {
  searchParams: ImpressionsSearchParams;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const ownUuid = token ? decodeTokenUuid(token) : null;

  if (ownUuid === null) {
    redirect('/login');
  }

  const { params, sortBy, sortDir } = parseListSearchParams(searchParams, ownUuid);

  const dropdownScopeParams: ListParams = {
    page: 1,
    limit: 200,
    userUuid: ownUuid,
  };

  const [data, weightsConfigs, tagConstantsConfigs, dropdownData] = await Promise.all([
    fetchImpressions(params, cookieHeader),
    fetchWeightsConfigs(cookieHeader),
    fetchTagConstantsConfigs(cookieHeader),
    fetchImpressions(dropdownScopeParams, cookieHeader),
  ]);

  const campaignOptions = Array.from(new Set(dropdownData.items.map((row) => row.campaign_id))).sort();
  const creativeOptions = Array.from(new Set(dropdownData.items.map((row) => row.creative_id))).sort();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={`/admin/impressions?userUuid=${ownUuid}`} className={styles.backBtn}>
          ← Назад
        </Link>
        <div className={styles.headerTitle}>Пересчёт значений</div>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <details className={styles.instructions} open>
          <summary className={styles.instructionsSummary}>
            <span className={styles.instructionsIcon}>▾</span>
            Как откалибровать значения
          </summary>
          <div className={styles.instructionsBody}>
            <ol>
              <li>Выберите версию весов, по которой нужно пересчитать значения.</li>
              <li>Отметьте нужные импрешены галочками или нажмите «Выбрать все», чтобы взять все подходящие по фильтрам выше.</li>
              <li>Нажмите <strong>«Пересчитать»</strong> — система покажет, как изменится Score, пока ничего не сохраняя.</li>
              <li>Проверьте результат в таблице.</li>
            </ol>
            <p>
              <strong>«Отменить»</strong> — отказаться от пересчёта, ничего не изменится.{' '}
              <strong>«Сохранить»</strong> — записать новые значения в базу данных навсегда; отменить это действие будет нельзя.
            </p>
          </div>
        </details>

        <Filters
          current={params}
          tagConstantsVersions={tagConstantsConfigs.map((c) => c.version)}
          weightsVersions={weightsConfigs.map((c) => c.version)}
          campaignOptions={campaignOptions}
          creativeOptions={creativeOptions}
        />

        <RecalibrationWorkspace
          initialData={data.items}
          totalMatching={data.total}
          pageCount={data.pages}
          currentPage={data.page}
          currentParams={params}
          weightsConfigs={weightsConfigs}
        />
      </div>
    </div>
  );
}