'use client';

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useState, useCallback, useMemo } from 'react';
import type { UserImpressionRow, PublisherDomainAggregate } from '@cpmind/shared';
import {
  resolveMeasurementLevel,
  MEASUREMENT_LEVEL_LABELS,
  MEASUREMENT_LEVEL_HINTS,
} from '@cpmind/shared';
import { getSignalMeta, type SignalField } from '@/lib/shared/signals-meta';
import { formatCreativeType, formatPlacement } from '@/lib/config';
import { SignalFilterModal } from './SignalFilterModal';
import type { UserImpressionsTableProps } from '@/lib/user/types';
import type { UserListParams } from '@/lib/user/api';
import styles from '@/styles/table.module.css';

const col = createColumnHelper<UserImpressionRow>();

interface BuildColumnsArgs {
  currentParams: UserListParams;
  campaignId?: string;
  navigateTo: (params: Record<string, string>) => void;
  isDomainView: boolean;
}

function renderFilterableHeader(
  label: string,
  field: SignalField,
  currentParams: UserListParams,
  navigateTo: (params: Record<string, string>) => void,
): React.ReactNode {
  return (
    <div className={styles.thFilterable}>
      <span>{label}</span>
      <SignalFilterModal
        meta={getSignalMeta(field)}
        currentParams={currentParams}
        navigateTo={navigateTo}
      />
    </div>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DeviceIcon({ deviceType }: { deviceType: string }): React.ReactNode {
  if (deviceType === 'desktop') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" focusable="false">
        <path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8A1.5 1.5 0 0 1 19 16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 20h6M12 16.5V20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (deviceType === 'mobile') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" focusable="false">
        <path d="M8 3.5h8A1.5 1.5 0 0 1 17.5 5v14A1.5 1.5 0 0 1 16 20.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M11 17.5h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (deviceType === 'tablet') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" focusable="false">
        <path d="M6 4.5h12A1.5 1.5 0 0 1 19.5 6v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M11 16.5h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function formatDeviceType(deviceType: string): string {
  if (deviceType === 'desktop') return 'Десктоп';
  if (deviceType === 'mobile') return 'Мобильный';
  if (deviceType === 'tablet') return 'Планшет';
  return deviceType;
}

interface PublisherDomainAggregateRowProps {
  aggregate: PublisherDomainAggregate;
  publisherDomain: string;
}

function PublisherDomainAggregateRow({
  aggregate,
  publisherDomain,
}: PublisherDomainAggregateRowProps) {
  const fmtAvg = (v: number | null) => v !== null ? v.toFixed(1) : '—';

  return (
    <div className={styles.aggregateRow}>
      <div className={styles.aggregateHeader}>
        <span className={styles.aggregateLabel}>Площадка:</span>
        <span className={styles.aggregateDomain}>{publisherDomain}</span>
      </div>
      <div className={styles.aggregateStats}>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>Кампании</span>
          <span className={styles.aggregateStatValue}>{aggregate.campaigns_count}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>Импрешены</span>
          <span className={styles.aggregateStatValue}>{aggregate.impressions_count.toLocaleString('ru-RU')}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>Avg Score</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_score)}</span>
        </div>
        <div className={styles.aggregateStatDivider} />
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>S1</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_s1)}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>S2</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_s2)}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>S3</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_s3)}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>S4</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_s4)}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>S5</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_s5)}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>S6</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_s6)}</span>
        </div>
        <div className={styles.aggregateStat}>
          <span className={styles.aggregateStatLabel}>S7</span>
          <span className={styles.aggregateStatValue}>{fmtAvg(aggregate.avg_s7)}</span>
        </div>
      </div>
    </div>
  );
}

function buildColumns({
  currentParams,
  campaignId,
  navigateTo,
  isDomainView,
}: BuildColumnsArgs) {
  const dateColumn = col.accessor('timestamp_start', {
    header: 'Дата',
    enableSorting: true,
    cell: ({ getValue }) => (
      <span className={styles.cellMono}>{formatDate(getValue())}</span>
    ),
  });

  const campaignColumn = col.accessor('campaign_id', {
    header: 'Кампания',
    enableSorting: false,
    cell: ({ getValue, row }) => <span>{row.original.campaign_name ?? getValue()}</span>,
  });

  const domainColumn = col.accessor('publisher_domain', {
    header: 'Площадка размещения',
    enableSorting: false,
    cell: ({ getValue, row }) => {
      const domain = getValue() ?? 'unknown';
      return (
        <div className={styles.domainCell}>
          <span className={styles.cellMono}>{domain}</span>
          <button
            type="button"
            className={styles.domainFilterBadge}
            onClick={(e) => {
              e.stopPropagation();
              navigateTo({ creativeId: row.original.creative_id, domainView: '1', publisherDomain: '', page: '1' });
            }}
          >
            Отфильтровать
          </button>
        </div>
      );
    },
  });

  const restColumns = [
    col.accessor('creative_id', {
      header: 'Креатив',
      enableSorting: false,
      cell: ({ getValue, row }) => <span>{row.original.creative_name ?? getValue()}</span>,
    }),
    col.accessor('creative_type', {
      header: 'Тип креатива',
      enableSorting: false,
      cell: ({ getValue }) => (
        <span className={styles.cellDate}>{formatCreativeType(getValue())}</span>
      ),
    }),
    col.display({
      id: '__placement__',
      header: 'Размещение',
      cell: ({ row }) => {
        const label = formatPlacement(row.original.format, row.original.subtype);
        return label === '—'
          ? <span className={styles.cellNull}>—</span>
          : <span className={styles.cellDate}>{label}</span>;
      },
    }),
    ...(!isDomainView ? [domainColumn] : []),
    col.accessor('device_type', {
      header: 'Устройство',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return (
          <span className={styles.cellDevice}>
            <span className={styles.deviceIcon} aria-hidden="true">
              <DeviceIcon deviceType={v} />
            </span>
            <span>{formatDeviceType(v)}</span>
          </span>
        );
      },
    }),
    col.accessor('ivt_verdict', {
      header: 'Валидность',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === 'valid') {
          return <span className={`${styles.ivtBadge} ${styles.ivtValid}`}>Валиден</span>;
        }
        if (v === 'givt') {
          return <span className={`${styles.ivtBadge} ${styles.ivtViolation}`}>GIVT-Нарушение</span>;
        }
        if (v === 'sivt_confirmed') {
          return <span className={`${styles.ivtBadge} ${styles.ivtViolation}`}>SIVT-Нарушение</span>;
        }
        return <span className={`${styles.ivtBadge} ${styles.ivtSuspicion}`}>SIVT-Подозрение</span>;
      },
    }),
    col.accessor('is_suspicious', {
      header: 'Аномалии',
      enableSorting: false,
      cell: ({ getValue }) =>
        getValue()
          ? <span className={`${styles.cellSuspicious} ${styles.suspicious}`}>⚠ Аномалия</span>
          : <span className={`${styles.cellSuspicious} ${styles.notSuspicious}`}>Чисто</span>,
    }),
    col.display({
      id: 'measurement_level',
      header: 'Измерение',
      cell: ({ row }) => {
        const level = resolveMeasurementLevel(row.original);
        const cls = level === 'full' ? styles.levelFull : styles.levelPartial;
        return (
          <span
            className={`${styles.levelBadge} ${cls}`}
            title={MEASUREMENT_LEVEL_HINTS[level]}
          >
            {MEASUREMENT_LEVEL_LABELS[level]}
          </span>
        );
      },
    }),
    col.accessor('score_final', {
      header: () => renderFilterableHeader('Score', 'score_final', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === null) return <span className={styles.cellNull}>—</span>;
        const cls = v >= 70 ? styles.scorePositive : v >= 40 ? styles.scoreModerate : styles.scoreNegative;
        return <span className={`${styles.cellScore} ${cls}`}>{v.toFixed(1)}</span>;
      },
    }),
    col.accessor('s1_normalized', {
      header: () => renderFilterableHeader('S1', 's1_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s2_normalized', {
      header: () => renderFilterableHeader('S2', 's2_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s3_normalized', {
      header: () => renderFilterableHeader('S3', 's3_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
          : <span className={styles.cellNull}>n/a</span>;
      },
    }),
    col.accessor('s4_normalized', {
      header: () => renderFilterableHeader('S4', 's4_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s5_normalized', {
      header: () => renderFilterableHeader('S5', 's5_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s6_normalized', {
      header: () => renderFilterableHeader('S6', 's6_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s7_normalized', {
      header: () => renderFilterableHeader('S7', 's7_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
  ];

  return campaignId === undefined
    ? [dateColumn, campaignColumn, ...restColumns]
    : [dateColumn, ...restColumns];
}

export function UserImpressionsTableClient({
  initialData,
  pageCount,
  currentPage,
  currentSort,
  currentParams,
  campaignId,
  isDomainView = false,
  aggregate,
}: UserImpressionsTableProps) {
  const [sorting, setSorting] = useState<SortingState>(() => [{
    id: currentSort.sortBy === 'createdAt' ? 'timestamp_start' : '__none__',
    desc: currentSort.sortDir === 'desc',
  }]);

  const navigateTo = useCallback((params: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v !== '') url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    window.location.href = url.pathname + url.search;
  }, []);

  const columns = useMemo(
    () => buildColumns({
      currentParams,
      navigateTo,
      isDomainView,
      ...(campaignId !== undefined && { campaignId }),
    }),
    [currentParams, campaignId, navigateTo, isDomainView],
  );

  const showAggregate = aggregate !== undefined;
  const aggregateDomainLabel = currentParams.publisherDomain ?? 'Все площадки';

  function onSortingChange(
    updater: SortingState | ((prev: SortingState) => SortingState),
  ): void {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    setSorting(next);
    const first = next[0];
    if (!first) return;
    navigateTo({ sortBy: 'createdAt', sortDir: first.desc ? 'desc' : 'asc', page: '1' });
  }

  function onPageChange(page: number): void {
    navigateTo({ page: String(page) });
  }

  const table = useReactTable({
    data: initialData,
    columns,
    state: { sorting },
    manualSorting: true,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      {showAggregate && (
        <PublisherDomainAggregateRow
          aggregate={aggregate!}
          publisherDomain={aggregateDomainLabel}
        />
      )}
      <div className={styles.wrapper}>
      <div className={styles.scrollContainer}>
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={`${styles.th} ${canSort ? styles.thSortable : ''}`}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        <span className={`${styles.sortIcon} ${sorted ? styles.sortIconActive : ''}`}>
                          {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  Импрешены не найдены
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={styles.tr}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={styles.td}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <span className={styles.pageInfo}>
          Страница {currentPage} из {pageCount || 1}
        </span>
        <div className={styles.pageButtons}>
          <button
            className={styles.pageBtn}
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            ← Назад
          </button>
          <button
            className={styles.pageBtn}
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= pageCount}
          >
            Вперед →
          </button>
          </div>
        </div>
      </div>
    </>
  );
}
