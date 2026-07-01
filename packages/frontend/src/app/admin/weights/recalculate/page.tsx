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

function RecalibrationInstructions(): React.ReactNode {
  return (
    <details className={styles.instructions}>
      <summary className={styles.instructionsSummary}>
        <span className={styles.instructionsIcon} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" focusable="false">
            <path d="M8 10l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>Как выполнить пересчет</span>
      </summary>

      <div className={styles.instructionsBody}>
        <ol>
          <li>Выберите версию весов, по которой нужно пересчитать Score.</li>
          <li>Отметьте нужные импрешены или нажмите "Выбрать все".</li>
          <li>Нажмите "Пересчитать". Будет показан результат без сохранения в базу.</li>
          <li>Проверьте изменения в таблице и сохраните только если результат корректен.</li>
        </ol>

        <p>
          <strong>Отменить:</strong> удалить черновик без изменений.
        </p>
        <p>
          <strong>Сохранить:</strong> записать новые значения окончательно.
        </p>
      </div>
    </details>
  );
}

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
        <RecalibrationInstructions />

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