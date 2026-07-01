'use client';

import { useState } from 'react';
import { usePopover } from '@/lib/shared/use-popover';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';
import { type SignalMeta, type SignalField } from '@/lib/shared/signals-meta';
import type { UserListParams } from '@/lib/user/api';
import styles from '@/styles/signal-filter-modal.module.css';

interface SignalFilterModalProps {
  meta: SignalMeta;
  currentParams: UserListParams;
  navigateTo: (params: Record<string, string>) => void;
}

type RangeMode = 'gte' | 'lte' | 'range' | 'eq';

const MODE_OPTIONS: ComboboxOption[] = [
  { value: 'gte', label: 'Больше' },
  { value: 'lte', label: 'Меньше' },
  { value: 'range', label: 'Диапазон' },
  { value: 'eq', label: 'Равно' },
];

const SORT_DIR_OPTIONS: ComboboxOption[] = [
  { value: 'none', label: 'Не сортировать' },
  { value: 'asc', label: 'Возрастание' },
  { value: 'desc', label: 'Убывание' },
];

function getCurrentMin(
  field: SignalField,
  params: UserListParams,
): number | undefined {
  if (field === 'score_final') return params.scoreMin;
  if (field === 's1_normalized') return params.s1Min;
  if (field === 's2_normalized') return params.s2Min;
  if (field === 's3_normalized') return params.s3Min;
  if (field === 's4_normalized') return params.s4Min;
  if (field === 's5_normalized') return params.s5Min;
  return params.s7Min;
}

function getCurrentMax(
  field: SignalField,
  params: UserListParams,
): number | undefined {
  if (field === 'score_final') return params.scoreMax;
  if (field === 's1_normalized') return params.s1Max;
  if (field === 's2_normalized') return params.s2Max;
  if (field === 's3_normalized') return params.s3Max;
  if (field === 's4_normalized') return params.s4Max;
  if (field === 's5_normalized') return params.s5Max;
  return params.s7Max;
}

function initRangeMode(
  min: number | undefined,
  max: number | undefined,
): RangeMode {
  if (min !== undefined && max !== undefined) {
    return min === max ? 'eq' : 'range';
  }
  if (max !== undefined) return 'lte';
  return 'gte';
}

function normalizedToDisplay(value: number): string {
  return value.toFixed(1);
}

export function SignalFilterModal({
  meta,
  currentParams,
  navigateTo,
}: SignalFilterModalProps) {
  const { open, setOpen, triggerRef, panelRef, coords } = usePopover();

  const currentMin = getCurrentMin(meta.field, currentParams);
  const currentMax = getCurrentMax(meta.field, currentParams);
  const isCurrentSort = currentParams.sortBy === meta.sortValue;

  const [mode, setMode] = useState<RangeMode>('gte');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [eqInput, setEqInput] = useState('');
  const [sortDir, setSortDir] = useState<'' | 'asc' | 'desc'>('');

  function openPanel(): void {
    const initialMode = initRangeMode(currentMin, currentMax);
    setMode(initialMode);
    setMinInput(currentMin !== undefined ? normalizedToDisplay(currentMin) : '');
    setMaxInput(currentMax !== undefined ? normalizedToDisplay(currentMax) : '');
    setEqInput(
      currentMin !== undefined && currentMin === currentMax
        ? normalizedToDisplay(currentMin)
        : '',
    );
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
    const params: Record<string, string> = { page: '1' };

    if (mode === 'eq') {
      const v = parseFloat(eqInput);
      if (!Number.isNaN(v)) {
        const base = Math.floor(v * 10) / 10;
        params[`${meta.urlParam}Min`] = String(base);
        params[`${meta.urlParam}Max`] = String(Math.round((base + 0.1) * 10) / 10);
      } else {
        params[`${meta.urlParam}Min`] = '';
        params[`${meta.urlParam}Max`] = '';
      }
    } else {
      const rawMin = mode !== 'lte' ? parseFloat(minInput) : NaN;
      const rawMax = mode !== 'gte' ? parseFloat(maxInput) : NaN;

      if (!Number.isNaN(rawMin)) {
        const min = mode === 'gte'
          ? Math.round((rawMin + 0.001) * 1000) / 1000
          : Math.floor(rawMin * 10) / 10;
        params[`${meta.urlParam}Min`] = String(min);
      } else {
        params[`${meta.urlParam}Min`] = '';
      }

      if (!Number.isNaN(rawMax)) {
        const max = mode === 'lte'
          ? Math.round((rawMax - 0.001) * 1000) / 1000
          : Math.ceil(rawMax * 10) / 10;
        params[`${meta.urlParam}Max`] = String(max);
      } else {
        params[`${meta.urlParam}Max`] = '';
      }
    }

    if (meta.allowSort) {
      if (sortDir !== '') {
        params['sortBy'] = meta.sortValue;
        params['sortDir'] = sortDir;
      } else if (isCurrentSort) {
        params['sortBy'] = '';
        params['sortDir'] = '';
      }
    }

    navigateTo(params);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') handleApply();
  }

  const isActive =
    currentMin !== undefined || currentMax !== undefined || isCurrentSort;

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${isActive ? styles.triggerActive : ''}`}
        onClick={(e) => {
          e.stopPropagation();
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
              <div className={styles.comboboxMode}>
                <Combobox
                  options={MODE_OPTIONS}
                  value={mode}
                  onChange={(v) => setMode(v as RangeMode)}
                  placeholder="Режим"
                  includeAll={false}
                  includeSearch={false}
                />
              </div>

              {mode === 'eq' && (
                <input
                  type="number"
                  className={styles.numberInput}
                  value={eqInput}
                  onChange={(e) => setEqInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min={0}
                  max={100}
                  step={0.1}
                />
              )}

              {mode !== 'lte' && mode !== 'eq' && (
                <input
                  type="number"
                  className={styles.numberInput}
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min={0}
                  max={100}
                  step={0.1}
                />
              )}

              {mode === 'range' && (
                <span className={styles.rangeDash}>—</span>
              )}

              {mode !== 'gte' && mode !== 'eq' && (
                <input
                  type="number"
                  className={styles.numberInput}
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min={0}
                  max={100}
                  step={0.1}
                />
              )}
            </div>
          </div>

          {meta.allowSort && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Сортировка</span>
              <div className={styles.rowContent}>
                <div className={styles.comboboxSort}>
                  <Combobox
                    options={SORT_DIR_OPTIONS}
                    value={sortDir === '' ? 'none' : sortDir}
                    onChange={(v) => setSortDir(v === 'none' ? '' : v as 'asc' | 'desc')}
                    placeholder="Сортировка"
                    includeAll={false}
                    includeSearch={false}
                  />
                </div>
              </div>
            </div>
          )}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={handleReset}
            >
              Сбросить
            </button>
            <button
              type="button"
              className={styles.applyBtn}
              onClick={handleApply}
            >
              Применить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}