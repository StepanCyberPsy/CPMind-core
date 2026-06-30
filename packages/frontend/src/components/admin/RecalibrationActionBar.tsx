'use client';

import { useState, useEffect } from 'react';
import type { WorkspaceMode } from './RecalibrationWorkspace';
import styles from '@/styles/recalibration.module.css';

interface Props {
  mode: WorkspaceMode;
  selectedCount: number;
  totalMatching: number;
  canRecalculate: boolean;
  submitting: boolean;
  expiresAt: string | null;
  onRecalculate: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function RecalibrationActionBar({
  mode,
  selectedCount,
  totalMatching,
  canRecalculate,
  submitting,
  expiresAt,
  onRecalculate,
  onDiscard,
  onSave,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const remainingMs = expiresAt !== null ? new Date(expiresAt).getTime() - now : null;

  return (
    <div className={`${styles.actionBar} ${mode === 'ready' ? styles.actionBarDraft : ''}`}>
      <div className={styles.actionBarInfo}>
        {mode === 'select' && (
          <span className={styles.selectionCount}>
            Выбрано: {selectedCount.toLocaleString('ru-RU')} из {totalMatching.toLocaleString('ru-RU')}
          </span>
        )}
        {mode === 'processing' && (
          <span className={styles.draftLabel}>
            <span className={styles.spinner} />
            Рассчитываем черновик…
          </span>
        )}
        {mode === 'ready' && remainingMs !== null && (
          <span className={styles.draftLabel}>
            ⚠ Черновик не сохранён — автоотмена через {formatCountdown(remainingMs)}
          </span>
        )}
        {mode === 'error' && (
          <span className={styles.errorLabel}>Произошла ошибка</span>
        )}
      </div>

      <div className={styles.actionBarButtons}>
        <button
          type="button"
          className={styles.recalculateBtn}
          onClick={onRecalculate}
          disabled={mode !== 'select' || !canRecalculate || submitting}
        >
          {submitting && mode === 'select' ? 'Создание…' : 'Пересчитать'}
        </button>
        <button
          type="button"
          className={styles.discardBtn}
          onClick={onDiscard}
          disabled={mode !== 'ready' || submitting}
        >
          Отменить
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={onSave}
          disabled={mode !== 'ready' || submitting}
        >
          {submitting && mode === 'ready' ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}