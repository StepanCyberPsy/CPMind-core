'use client';

import { useState } from 'react';
import { buildCsvUrl } from '@/lib/api';
import type { ListParams } from '@/lib/api';

interface Props {
  params: ListParams;
}

export function ExportButton({ params }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExport(): Promise<void> {
    setLoading(true);

    try {
      const url = buildCsvUrl(params);
      const res = await fetch(url, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Export failed: ${res.status}`);
      }

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
      console.error('[CPMind] CSV export error:', err);
      alert('Ошибка экспорта. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        backgroundColor: loading ? '#2d3748' : '#1a1f2e',
        color: loading ? '#718096' : '#00ff88',
        border: '1px solid',
        borderColor: loading ? '#2d3748' : '#00ff88',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? (
        <>
          <span style={{ opacity: 0.6 }}>⏳</span>
          Экспорт...
        </>
      ) : (
        <>
          <span>↓</span>
          Экспорт CSV
        </>
      )}
    </button>
  );
}