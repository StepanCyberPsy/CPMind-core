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
import { getSignalMeta, type SignalField } from '@/lib/shared/signals-meta';
import { SignalFilterModal } from './SignalFilterModal';
import type { ImpressionsTableProps } from '@/lib/admin/types';
import type { ListParams } from '@/lib/admin/api';
import styles from '@/styles/table.module.css';

const col = createColumnHelper<ImpressionRow>();

interface BuildColumnsArgs {
  navigateTo: (params: Record<string, string>) => void;
  segmentColorMap: Map<string, SegmentColor>;
  currentParams: ListParams;
  showRaw: boolean;
  onToggleRaw: () => void;
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
      <SignalFilterModal
        meta={getSignalMeta(field)}
        currentParams={currentParams}
        navigateTo={navigateTo}
      />
    </div>
  );
}

function RawToggleIcon({ expanded }: { expanded: boolean }): React.ReactNode {
  return expanded ? (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 6L2 8l3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 6l3 2-3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 6l3 2-3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6l-3 2 3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

function buildColumns({
  navigateTo,
  segmentColorMap,
  currentParams,
  showRaw,
  onToggleRaw,
}: BuildColumnsArgs) {
  const baseColumns = [
    col.accessor('created_at', {
      header: 'Дата',
      enableSorting: true,
      cell: ({ getValue }) => {
        const d = new Date(getValue());
        return (
          <span className={styles.cellDate}>
            {d.toLocaleString('ru-RU', {
              day: '2-digit', month: '2-digit', year: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        );
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
  ];

  const normalizedColumns = [
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

  const rawToggleColumn = col.display({
    id: '__raw_toggle__',
    header: () => (
      <button
        type="button"
        className={styles.rawToggleBtn}
        onClick={(e) => {
          e.stopPropagation();
          onToggleRaw();
        }}
        title={showRaw ? 'Скрыть сырые сигналы' : 'Показать сырые сигналы'}
      >
        <RawToggleIcon expanded={showRaw} />
      </button>
    ),
    cell: () => null,
  });

  const rawColumns = showRaw ? [
    col.accessor('s1_raw_time_in_view', {
      id: '__raw_s1__',
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
      id: '__raw_s2__',
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
      id: '__raw_s3__',
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
      id: '__raw_s4__',
      header: 'S4 raw (%)',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === null) return <span className={styles.cellNull}>—</span>;
        const cls = v < 50 ? styles.s4Low : v < 80 ? styles.s4Moderate : styles.s4Normal;
        return <span className={`${styles.cellS4} ${cls}`}>{v.toFixed(1)}%</span>;
      },
    }),
    col.accessor('s5_raw_top_event', {
      id: '__raw_s5__',
      header: 'S5 raw',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        const cls = v === 'clicked' ? styles.s5Clicked : v === 'none' ? styles.s5None : styles.s5Other;
        return <span className={`${styles.cellS5} ${cls}`}>{v}</span>;
      },
    }),
    col.accessor('s6_raw_completion_rate', {
      id: '__raw_s6__',
      header: 'S6 raw (%)',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}%</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('s7_raw_persistence', {
      id: '__raw_s7__',
      header: 'S7 raw (%)',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v.toFixed(1)}%</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
  ] : [];

  const metaColumns = [
    col.accessor('tag_constants_version', {
      header: 'Версия тега',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v !== null
          ? <span className={styles.cellMono}>{v}</span>
          : <span className={styles.cellNull}>—</span>;
      },
    }),
    col.accessor('weights_version', {
      header: 'Версия весов',
      enableSorting: false,
      cell: ({ getValue }) => <span className={styles.cellMono}>{getValue()}</span>,
    }),
  ];

  return [
    ...baseColumns,
    ...normalizedColumns,
    rawToggleColumn,
    ...rawColumns,
    ...metaColumns,
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
  const [showRaw, setShowRaw] = useState(false);

  const [sorting, setSorting] = useState<SortingState>(() => [{
    id: currentSort.sortBy === 'createdAt' ? 'created_at' : '__none__',
    desc: currentSort.sortDir === 'desc',
  }]);

  const navigateTo = useCallback((params: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v !== '') url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    router.push(url.pathname + url.search);
  }, [router]);

  const onToggleRaw = useCallback(() => setShowRaw(prev => !prev), []);

  const segmentColorMap = useMemo(
    () => buildSegmentColorMap(initialData),
    [initialData],
  );

  const columns = useMemo(
    () => buildColumns({ navigateTo, segmentColorMap, currentParams, showRaw, onToggleRaw }),
    [navigateTo, segmentColorMap, currentParams, showRaw, onToggleRaw],
  );

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
                  const isToggle = header.column.id === '__raw_toggle__';
                  return (
                    <th
                      key={header.id}
                      className={`${styles.th} ${canSort ? styles.thSortable : ''} ${isToggle ? styles.thRawToggle : ''}`}
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
                <tr
                  key={row.id}
                  className={styles.tr}
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`${styles.td} ${cell.column.id === '__raw_toggle__' ? styles.tdRawToggle : ''}`}
                    >
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