'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import styles from '@/styles/pagination.module.css';

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

  return (
    <div className={styles.pagination}>
      <span className={styles.info}>
        Страница {currentPage} из {pageCount || 1}
      </span>
      <div className={styles.buttons}>
        <button
          className={styles.btn}
          onClick={() => navigateToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          ← Назад
        </button>
        <button
          className={styles.btn}
          onClick={() => navigateToPage(currentPage + 1)}
          disabled={currentPage >= pageCount}
        >
          Вперед →
        </button>
      </div>
    </div>
  );
}