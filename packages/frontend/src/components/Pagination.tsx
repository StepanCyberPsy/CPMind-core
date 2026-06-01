'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  currentPage: number;
  pageCount: number;
}

export function Pagination({ currentPage, pageCount }: Props) {
  const router = useRouter();

  const navigateToPage = useCallback((page: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', String(page));
    router.push(url.pathname + url.search);
  }, [router]);

  if (pageCount <= 1) return null;

  function getPageNumbers(): (number | '...')[] {
    const pages: (number | '...')[] = [];
    const delta = 2;

    const rangeStart = Math.max(2, currentPage - delta);
    const rangeEnd = Math.min(pageCount - 1, currentPage + delta);

    pages.push(1);

    if (rangeStart > 2) pages.push('...');
    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    if (rangeEnd < pageCount - 1) pages.push('...');
    if (pageCount > 1) pages.push(pageCount);

    return pages;
  }

  function pageButtonStyle(
    isActive: boolean,
    isDisabled: boolean,
  ): React.CSSProperties {
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '34px',
      height: '34px',
      padding: '0 8px',
      backgroundColor: isActive ? '#00ff88' :
        isDisabled ? '#1a1f2e' : '#2d3748',
      color: isActive ? '#0f1117' :
        isDisabled ? '#4a5568' : '#e2e8f0',
      border: 'none',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: isActive ? '700' : '400',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.1s',
    };
  }

  const pages = getPageNumbers();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      padding: '16px 0',
    }}>

      {/* Первая страница */}
      <button
        onClick={() => navigateToPage(1)}
        disabled={currentPage <= 1}
        style={pageButtonStyle(false, currentPage <= 1)}
        title="Первая страница"
      >
        «
      </button>

      {/* Предыдущая страница */}
      <button
        onClick={() => navigateToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        style={pageButtonStyle(false, currentPage <= 1)}
      >
        ‹
      </button>

      {/* Номера страниц */}
      {pages.map((page, idx) =>
        page === '...' ? (
          <span
            key={`ellipsis-${idx}`}
            style={{
              padding: '0 4px',
              color: '#4a5568',
              fontSize: '13px',
            }}
          >
            …
          </span>
        ) : (
          <button
            key={page}
            onClick={() => navigateToPage(page)}
            disabled={page === currentPage}
            style={pageButtonStyle(page === currentPage, false)}
          >
            {page}
          </button>
        ),
      )}

      {/* Следующая страница */}
      <button
        onClick={() => navigateToPage(currentPage + 1)}
        disabled={currentPage >= pageCount}
        style={pageButtonStyle(false, currentPage >= pageCount)}
      >
        ›
      </button>

      {/* Последняя страница */}
      <button
        onClick={() => navigateToPage(pageCount)}
        disabled={currentPage >= pageCount}
        style={pageButtonStyle(false, currentPage >= pageCount)}
        title="Последняя страница"
      >
        »
      </button>

    </div>
  );
}