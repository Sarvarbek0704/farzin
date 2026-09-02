'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type SyntheticEvent } from 'react';

import { useAuth } from '@/lib/auth';

/**
 * Hakam / administrator kirishi.
 *
 * Bu ekran `(auth)` guruhida — sayt navigatsiyasisiz, markazda
 * (dizayn brifi §6.2). Foydalanuvchi bu yerda bitta ish qiladi.
 */
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
    <div className="centered-shell">
      <div>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <span className="kicker">Hakam konsoli</span>
          <h1 style={{ fontSize: 30, marginTop: 8 }}>Konsolga kirish</h1>
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            Hakam, tashkilotchi va administratorlar uchun.
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="card stack" style={{ gap: 16 }}>
          <label>
            <span className="label">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              className="field"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          </label>

          <label>
            <span className="label">Parol</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="field"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </label>

          {error !== null && (
            <p role="alert" className="small" style={{ color: 'var(--burgundy)', margin: 0 }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary btn-lg btn-block">
            {busy ? 'Tekshirilmoqda…' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}
