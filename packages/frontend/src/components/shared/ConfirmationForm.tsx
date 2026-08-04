'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '@/styles/confirmation-form.module.css';

interface Props {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationForm({
  message,
  confirmLabel,
  cancelLabel,
  isLoading,
  onConfirm,
  onCancel,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}