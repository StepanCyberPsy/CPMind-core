'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserCampaignStatsRow } from '@cpmind/shared';
import type { UserCampaignsTableProps } from '@/lib/user/types';
import styles from '@/styles/user_panel.module.css';

type SortColumn = 'latest' | 'campaign' | 'creatives' | 'impressions' | 'avgScore' | 'desktop' | 'mobile' | 'tablet';

interface SortState {
  column: SortColumn;
  dir: 'asc' | 'desc';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function getSortValue(row: UserCampaignStatsRow, column: SortColumn): number | string | null {
  if (column === 'latest') return new Date(row.latestImpressionAt).getTime();
  if (column === 'campaign') return row.campaignId;
  if (column === 'creatives') return row.creativesCount;
  if (column === 'impressions') return row.impressionsCount;
  if (column === 'desktop') return row.desktopRatioPct;
  if (column === 'mobile') return row.mobileRatioPct;
  if (column === 'tablet') return row.tabletRatioPct;
  return row.avgScore;
}

function compareCampaigns(a: UserCampaignStatsRow, b: UserCampaignStatsRow, sort: SortState): number {
  const aValue = getSortValue(a, sort.column);
  const bValue = getSortValue(b, sort.column);

  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  if (typeof aValue === 'string' && typeof bValue === 'string') {
    return sort.dir === 'asc'
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
  }

  const diff = Number(aValue) - Number(bValue);
  return sort.dir === 'asc' ? diff : -diff;
}

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (column: SortColumn) => void;
}

function SortableHeader({ label, column, sort, onSort }: SortableHeaderProps) {
  const isActive = sort.column === column;
  return (
    <th className={`${styles.th} ${styles.thSortable}`} onClick={() => onSort(column)}>
      {label}
      <span className={`${styles.sortIcon} ${isActive ? styles.sortIconActive : ''}`}>
        {isActive ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  );
}

function formatScore(value: number | null): React.ReactNode {
  if (value === null) return <span className={styles.cellNull}>—</span>;

  const cls = value >= 70 ? styles.scorePositive : value >= 40 ? styles.scoreModerate : styles.scoreNegative;
  return <span className={`${styles.cellMono} ${cls}`}>{value.toFixed(1)}</span>;
}

function formatRatio(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function UserCampaignsTable({ initialCampaigns }: UserCampaignsTableProps) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState>({ column: 'latest', dir: 'desc' });

  function handleSort(column: SortColumn): void {
    setSort((prev) => prev.column === column
      ? { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { column, dir: 'desc' });
  }

  function onAllImpressionsClick(): void {
    router.push('/user/impressions');
  }

  function onCampaignClick(campaignId: string): void {
    router.push(`/user/impressions?campaignId=${encodeURIComponent(campaignId)}`);
  }

  const sortedRows = useMemo(() => {
    return [...initialCampaigns].sort((a, b) => compareCampaigns(a, b, sort));
  }, [initialCampaigns, sort]);

  const totalImpressions = useMemo(() => {
    return initialCampaigns.reduce((sum, campaign) => sum + campaign.impressionsCount, 0);
  }, [initialCampaigns]);

  return (
    <>
      <div className={styles.toolbar}>
        <button type="button" className={styles.tagBuilderBtn}>
          Собрать код тега
        </button>
      </div>

      <div className={styles.wrapper}>
        <button type="button" className={styles.allImpressionsRow} onClick={onAllImpressionsClick}>
          <span className={styles.allImpressionsLabel}>
            Все импрешены
            <span className={styles.allImpressionsCount}>
              {totalImpressions.toLocaleString('ru-RU')}
            </span>
          </span>
          <span className={styles.allImpressionsArrow}>→</span>
        </button>

        <div className={styles.scrollContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableHeader label="Дата" column="latest" sort={sort} onSort={handleSort} />
                <SortableHeader label="ID Кампании" column="campaign" sort={sort} onSort={handleSort} />
                <SortableHeader label="Креативы" column="creatives" sort={sort} onSort={handleSort} />
                <SortableHeader label="Импрешены" column="impressions" sort={sort} onSort={handleSort} />
                <SortableHeader label="Средний Score" column="avgScore" sort={sort} onSort={handleSort} />
                <th className={`${styles.th} ${styles.thDeviceGroup}`} colSpan={3}>
                  Устройства
                </th>
              </tr>
              <tr>
                <th className={`${styles.th} ${styles.thSub}`} />
                <th className={`${styles.th} ${styles.thSub}`} />
                <th className={`${styles.th} ${styles.thSub}`} />
                <th className={`${styles.th} ${styles.thSub}`} />
                <th className={`${styles.th} ${styles.thSub}`} />
                <SortableHeader label="Desktop" column="desktop" sort={sort} onSort={handleSort} />
                <SortableHeader label="Mobile" column="mobile" sort={sort} onSort={handleSort} />
                <SortableHeader label="Tablet" column="tablet" sort={sort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    Кампании не найдены
                  </td>
                </tr>
              ) : (
                sortedRows.map((campaign) => (
                  <tr key={campaign.campaignId} className={styles.tr} onClick={() => onCampaignClick(campaign.campaignId)}>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{formatDate(campaign.latestImpressionAt)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.campaignId}>{campaign.campaignId}</span>
                    </td>
                    <td className={styles.td}>{campaign.creativesCount}</td>
                    <td className={styles.td}>{campaign.impressionsCount}</td>
                    <td className={styles.td}>{formatScore(campaign.avgScore)}</td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{formatRatio(campaign.desktopRatioPct)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{formatRatio(campaign.mobileRatioPct)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.cellMono}>{formatRatio(campaign.tabletRatioPct)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}