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

function deviceCell(deviceType: string): React.ReactNode {
  return (
    <span className={tableStyles.cellDevice}>
      <span className={tableStyles.deviceIcon} aria-hidden="true">
        <DeviceIcon deviceType={deviceType} />
      </span>
      <span>{formatDeviceType(deviceType)}</span>
    </span>
  );
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
            Показаны первые {previewItems.length} из {previewTotal.toLocaleString('ru-RU')} — пересчет и сохранение затронут все {previewTotal.toLocaleString('ru-RU')}.
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
                    <td className={tableStyles.td}>{deviceCell(item.deviceType)}</td>
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
                    <td className={tableStyles.td}>{deviceCell(row.device_type)}</td>
                    <td className={tableStyles.td}>
                      {row.score_final !== null
                        ? <span className={`${tableStyles.cellScore} ${scoreClass(row.score_final)}`}>{row.score_final.toFixed(1)}</span>
                        : <span className={tableStyles.cellNull}>—</span>}
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