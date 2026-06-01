import { cookies } from 'next/headers';
import { fetchImpressions } from '@/lib/api';
import { ImpressionsTableClient } from '@/components/ImpressionsTable';
import { Filters } from '@/components/Filters';
import { ExportButton } from '@/components/ExportButton';
import type { ListParams } from '@/lib/api';

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
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117' }}>

      {/* Шапка */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        backgroundColor: '#1a1f2e',
        borderBottom: '1px solid #2d3748',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#00ff88',
          letterSpacing: '-0.3px',
        }}>
          ⬡ CPMind
        </div>

        <div style={{
          fontSize: '13px',
          color: '#718096',
        }}>
          Импрешены:{' '}
          <span style={{ color: '#e2e8f0', fontWeight: '600' }}>
            {data.total.toLocaleString('ru-RU')}
          </span>
        </div>

        <ExportButton params={params} />
      </div>

      {/* Фильтры */}
      <div style={{ padding: '20px 24px 0' }}>
        <Filters current={params} />
      </div>

      {/* Таблица */}
      <div style={{ padding: '0 24px 24px' }}>
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