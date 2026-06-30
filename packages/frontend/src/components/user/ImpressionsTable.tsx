'use client';

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useState, useCallback, useMemo } from 'react';
import type { UserImpressionRow } from '@cpmind/shared';
import { getSignalMeta, type SignalField } from '@/lib/user/signals-meta';
import { SignalFilterModal } from './SignalFilterModal';
import type { UserImpressionsTableProps } from '@/lib/user/types';
import type { UserListParams } from '@/lib/user/api';
import styles from '@/styles/table.module.css';

const col = createColumnHelper<UserImpressionRow>();

interface BuildColumnsArgs {
  currentParams: UserListParams;
  campaignId?: string;
  navigateTo: (params: Record<string, string>) => void;
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
      <SignalFilterModal meta={getSignalMeta(field)} currentParams={currentParams} navigateTo={navigateTo} />
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

function buildColumns({ currentParams, campaignId, navigateTo }: BuildColumnsArgs) {
  const dateColumn = col.accessor('timestamp_start', {
    header: 'Дата',
    enableSorting: true,
    cell: ({ getValue }) => (
      <span className={styles.cellMono}>{formatDate(getValue())}</span>
    ),
  });

  const campaignColumn = col.accessor('campaign_id', {
    header: 'ID Кампании',
    enableSorting: false,
    cell: ({ getValue }) => <span className={styles.cellMono}>{getValue()}</span>,
  });

  const restColumns = [
    col.accessor('creative_id', {
      header: 'ID Креатива',
      enableSorting: false,
      cell: ({ getValue }) => <span className={styles.cellMono}>{getValue()}</span>,
    }),
    col.accessor('device_type', {
      header: 'Устройство',
      enableSorting: false,
      cell: ({ getValue }) => {
        const icons: Record<string, string> = { desktop: '🖥', mobile: '📱', tablet: '📟' };
        const v = getValue();
        return `${icons[v] ?? ''} ${v}`;
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
    col.accessor('score_final', {
      header: () => renderFilterableHeader('Score', 'score_final', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        const cls = v >= 70 ? styles.scorePositive : v >= 40 ? styles.scoreModerate : styles.scoreNegative;
        return <span className={`${styles.cellScore} ${cls}`}>{v.toFixed(1)}</span>;
      },
    }),
    col.accessor('s1_normalized', {
      header: () => renderFilterableHeader('S1', 's1_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s2_normalized', {
      header: () => renderFilterableHeader('S2', 's2_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s3_normalized', {
      header: () => renderFilterableHeader('S3', 's3_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}</span> : <span className={styles.cellNull}>n/a</span>;
      },
    }),
    col.accessor('s4_normalized', {
      header: () => renderFilterableHeader('S4', 's4_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s5_normalized', {
      header: () => renderFilterableHeader('S5', 's5_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s7_normalized', {
      header: () => renderFilterableHeader('S7', 's7_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}</span> : <span className={styles.cellNull}>—</span>;
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
}: UserImpressionsTableProps) {
  const [sorting, setSorting] = useState<SortingState>(() => [{
    id: currentSort.sortBy === 'createdAt' ? 'timestamp_start' : '__none__',
    desc: currentSort.sortDir === 'desc',
  }]);

  const navigateTo = useCallback((params: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    window.location.href = url.pathname + url.search;
  }, []);

  const columns = useMemo(
    () => buildColumns({
      currentParams,
      navigateTo,
      ...(campaignId !== undefined && { campaignId }),
    }),
    [currentParams, campaignId, navigateTo],
  );

  function onSortingChange(updater: SortingState | ((prev: SortingState) => SortingState)): void {
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
                      onClick={header.column.getToggleSortingHandler()}
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
          <button className={styles.pageBtn} onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
            ← Назад
          </button>
          <button className={styles.pageBtn} onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount}>
            Вперед →
          </button>
        </div>
      </div>
    </div>
  );
}