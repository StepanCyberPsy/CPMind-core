'use client';

import {
  useState,
  useMemo,
  useCallback,
} from 'react';
import { usePopover } from '@/lib/shared/use-popover';
import {
  toISODate,
  parseISODate,
  isSameDay,
  getMonthMatrix,
  MONTH_LABELS,
  WEEKDAY_LABELS,
} from '@/lib/shared/date';
import styles from '@/styles/combobox.module.css';

interface ComboboxDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function ComboboxDatePicker({
  value,
  onChange,
  placeholder,
}: ComboboxDatePickerProps) {
  const { open, setOpen, triggerRef, panelRef, coords } = usePopover();
  const selectedDate = useMemo(() => (value ? parseISODate(value) : null), [value]);
  const today = useMemo(() => new Date(), []);

  const [viewYear, setViewYear] = useState(() => (selectedDate ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selectedDate ?? today).getMonth());

  const weeks = useMemo(() => getMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const openPanel = useCallback(() => {
    const base = selectedDate ?? today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setOpen(true);
  }, [selectedDate, today, setOpen]);

  const goToPrevMonth = useCallback(() => {
    setViewMonth((month) => {
      if (month === 0) {
        setViewYear((year) => year - 1);
        return 11;
      }
      return month - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((month) => {
      if (month === 11) {
        setViewYear((year) => year + 1);
        return 0;
      }
      return month + 1;
    });
  }, []);

  function selectDay(day: Date): void {
    onChange(toISODate(day));
    setOpen(false);
    triggerRef.current?.focus();
  }

  function clearSelection(): void {
    onChange('');
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value === '' ? styles.triggerPlaceholder : styles.triggerValue}>
          {value === '' ? placeholder : value}
        </span>
        <span className={styles.triggerIcon} aria-hidden="true">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            focusable="false"
          >
            <path
              d="M7 3v3M17 3v3M4.5 9h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={styles.datePanel}
          style={coords ? { top: coords.top, left: coords.left } : undefined}
        >
          <div className={styles.dateHeader}>
            <button type="button" className={styles.dateNavBtn} onClick={goToPrevMonth}>
              ‹
            </button>
            <span className={styles.dateHeaderLabel}>
              {MONTH_LABELS[viewMonth] ?? ''} {viewYear}
            </span>
            <button type="button" className={styles.dateNavBtn} onClick={goToNextMonth}>
              ›
            </button>
          </div>

          <div className={styles.dateWeekdays}>
            {WEEKDAY_LABELS.map((label) => (
              <span key={label} className={styles.dateWeekdayLabel}>{label}</span>
            ))}
          </div>

          <div className={styles.dateGrid}>
            {weeks.flatMap((week, weekIndex) =>
              week.map((day, dayIndex) => {
                const isCurrentMonth = day.getMonth() === viewMonth;
                const isSelected = selectedDate !== null && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, today);
                return (
                  <button
                    key={`${weekIndex}-${dayIndex}`}
                    type="button"
                    className={`${styles.dateCell} ${isCurrentMonth ? '' : styles.dateCellMuted} ${isSelected ? styles.dateCellSelected : ''} ${isToday ? styles.dateCellToday : ''}`}
                    onClick={() => selectDay(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              }),
            )}
          </div>

          {value !== '' && (
            <button type="button" className={styles.dateClearBtn} onClick={clearSelection}>
              Очистить
            </button>
          )}
        </div>
      )}
    </div>
  );
}