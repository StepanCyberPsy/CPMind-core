'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { ImpressionRow, CalibrationItem } from '@cpmind/shared';
import styles from '@/styles/recalibration.module.css';
import tableStyles from '@/styles/table.module.css';

const PREVIEW_MODE_COLUMN_COUNT = 10;
const SELECT_MODE_COLUMN_COUNT = 11;

interface Props {
  rows: ImpressionRow[];
  pageCount: number;
  currentPage: number;
  mode: 'select' | 'preview';
  previewItems: CalibrationItem[];
  previewTotal: number;
  selectAllMode: boolean;
  manualSelectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleRow: (id: string) => void;
  disabled: boolean;
}

function scoreClass(score: number): string {
  return score >= 70 ? tableStyles.scorePositive! : score >= 40 ? tableStyles.scoreModerate! : tableStyles.scoreNegative!;
}

function normalizedCell(value: number | null): React.ReactNode {
  return value !== null
    ? <span className={tableStyles.cellMono}>{value.toFixed(1)}</span>
    : <span className={tableStyles.cellNull}>—</span>;
}

export function RecalibrationTable({
  rows,
  pageCount,
  currentPage,
  mode,
  previewItems,
  previewTotal,
  selectAllMode,
  manualSelectedIds,
  onToggleSelectAll,
  onToggleRow,
  disabled,
}: Props) {
  const router = useRouter();

  const navigateTo = useCallback((params: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    router.push(url.pathname + url.search);
  }, [router]);

  function onPageChange(page: number): void {
    navigateTo({ page: String(page) });
  }

  if (mode === 'preview') {
    return (
      <div className={styles.previewWrapper}>
        {previewTotal > previewItems.length && (
          <div className={styles.previewTruncatedNote}>
            Показаны первые {previewItems.length} из {previewTotal.toLocaleString('ru-RU')} — пересчёт и сохранение затронут все {previewTotal.toLocaleString('ru-RU')}.
          </div>
        )}
        <div className={tableStyles.scrollContainer}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th className={tableStyles.th}>ID Кампании</th>
                <th className={tableStyles.th}>ID Креатива</th>
                <th className={tableStyles.th}>Устройство</th>
                <th className={tableStyles.th}>Score</th>
                <th className={tableStyles.th}>S1</th>
                <th className={tableStyles.th}>S2</th>
                <th className={tableStyles.th}>S3</th>
                <th className={tableStyles.th}>S4</th>
                <th className={tableStyles.th}>S5</th>
                <th className={tableStyles.th}>S7</th>
              </tr>
            </thead>
            <tbody>
              {previewItems.length === 0 ? (
                <tr>
                  <td colSpan={PREVIEW_MODE_COLUMN_COUNT} className={tableStyles.empty}>Нет элементов в черновике</td>
                </tr>
              ) : (
                previewItems.map((item) => (
                  <tr key={item.id} className={tableStyles.tr}>
                    <td className={tableStyles.td}><span className={tableStyles.cellMono}>{item.campaignId}</span></td>
                    <td className={tableStyles.td}><span className={tableStyles.cellMono}>{item.creativeId}</span></td>
                    <td className={tableStyles.td}>{item.deviceType}</td>
                    <td className={tableStyles.td}>
                      <span className={tableStyles.cellMono}>{item.previousScoreFinal.toFixed(1)}</span>
                      {' \u2192 '}
                      <span className={`${tableStyles.cellScore} ${scoreClass(item.newScoreFinal)}`}>{item.newScoreFinal.toFixed(1)}</span>
                    </td>
                    <td className={tableStyles.td}>{normalizedCell(item.s1Normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(item.s2Normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(item.s3Normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(item.s4Normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(item.s5Normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(item.s7Normalized)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className={tableStyles.wrapper}>
      {selectAllMode && (
        <div className={styles.selectAllNote}>
          Выбраны все импрешены, соответствующие текущим фильтрам. Чтобы выбрать вручную, снимите «Выбрать все».
        </div>
      )}
      <div className={tableStyles.scrollContainer}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th className={`${tableStyles.th} ${styles.checkboxCell}`}>
                <input
                  type="checkbox"
                  className={styles.rowCheckbox}
                  checked={selectAllMode}
                  onChange={onToggleSelectAll}
                  disabled={disabled}
                  aria-label="Выбрать все"
                />
              </th>
              <th className={tableStyles.th}>ID Кампании</th>
              <th className={tableStyles.th}>ID Креатива</th>
              <th className={tableStyles.th}>Устройство</th>
              <th className={tableStyles.th}>Score</th>
              <th className={tableStyles.th}>S1</th>
              <th className={tableStyles.th}>S2</th>
              <th className={tableStyles.th}>S3</th>
              <th className={tableStyles.th}>S4</th>
              <th className={tableStyles.th}>S5</th>
              <th className={tableStyles.th}>S7</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={SELECT_MODE_COLUMN_COUNT} className={tableStyles.empty}>Импрешены не найдены</td>
              </tr>
            ) : (
              rows.map((row) => {
                const checked = selectAllMode || manualSelectedIds.has(row.id);
                return (
                  <tr key={row.id} className={`${tableStyles.tr} ${checked ? styles.selectedRow : ''}`}>
                    <td className={`${tableStyles.td} ${styles.checkboxCell}`}>
                      <input
                        type="checkbox"
                        className={styles.rowCheckbox}
                        checked={checked}
                        onChange={() => onToggleRow(row.id)}
                        disabled={disabled || selectAllMode}
                      />
                    </td>
                    <td className={tableStyles.td}><span className={tableStyles.cellMono}>{row.campaign_id}</span></td>
                    <td className={tableStyles.td}><span className={tableStyles.cellMono}>{row.creative_id}</span></td>
                    <td className={tableStyles.td}>{row.device_type}</td>
                    <td className={tableStyles.td}>
                      <span className={`${tableStyles.cellScore} ${scoreClass(row.score_final)}`}>{row.score_final.toFixed(1)}</span>
                    </td>
                    <td className={tableStyles.td}>{normalizedCell(row.s1_normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(row.s2_normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(row.s3_normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(row.s4_normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(row.s5_normalized)}</td>
                    <td className={tableStyles.td}>{normalizedCell(row.s7_normalized)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className={tableStyles.footer}>
        <span className={tableStyles.pageInfo}>Страница {currentPage} из {pageCount || 1}</span>
        <div className={tableStyles.pageButtons}>
          <button className={tableStyles.pageBtn} onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1 || disabled}>← Назад</button>
          <button className={tableStyles.pageBtn} onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount || disabled}>Вперед →</button>
        </div>
      </div>
    </div>
  );
}