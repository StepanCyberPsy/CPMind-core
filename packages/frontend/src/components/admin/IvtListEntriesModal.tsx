'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchIvtListConfig } from '@/lib/admin/api';
import type { IvtListEntry } from '@cpmind/shared';
import styles from '@/styles/ivt-list-entries-modal.module.css';

interface Props {
  configId: string;
  version: string;
  onClose: () => void;
}

export function IvtListEntriesModal({ configId, version, onClose }: Props) {
  const [entries, setEntries] = useState<IvtListEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      try {
        const config = await fetchIvtListConfig(configId);
        if (!cancelled) setEntries(config?.entries ?? []);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [configId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search.trim()) return entries;
    const q = search.trim().toLowerCase();
    return entries.filter((e) =>
      e.pattern.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.reason?.toLowerCase().includes(q) ?? false),
    );
  }, [entries, search]);

  return (
    <div className={styles.overlay} onMouseDown={handleOverlayMouseDown}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ivt-entries-title"
        className={styles.modal}
      >
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>GIVT-список</div>
            <h2 id="ivt-entries-title" className={styles.title}>{version}</h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Поиск по паттерну, категории, причине..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {entries !== null && (
            <span className={styles.count}>
              {filtered.length} / {entries.length}
            </span>
          )}
        </div>

        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.state}>Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.state}>
              {search.trim() ? 'Ничего не найдено' : 'Список пуст'}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Тип</th>
                  <th className={styles.th}>Паттерн</th>
                  <th className={styles.th}>Режим</th>
                  <th className={styles.th}>Категория</th>
                  <th className={styles.th}>Причина</th>
                  <th className={styles.th}>Источник</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => (
                  <tr key={i} className={styles.tr}>
                    <td className={styles.td}>
                      <span className={styles.typeBadge}>{entry.type}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.pattern}>{entry.pattern}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.mono}>{entry.match_type}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.category}>{entry.category}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{entry.reason ?? '—'}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{entry.source ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      <div className={styles.modalFooter} />
      </div>
    </div>
  );
}