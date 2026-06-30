'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePopover } from '@/lib/shared/use-popover';
import { createUser } from '@/lib/admin/api';
import styles from '@/styles/create-user-form.module.css';

const MIN_LOGIN_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 12;

export function CreateUserForm() {
  const router = useRouter();
  const { open, setOpen, triggerRef, panelRef, coords } = usePopover();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openPanel(): void {
    setLogin('');
    setPassword('');
    setPasswordVisible(false);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(): Promise<void> {
    if (login.trim().length < MIN_LOGIN_LENGTH) {
      setError(`Логин должен содержать не менее ${MIN_LOGIN_LENGTH} символов`);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createUser({ login: login.trim(), password });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать пользователя');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter') handleSubmit();
  }

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
      >
        + Создать пользователя
      </button>

      {open && (
        <div
          ref={panelRef}
          className={styles.panel}
          style={coords ? { top: coords.top, left: coords.left } : undefined}
        >
          <div className={styles.panelHeader}>Новый пользователь</div>

          <div className={styles.field}>
            <label className={styles.label}>Логин</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="login"
              autoComplete="off"
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Пароль</label>
            <div className={styles.passwordRow}>
              <input
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="••••••••••••"
                autoComplete="new-password"
                disabled={submitting}
              />
              <button
                type="button"
                className={styles.toggleVisibilityBtn}
                onClick={() => setPasswordVisible((v) => !v)}
                aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {passwordVisible ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error !== null && (
            <div className={styles.error}>{error}</div>
          )}

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={() => setOpen(false)} disabled={submitting}>
              Отмена
            </button>
            <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}