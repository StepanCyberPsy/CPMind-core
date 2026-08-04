'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPublicBackendUrl } from '@/lib/shared/env';
import { ConfirmationForm } from '@/components/shared/ConfirmationForm';
import styles from '@/styles/logout-button.module.css';

const BACKEND = getPublicBackendUrl();

export function LogoutButton() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm(): Promise<void> {
    setLoading(true);
    try {
      await fetch(`${BACKEND}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      router.push('/login');
    } catch {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        onClick={() => setDialogOpen(true)}
      >
        Выйти
      </button>
      {dialogOpen && (
        <ConfirmationForm
          message="Вы уверены, что хотите выйти из аккаунта?"
          confirmLabel="Выйти"
          cancelLabel="Отмена"
          isLoading={loading}
          onConfirm={handleConfirm}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}