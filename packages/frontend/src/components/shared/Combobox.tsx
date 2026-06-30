'use client';

import {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from 'react';
import { usePopover } from '@/lib/shared/use-popover';
import styles from '@/styles/combobox.module.css';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  allLabel?: string;
  includeAll?: boolean;
}

// Кастомный select с поиском внутри списка. Первая строка — псевдо-опция "Все" (value: ''), не фильтруется поиском
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  allLabel = 'Все',
  includeAll = true,
}: ComboboxProps) {
  const { open, setOpen, triggerRef, panelRef, coords } = usePopover();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (query.trim() === '') return options;
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  const rows = useMemo<ComboboxOption[]>(
    () => includeAll
      ? [{ value: '', label: allLabel }, ...filteredOptions]
      : filteredOptions,
    [allLabel, filteredOptions, includeAll],
  );

  const selectedLabel = useMemo(() => {
    if (includeAll && value === '') return allLabel;

    const found = options.find((option) => option.value === value);
    return found ? found.label : value;
  }, [allLabel, includeAll, options, value]);

  const openPanel = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
  }, [open]);

  const selectRow = useCallback((row: ComboboxOption) => {
    onChange(row.value);
    setOpen(false);
    triggerRef.current?.focus();
  }, [onChange, setOpen, triggerRef]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) selectRow(row);
    }
  }

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value === '' ? styles.triggerPlaceholder : styles.triggerValue}>
          {value === '' ? placeholder : selectedLabel}
        </span>
        <span className={styles.triggerIcon}>▾</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={styles.panel}
          style={coords ? { top: coords.top, left: coords.left } : undefined}
          role="listbox"
        >
          <input
            ref={searchInputRef}
            type="text"
            className={styles.search}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Поиск..."
          />
          <div className={styles.list}>
            {rows.length === 0 ? (
              <div className={styles.empty}>Ничего не найдено</div>
            ) : (
              rows.map((row, index) => (
                <button
                  key={row.value || '__all__'}
                  type="button"
                  role="option"
                  aria-selected={row.value === value}
                  className={`${styles.option} ${index === activeIndex ? styles.optionActive : ''} ${row.value === value ? styles.optionSelected : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectRow(row)}
                >
                  {row.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}