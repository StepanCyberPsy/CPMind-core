import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchImpressions, fetchWeightsConfigs, fetchTagConstantsConfigs } from '@/lib/admin/api';
import { decodeTokenUuid } from '@/lib/shared/auth';
import { parseListSearchParams, type ImpressionsSearchParams } from '@/lib/admin/search-params';
import { Filters } from '@/components/admin/Filters';
import { ImpressionsTableClient } from '@/components/admin/ImpressionsTable';
import { ExportButton } from '@/components/admin/ExportButton';
import type { ListParams } from '@/lib/admin/api';
import styles from '@/styles/impressions.module.css';

export default async function ImpressionsPage({
  searchParams,
}: {
  searchParams: ImpressionsSearchParams;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;
  const ownUuid = token ? decodeTokenUuid(token) : null;
  // Калибровка работает только с данными самого админа — кнопки доступны только во вкладке, явно отфильтрованной на собственный uuid, не в общем списке и не во вкладке другого юзера
  const isOwnScopeView = ownUuid !== null && searchParams.userUuid === ownUuid;

  const { params, sortBy, sortDir } = parseListSearchParams(searchParams);

  const dropdownScopeParams: ListParams = {
    page: 1,
    limit: 200,
    ...(params.userUuid !== undefined && { userUuid: params.userUuid }),
  };

  const [data, weightsConfigs, tagConstantsConfigs, dropdownData] = await Promise.all([
    fetchImpressions(params, cookieHeader),
    fetchWeightsConfigs(cookieHeader),
    fetchTagConstantsConfigs(cookieHeader),
    fetchImpressions(dropdownScopeParams, cookieHeader),
  ]);

  const weightsVersions = weightsConfigs.map((c) => c.version);
  const tagConstantsVersions = tagConstantsConfigs.map((c) => c.version);
  const campaignOptions = Array.from(new Set(dropdownData.items.map((row) => row.campaign_id))).sort();
  const creativeOptions = Array.from(new Set(dropdownData.items.map((row) => row.creative_id))).sort();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/users_panel" className={styles.backBtn}>
          ← К пользователям
        </Link>
        <div className={styles.headerCenter}>
          Импрешены:{' '}
          <span className={styles.headerCount}>
            {data.total.toLocaleString('ru-RU')}
          </span>
        </div>
        <div className={styles.headerActions}>
          {isOwnScopeView && (
            <>
              <Link href="/admin/tag_constants" className={styles.weightsBtn}>
                Калибровка тега
              </Link>
              <Link href="/admin/weights" className={styles.weightsBtn}>
                Калибровка весов
              </Link>
            </>
          )}
          <ExportButton params={params} />
        </div>
      </header>

      <div className={styles.content}>
        <Filters
          current={params}
          tagConstantsVersions={tagConstantsVersions}
          weightsVersions={weightsVersions}
          campaignOptions={campaignOptions}
          creativeOptions={creativeOptions}
        />
        <ImpressionsTableClient
          initialData={data.items}
          pageCount={data.pages}
          currentPage={data.page}
          currentSort={{ sortBy, sortDir }}
          currentParams={params}
        />
      </div>
    </div>
  );
}