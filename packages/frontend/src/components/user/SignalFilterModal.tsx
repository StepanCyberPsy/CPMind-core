'use client';

import { useState } from 'react';
import { usePopover } from '@/lib/shared/use-popover';
import type { SignalMeta, SignalField } from '@/lib/user/signals-meta';
import type { UserListParams } from '@/lib/user/api';
import styles from '@/styles/signal-filter-modal.module.css';

interface SignalFilterModalProps {
  meta: SignalMeta;
  currentParams: UserListParams;
  navigateTo: (params: Record<string, string>) => void;
}

type Mode = 'gte' | 'lte' | 'range';

function getCurrentMin(field: SignalField, params: UserListParams): number | undefined {
  if (field === 'score_final') return params.scoreMin;
  if (field === 's1_normalized') return params.s1Min;
  if (field === 's2_normalized') return params.s2Min;
  if (field === 's3_normalized') return params.s3Min;
  if (field === 's4_normalized') return params.s4Min;
  if (field === 's5_normalized') return params.s5Min;
  return params.s7Min;
}

function getCurrentMax(field: SignalField, params: UserListParams): number | undefined {
  if (field === 'score_final') return params.scoreMax;
  if (field === 's1_normalized') return params.s1Max;
  if (field === 's2_normalized') return params.s2Max;
  if (field === 's3_normalized') return params.s3Max;
  if (field === 's4_normalized') return params.s4Max;
  if (field === 's5_normalized') return params.s5Max;
  return params.s7Max;
}

export function SignalFilterModal({ meta, currentParams, navigateTo }: SignalFilterModalProps) {
  const { open, setOpen, triggerRef, panelRef, coords } = usePopover();

  const currentMin = getCurrentMin(meta.field, currentParams);
  const currentMax = getCurrentMax(meta.field, currentParams);
  const isCurrentSort = currentParams.sortBy === meta.sortValue;

  const [mode, setMode] = useState<Mode>('gte');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [sortDir, setSortDir] = useState<'' | 'asc' | 'desc'>('');

  function openPanel(): void {
    const initialMode: Mode = currentMin !== undefined && currentMax !== undefined
      ? 'range'
      : currentMax !== undefined
        ? 'lte'
        : 'gte';
    setMode(initialMode);
    setMinInput(currentMin !== undefined ? String(currentMin) : '');
    setMaxInput(currentMax !== undefined ? String(currentMax) : '');
    setSortDir(isCurrentSort ? (currentParams.sortDir ?? 'desc') : '');
    setOpen(true);
  }

  function handleReset(): void {
    const params: Record<string, string> = {
      page: '1',
      [`${meta.urlParam}Min`]: '',
      [`${meta.urlParam}Max`]: '',
    };
    if (isCurrentSort) {
      params['sortBy'] = '';
      params['sortDir'] = '';
    }
    navigateTo(params);
    setOpen(false);
  }

  function handleApply(): void {
    const min = mode !== 'lte' && minInput.trim() !== '' ? Number(minInput) : undefined;
    const max = mode !== 'gte' && maxInput.trim() !== '' ? Number(maxInput) : undefined;

    const params: Record<string, string> = {
      page: '1',
      [`${meta.urlParam}Min`]: min !== undefined && !Number.isNaN(min) ? String(min) : '',
      [`${meta.urlParam}Max`]: max !== undefined && !Number.isNaN(max) ? String(max) : '',
    };

    if (sortDir !== '') {
      params['sortBy'] = meta.sortValue;
      params['sortDir'] = sortDir;
    } else if (isCurrentSort) {
      params['sortBy'] = '';
      params['sortDir'] = '';
    }

    navigateTo(params);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter') handleApply();
  }

  const isActive = currentMin !== undefined || currentMax !== undefined || isCurrentSort;

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${isActive ? styles.triggerActive : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          open ? setOpen(false) : openPanel();
        }}
        aria-label={`Фильтр и сортировка по ${meta.label}`}
        aria-expanded={open}
      >
        <span className={styles.triggerIcon}>▽</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={styles.panel}
          style={coords ? { top: coords.top, left: coords.left } : undefined}
        >
          <div className={styles.panelHeader}>{meta.label}</div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Значение</span>
            <div className={styles.rowContent}>
              <select
                className={styles.modeSelect}
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="gte">Больше</option>
                <option value="lte">Меньше</option>
                <option value="range">Диапазон</option>
              </select>

              {mode !== 'lte' && (
                <input
                  type="number"
                  className={styles.numberInput}
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={String(meta.min)}
                  min={meta.min}
                  max={meta.max}
                />
              )}

              {mode === 'range' && <span className={styles.rangeDash}>—</span>}

              {mode !== 'gte' && (
                <input
                  type="number"
                  className={styles.numberInput}
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={String(meta.max)}
                  min={meta.min}
                  max={meta.max}
                />
              )}
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Сортировка</span>
            <div className={styles.rowContent}>
              <select
                className={styles.modeSelect}
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as '' | 'asc' | 'desc')}
              >
                <option value="">Не сортировать</option>
                <option value="asc">Возрастание</option>
                <option value="desc">Убывание</option>
              </select>
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.resetBtn} onClick={handleReset}>
              Сбросить
            </button>
            <button type="button" className={styles.applyBtn} onClick={handleApply}>
              Применить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}