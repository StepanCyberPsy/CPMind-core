'use client';

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ImpressionRow } from '@cpmind/shared';
import type { SortParams } from '@/lib/types';

const col = createColumnHelper<ImpressionRow>();

const columns = [
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
      <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
        {getValue()}
      </span>
    ),
  }),
  col.accessor('creative_id', {
    header: 'Creative',
    enableSorting: false,
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
        {getValue()}
      </span>
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
  col.accessor('s1_raw_time_in_view', {
    header: 'S1 raw (сек)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null ? v.toFixed(1) : '—';
    },
  }),
  col.accessor('s2_raw_share_of_screen', {
    header: 'S2 raw (%)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null ? v.toFixed(1) + '%' : '—';
    },
  }),
  col.accessor('s3_raw_scroll_speed', {
    header: 'S3 raw (px/s)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null ? v.toFixed(0) : 'n/a';
    },
  }),
  col.accessor('s4_raw_active_time_pct', {
    header: 'S4 raw (%)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null) return '—';
      const color = v < 25 ? '#fc8181' : v < 50 ? '#f6ad55' : '#68d391';
      return (
        <span style={{ color }}>
          {v.toFixed(1)}%
        </span>
      );
    },
  }),
  col.accessor('s5_raw_top_event', {
    header: 'S5 raw',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      const color = v === 'clicked' ? '#00ff88' :
        v === 'none' ? '#718096' : '#f6ad55';
      return <span style={{ color, fontSize: '12px' }}>{v}</span>;
    },
  }),
  col.accessor('s7_raw_persistence', {
    header: 'S7 raw (%)',
    enableSorting: false,
    cell: ({ getValue }) => {
      const v = getValue();
      return v !== null ? v.toFixed(1) + '%' : '—';
    },
  }),
  col.accessor('score_final', {
    header: 'Score',
    enableSorting: true,
    cell: ({ getValue }) => {
      const v = getValue();
      const score = v.toFixed(1);
      const color = v >= 70 ? '#00ff88' :
        v >= 40 ? '#f6ad55' : '#fc8181';
      return (
        <span style={{ color, fontWeight: '700', fontSize: '13px' }}>
          {score}
        </span>
      );
    },
  }),
  col.accessor('is_suspicious', {
    header: 'Suspicious',
    enableSorting: false,
    cell: ({ getValue }) =>
      getValue()
        ? <span style={{ color: '#fc8181' }}>⚠ да</span>
        : <span style={{ color: '#68d391' }}>✓</span>,
  }),
];

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

  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '600',
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #2d3748',
    whiteSpace: 'nowrap',
    backgroundColor: '#1a1f2e',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#cbd5e0',
    borderBottom: '1px solid #1a1f2e',
    whiteSpace: 'nowrap',
  };

  const trStyle: React.CSSProperties = {
    cursor: 'pointer',
    transition: 'background-color 0.1s',
  };

  return (
    <div>
      {/* Таблица */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: '#151820',
        }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      ...thStyle,
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span style={{ marginLeft: '4px', opacity: 0.6 }}>
                        {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? '↕'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ ...tdStyle, textAlign: 'center', color: '#718096', padding: '40px' }}
                >
                  Импрешены не найдены
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  style={trStyle}
                  onClick={() => onRowClick(row.original)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#1a1f2e';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent';
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={tdStyle}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 12px',
        borderTop: '1px solid #2d3748',
        fontSize: '13px',
        color: '#718096',
      }}>
        <span>
          Страница {currentPage} из {pageCount || 1}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{
              padding: '6px 14px',
              backgroundColor: currentPage <= 1 ? '#1a1f2e' : '#2d3748',
              color: currentPage <= 1 ? '#4a5568' : '#e2e8f0',
              border: 'none',
              borderRadius: '6px',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            ← Назад
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= pageCount}
            style={{
              padding: '6px 14px',
              backgroundColor: currentPage >= pageCount ? '#1a1f2e' : '#2d3748',
              color: currentPage >= pageCount ? '#4a5568' : '#e2e8f0',
              border: 'none',
              borderRadius: '6px',
              cursor: currentPage >= pageCount ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            Вперед
          </button>
        </div>
      </div>
    </div>
  );
}