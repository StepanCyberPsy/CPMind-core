import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchUserCampaigns, fetchUserImpressions } from '@/lib/user/api';
import { parseUserListSearchParams, type UserImpressionsSearchParams } from '@/lib/user/search-params';
import { UserFilters } from '@/components/user/Filters';
import { UserImpressionsTableClient } from '@/components/user/ImpressionsTable';
import { UserExportButton } from '@/components/user/ExportButton';
import type { UserListParams } from '@/lib/user/api';
import styles from '@/styles/impressions.module.css';

export default async function UserImpressionsPage({
  searchParams,
}: {
  searchParams: UserImpressionsSearchParams;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;

  const { params, sortBy, sortDir } = parseUserListSearchParams(searchParams);

  const dropdownScopeParams: UserListParams = {
    page: 1,
    limit: 200,
    ...(params.campaignId !== undefined && { campaignId: params.campaignId }),
  };

  const [data, campaigns, dropdownData] = await Promise.all([
    fetchUserImpressions(params, cookieHeader),
    fetchUserCampaigns(cookieHeader),
    fetchUserImpressions(dropdownScopeParams, cookieHeader),
  ]);

  const campaignOptions = campaigns.map((campaign) => campaign.campaignId).sort();
  const creativeOptions = Array.from(new Set(dropdownData.items.map((row) => row.creative_id))).sort();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/user/panel" className={styles.backBtn}>
          ← К кампаниям
        </Link>

        <div className={styles.headerCenter}>
          {params.campaignId !== undefined ? (
            <>
              Кампания:{' '}
              <span className={styles.headerCount}>{params.campaignId}</span>
            </>
          ) : (
            <>
              Импрешены:{' '}
              <span className={styles.headerCount}>{data.total.toLocaleString('ru-RU')}</span>
            </>
          )}
        </div>

        <div className={styles.headerActions}>
          <UserExportButton params={params} />
        </div>
      </header>

      <div className={styles.content}>
        <UserFilters
          current={params}
          campaignOptions={campaignOptions}
          creativeOptions={creativeOptions}
          lockCampaignId={params.campaignId !== undefined}
        />
        <UserImpressionsTableClient
          initialData={data.items}
          pageCount={data.pages}
          currentPage={data.page}
          currentSort={{ sortBy, sortDir }}
          currentParams={params}
          {...(params.campaignId !== undefined && { campaignId: params.campaignId })}
        />
      </div>
    </div>
  );
}