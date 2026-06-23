'use client';

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ImpressionRow } from '@cpmind/shared';
import type { SortParams } from '@/lib/types';
import styles from '@/styles/table.module.css';

const col = createColumnHelper<ImpressionRow>();

function buildColumns(navigateTo: (params: Record<string, string>) => void) {
  return [
  col.accessor('created_at', {
    header: 'Дата',
    enableSorting: true,
    cell: ({ getValue }) => {
      const d = new Date(getValue());
      return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
  }),
  col.accessor('campaign_id', {
    header: 'Campaign',
    enableSorting: false,
    cell: ({ getValue }) => (
      <span className={styles.cellMono}>{getValue()}</span>
    ),
  }),
  col.accessor('creative_id', {
    header: 'Creative',
    enableSorting: false,
    cell: ({ getValue }) => (
      <span className={styles.cellMono}>{getValue()}</span>
    ),
  }),
  col.accessor('device_type', {
    header: 'Устройство',
    enableSorting: false,
    cell: ({ getValue }) => {
      const icons: Record<string, string> = {
        desktop: '🖥',
        mobile: '📱',
        tablet: '📟',
      };
      const v = getValue();
      return `${icons[v] ?? ''} ${v}`;
    },
  }),
  col.accessor('segment_index', {
    header: 'Сегмент',
    enableSorting: false,
    cell: ({ row }) => {
      const segmentIndex = row.original.segment_index;
      const sessionGroupId = row.original.session_group_id;
      const isContinuation = segmentIndex > 0;
      return (
        <button
          type="button"
          className={`${styles.segmentBadge} ${isContinuation ? styles.segmentBadgeContinuation : styles.segmentBadgeSingle}`}
          onClick={(e) => {
            e.stopPropagation();
            navigateTo({ sessionGroupId, page: '1' });
          }}
          title="Показать все сегменты этого показа"
        >
          {isContinuation ? `↻ сегмент ${segmentIndex + 1}` : 'сегмент 1'}
        </button>
      );
    },
  }),
  col.accessor('s1_raw_time_in_view', {
    header: 'S1 raw (сек)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null
        ? <span className={styles.cellMono}>{v.toFixed(1)}</span>
        : <span className={styles.cellNull}>—</span>;
    },
  }),
  col.accessor('s2_raw_share_of_screen', {
    header: 'S2 raw (%)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null
        ? <span className={styles.cellMono}>{v.toFixed(1)}%</span>
        : <span className={styles.cellNull}>—</span>;
    },
  }),
  col.accessor('s3_raw_scroll_speed', {
    header: 'S3 raw (px/s)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null
        ? <span className={styles.cellMono}>{v.toFixed(0)}</span>
        : <span className={styles.cellNull}>n/a</span>;
    },
  }),
  col.accessor('s4_raw_active_time_pct', {
    header: 'S4 raw (%)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null) return <span className={styles.cellNull}>—</span>;
      const cls = v < 50
        ? styles.s4Low
        : v < 80
          ? styles.s4Moderate
          : styles.s4Normal;
      return <span className={`${styles.cellS4} ${cls}`}>{v.toFixed(1)}%</span>;
    },
  }),
  col.accessor('s5_raw_top_event', {
    header: 'S5 raw',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      const cls = v === 'clicked'
        ? styles.s5Clicked
        : v === 'none'
          ? styles.s5None
          : styles.s5Other;
      return <span className={`${styles.cellS5} ${cls}`}>{v}</span>;
    },
  }),
  col.accessor('s7_raw_persistence', {
    header: 'S7 raw (%)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null
        ? <span className={styles.cellMono}>{v.toFixed(1)}%</span>
        : <span className={styles.cellNull}>—</span>;
    },
  }),
  col.accessor('score_final', {
    header: 'Score',
    enableSorting: true,
    cell: ({ getValue }) => {
      const v = getValue();
      const cls = v >= 70
        ? styles.scorePositive
        : v >= 40
          ? styles.scoreModerate
          : styles.scoreNegative;
      return <span className={`${styles.cellScore} ${cls}`}>{v.toFixed(1)}</span>;
    },
  }),
  col.accessor('is_suspicious', {
    header: 'Suspicious',
    enableSorting: false,
    cell: ({ getValue }) =>
      getValue()
        ? <span className={`${styles.cellSuspicious} ${styles.suspicious}`}>⚠ Suspicious</span>
        : <span className={`${styles.cellSuspicious} ${styles.notSuspicious}`}>Clean</span>,
  }),
  ];
}

interface Props {
  initialData: ImpressionRow[];
  pageCount: number;
  currentPage: number;
  currentSort: SortParams;
}

export function ImpressionsTableClient({
  initialData,
  pageCount,
  currentPage,
  currentSort,
}: Props) {
  const router = useRouter();

  const [sorting, setSorting] = useState<SortingState>(() => [{
    id: currentSort.sortBy === 'scoreFinal' ? 'score_final' : 'created_at',
    desc: currentSort.sortDir === 'desc',
  }]);

  const navigateTo = useCallback((params: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    router.push(url.pathname + url.search);
  }, [router]);

  const columns = useMemo(() => buildColumns(navigateTo), [navigateTo]);

  function onSortingChange(updater: SortingState | ((prev: SortingState) => SortingState)): void {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    setSorting(next);
    const first = next[0];
    if (!first) return;
    const sortBy = first.id === 'score_final' ? 'scoreFinal' : 'createdAt';
    const sortDir = first.desc ? 'desc' : 'asc';
    navigateTo({ sortBy, sortDir, page: '1' });
  }

  function onPageChange(page: number): void {
    navigateTo({ page: String(page) });
  }

  function onRowClick(row: ImpressionRow): void {
    router.push(`/impressions/${row.id}`);
  }

  const table = useReactTable({
    data: initialData,
    columns,
    pageCount,
    state: {
      sorting,
      pagination: { pageIndex: currentPage - 1, pageSize: 50 },
    },
    manualPagination: true,
    manualSorting: true,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={styles.wrapper}>
      <div className={styles.scrollContainer}>
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
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
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className={styles.tr}
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
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
  );
}