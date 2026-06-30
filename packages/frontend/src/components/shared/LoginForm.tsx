'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPublicBackendUrl } from '@/lib/shared/env';
import styles from '@/styles/login.module.css';

const BACKEND = getPublicBackendUrl();

export function LoginForm() {
  const router = useRouter();

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!login.trim() || !password.trim()) {
      setError('Введите логин и пароль');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ login: login.trim(), password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }

      if (res.status === 401) {
        setError('Неверный логин или пароль');
        return;
      }

      setError('Ошибка сервера. Попробуйте позже.');
    } catch {
      setError('Нет соединения с сервером');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className={styles.field}>
        <label className={styles.label}>Логин</label>
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="cpmind"
          autoComplete="username"
          disabled={loading}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={loading}
        />
      </div>

      {error !== null && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <button
        className={styles.submit}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Вход...' : 'Войти'}
      </button>
    </div>
  );
}