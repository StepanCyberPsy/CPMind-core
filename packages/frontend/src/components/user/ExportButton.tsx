'use client';

import { useState } from 'react';
import { buildUserCsvUrl } from '@/lib/user/api';
import type { UserExportButtonProps } from '@/lib/user/types';
import styles from '@/styles/components.module.css';

export function UserExportButton({ params }: UserExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport(): Promise<void> {
    setLoading(true);
    try {
      const url = buildUserCsvUrl(params);
      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `cpmind_export_${Date.now()}.csv`;

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('[CPMind] user CSV export error:', err);
      alert('Ошибка экспорта. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={styles.exportBtn}
      onClick={handleExport}
      disabled={loading}
    >
      {loading ? (
        <>
          <span className={styles.spinner} />
          Экспорт...
        </>
      ) : (
        <>
          <span className={styles.exportIcon}>↓</span>
          Экспорт CSV
        </>
      )}
    </button>
  );
}