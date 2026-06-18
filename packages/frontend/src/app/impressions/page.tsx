import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchImpressions } from '@/lib/api';
import { ImpressionsTableClient } from '@/components/ImpressionsTable';
import { Filters } from '@/components/Filters';
import { ExportButton } from '@/components/ExportButton';
import type { ListParams } from '@/lib/api';
import styles from '@/styles/impressions.module.css';

interface SearchParams {
  page?: string;
  campaignId?: string;
  creativeId?: string;
  deviceType?: string;
  isSuspicious?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
}

export default async function ImpressionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('cpmind_token')?.value;
  const cookieHeader = token ? `cpmind_token=${token}` : undefined;

  const params: ListParams = {
    page: Number(searchParams.page ?? 1),
    limit: 50,
    sortBy: (searchParams.sortBy as 'createdAt' | 'scoreFinal') ?? 'createdAt',
    sortDir: (searchParams.sortDir as 'asc' | 'desc') ?? 'desc',
    ...(searchParams.campaignId && { campaignId: searchParams.campaignId }),
    ...(searchParams.creativeId && { creativeId: searchParams.creativeId }),
    ...(searchParams.deviceType && { deviceType: searchParams.deviceType }),
    ...(searchParams.dateFrom && { dateFrom: searchParams.dateFrom }),
    ...(searchParams.dateTo && { dateTo: searchParams.dateTo }),
    ...(searchParams.isSuspicious !== undefined && {
      isSuspicious: searchParams.isSuspicious === 'true',
    }),
  };

  const data = await fetchImpressions(params, cookieHeader);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          CP<span className={styles.logoAccent}>Mind</span>
        </div>
        <div className={styles.headerCenter}>
          Импрешены:{' '}
          <span className={styles.headerCount}>
            {data.total.toLocaleString('ru-RU')}
          </span>
        </div>
        <div className={styles.headerActions}>
          <Link href="/weights" className={styles.weightsBtn}>
            Калибровка весов
          </Link>
          <ExportButton params={params} />
        </div>
      </header>

      <div className={styles.content}>
        <Filters current={params} />
        <ImpressionsTableClient
          initialData={data.items}
          pageCount={data.pages}
          currentPage={data.page}
          currentSort={{
            sortBy: params.sortBy ?? 'createdAt',
            sortDir: params.sortDir ?? 'desc',
          }}
        />
      </div>
    </div>
  );
}