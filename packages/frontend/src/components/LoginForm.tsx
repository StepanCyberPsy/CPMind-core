'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const BACKEND = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? '';

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
        router.push('/impressions');
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#0f1117',
    border: '1px solid #2d3748',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    color: '#a0aec0',
    marginBottom: '6px',
    fontWeight: '500',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    backgroundColor: loading ? '#2d3748' : '#00ff88',
    color: loading ? '#718096' : '#0f1117',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px',
  };

  return (
    <div>
      {/* Логин */}
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>Логин</label>
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="cpmind"
          autoComplete="username"
          disabled={loading}
          style={inputStyle}
        />
      </div>

      {/* Пароль */}
      <div style={{ marginBottom: '24px' }}>
        <label style={labelStyle}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={loading}
          style={inputStyle}
        />
      </div>

      {/* Ошибка */}
      {error !== null && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 14px',
          backgroundColor: 'rgba(255, 77, 77, 0.1)',
          border: '1px solid rgba(255, 77, 77, 0.3)',
          borderRadius: '8px',
          color: '#fc8181',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Кнопка */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={buttonStyle}
      >
        {loading ? 'Вход...' : 'Войти'}
      </button>
    </div>
  );
}