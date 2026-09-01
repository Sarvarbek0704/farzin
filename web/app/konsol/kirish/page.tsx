'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type SyntheticEvent } from 'react';

import { useAuth } from '@/lib/auth';

/** Hakam/administrator kirishi. */
export default function LoginPage() {
  const { accessToken, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Allaqachon kirilgan bo'lsa (cookie tirik) konsolga o'tkazamiz.
  useEffect(() => {
    if (accessToken !== null && accessToken !== undefined) {
      router.replace('/konsol');
    }
  }, [accessToken, router]);

  async function onSubmit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/konsol');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kirishning iloji bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <div className="board-rule" style={{ width: 72, marginBottom: 14 }} />
      <h1 style={{ fontSize: 30, marginBottom: 6 }}>Konsolga kirish</h1>
      <p className="muted small" style={{ marginTop: 0, marginBottom: 20 }}>
        Hakam, tashkilotchi va administratorlar uchun.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="card stack" style={{ gap: 14 }}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="small">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            style={inputStyle}
          />
        </label>

        <label className="stack" style={{ gap: 6 }}>
          <span className="small">Parol</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            style={inputStyle}
          />
        </label>

        {error !== null && (
          <p role="alert" className="small" style={{ color: 'var(--burgundy)', margin: 0 }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? 'Tekshirilmoqda…' : 'Kirish'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--hairline)',
  borderRadius: 8,
  color: 'var(--ink)',
  padding: '9px 11px',
  font: 'inherit',
};

const buttonStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#0b0f0c',
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};
