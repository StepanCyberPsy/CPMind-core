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
import { buildSegmentColorMap, type SegmentColor } from '@/lib/admin/segment-color';
import { getSignalMeta, type SignalField } from '@/lib/admin/signals-meta';
import { SignalFilterModal } from './SignalFilterModal';
import type { ImpressionsTableProps } from '@/lib/admin/types';
import type { ListParams } from '@/lib/admin/api';
import styles from '@/styles/table.module.css';

const col = createColumnHelper<ImpressionRow>();

interface BuildColumnsArgs {
  navigateTo: (params: Record<string, string>) => void;
  segmentColorMap: Map<string, SegmentColor>;
  currentParams: ListParams;
}

function renderFilterableHeader(
  label: string,
  field: SignalField,
  currentParams: ListParams,
  navigateTo: (params: Record<string, string>) => void,
): React.ReactNode {
  return (
    <div className={styles.thFilterable}>
      <span>{label}</span>
      <SignalFilterModal meta={getSignalMeta(field)} currentParams={currentParams} navigateTo={navigateTo} />
    </div>
  );
}

function buildColumns({ navigateTo, segmentColorMap, currentParams }: BuildColumnsArgs) {
  return [
    col.accessor('created_at', {
      header: 'Дата',
      enableSorting: true,
      cell: ({ getValue }) => {
        const d = new Date(getValue());
        return d.toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
        });
      },
    }),
    col.accessor('campaign_id', {
      header: 'ID Кампании',
      enableSorting: false,
      cell: ({ getValue }) => <span className={styles.cellMono}>{getValue()}</span>,
    }),
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
    col.accessor('segment_index', {
      header: 'Сегмент',
      enableSorting: false,
      cell: ({ row }) => {
        const segmentIndex = row.original.segment_index;
        const sessionGroupId = row.original.session_group_id;
        const color = segmentColorMap.get(sessionGroupId);
        return (
          <button
            type="button"
            className={styles.segmentBadge}
            style={color ? { borderColor: color.border, color: color.text, backgroundColor: color.bg } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              navigateTo({ sessionGroupId, page: '1' });
            }}
            title="Показать все сегменты этого показа"
          >
            {`сегмент ${segmentIndex + 1}`}
          </button>
        );
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
    col.accessor('s1_raw_time_in_view', {
      header: () => renderFilterableHeader('S1 raw (сек)', 's1_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s2_raw_share_of_screen', {
      header: () => renderFilterableHeader('S2 raw (%)', 's2_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}%</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s3_raw_scroll_speed', {
      header: () => renderFilterableHeader('S3 raw (px/s)', 's3_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(0)}</span> : <span className={styles.cellNull}>n/a</span>;
      },
    }),
    col.accessor('s4_raw_active_time_pct', {
      header: () => renderFilterableHeader('S4 raw (%)', 's4_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === null) return <span className={styles.cellNull}>—</span>;
        const cls = v < 50 ? styles.s4Low : v < 80 ? styles.s4Moderate : styles.s4Normal;
        return <span className={`${styles.cellS4} ${cls}`}>{v.toFixed(1)}%</span>;
      },
    }),
    col.accessor('s5_raw_top_event', {
      header: () => renderFilterableHeader('S5 raw', 's5_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        const cls = v === 'clicked' ? styles.s5Clicked : v === 'none' ? styles.s5None : styles.s5Other;
        return <span className={`${styles.cellS5} ${cls}`}>{v}</span>;
      },
    }),
    col.accessor('s7_raw_persistence', {
      header: () => renderFilterableHeader('S7 raw (%)', 's7_normalized', currentParams, navigateTo),
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v.toFixed(1)}%</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('tag_constants_version', {
      header: 'Версия тега',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null ? <span className={styles.cellMono}>{v}</span> : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('weights_version', {
      header: 'Версия весов',
      enableSorting: false,
      cell: ({ getValue }) => <span className={styles.cellMono}>{getValue()}</span>,
    }),
  ];
}

export function ImpressionsTableClient({
  initialData,
  pageCount,
  currentPage,
  currentSort,
  currentParams,
}: ImpressionsTableProps) {
  const router = useRouter();

  const [sorting, setSorting] = useState<SortingState>(() => [{
    id: currentSort.sortBy === 'createdAt' ? 'created_at' : '__none__',
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

  const segmentColorMap = useMemo(() => buildSegmentColorMap(initialData), [initialData]);

  const columns = useMemo(
    () => buildColumns({ navigateTo, segmentColorMap, currentParams }),
    [navigateTo, segmentColorMap, currentParams],
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

  function onRowClick(row: ImpressionRow): void {
    router.push(`/admin/impressions/${row.id}`);
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
                <tr key={row.id} className={styles.tr} onClick={() => onRowClick(row.original)}>
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