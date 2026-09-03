'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type SyntheticEvent } from 'react';

import { PasswordField, TextField } from '@/components/form';
import { useAuth } from '@/lib/auth';
import { translate, type Locale, type MessageKey } from '@/lib/i18n';

/**
 * Auth ekrani — KIRISH · RO'YXATDAN O'TISH · PAROLNI TIKLASH.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  UCHALASI BITTA EKRANDA (dizayn brifi §6.2)
 *
 *  Ilgari faqat kirish bor edi: ro'yxatdan o'tish yo'li umuman yo'q,
 *  parolni tiklash yo'q (backend'da `password/forgot` BOR edi, lekin
 *  UI unga hech qachon murojaat qilmasdi), parolni ko'rish tugmasi yo'q.
 *
 *  Rejim URL'ni o'zgartirmaydi: bu bitta vazifaning uch qadami, alohida
 *  sahifa emas — orqaga tugmasi foydalanuvchini formadan chiqarib
 *  yubormasligi kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Mode = 'signIn' | 'signUp' | 'forgot';

/** Server bilan BIR XIL qoidalar (register.dto.ts) — takroriy urinishsiz xato. */
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const { accessToken, login } = useAuth();
  const router = useRouter();

  // Til cookie'dan keladi; klient komponentida `document.cookie` orqali.
  const [locale, setLocale] = useState<Locale>('uz-Latn');
  useEffect(() => {
    const match = /farzin_locale=([^;]+)/.exec(document.cookie);
    const value = match?.[1];
    if (value === 'uz-Cyrl' || value === 'ru' || value === 'en' || value === 'uz-Latn') {
      setLocale(value);
    }
  }, []);
  const t = (key: MessageKey): string => translate(locale, key);

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (accessToken !== null && accessToken !== undefined) {
      router.replace('/konsol');
    }
  }, [accessToken, router]);

  function switchMode(next: Mode): void {
    setMode(next);
    setErrors({});
    setFormError(null);
    setSent(false);
  }

  /** Yuborishdan OLDIN tekshirish — server javobini kutmasdan. */
  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) {
      next.email = t('auth.emailInvalid');
    }
    if (mode !== 'forgot' && password.length < MIN_PASSWORD) {
      next.password = t('auth.passwordShort');
    }
    if (mode === 'signUp') {
      if (firstName.trim() === '') {
        next.firstName = t('auth.required');
      }
      if (lastName.trim() === '') {
        next.lastName = t('auth.required');
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);
    if (!validate()) {
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await login(email, password);
        router.replace('/konsol');
        return;
      }

      if (mode === 'signUp') {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, firstName, lastName, locale }),
          keepalive: true,
        });
        if (!res.ok) {
          const problem = (await res.json().catch(() => ({}))) as { title?: string };
          throw new Error(problem.title ?? t('error.title'));
        }
        // Ro'yxatdan o'tish darhol sessiya beradi — kirish takrorlanmaydi.
        await login(email, password);
        router.replace('/konsol');
        return;
      }

      // forgot — javob HAR DOIM 204 (hisob borligini oshkor qilmaslik uchun).
      await fetch('/api/v1/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        keepalive: true,
      });
      setSent(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('error.title'));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'signIn'
      ? t('auth.signIn')
      : mode === 'signUp'
        ? t('auth.signUp')
        : t('auth.forgotTitle');
  const subtitle =
    mode === 'signIn'
      ? t('auth.signInSubtitle')
      : mode === 'signUp'
        ? t('auth.signUpSubtitle')
        : t('auth.forgotSubtitle');
  const submitLabel =
    mode === 'signIn' ? t('auth.signIn') : mode === 'signUp' ? t('auth.signUp') : t('auth.signIn');
  const busyLabel =
    mode === 'signIn' ? t('auth.busy') : mode === 'signUp' ? t('auth.creating') : t('auth.sending');

  return (
    <div className="centered-shell">
      <div>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <span className="kicker">Farzin</span>
          <h1 style={{ fontSize: 30, marginTop: 10 }}>{title}</h1>
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            {subtitle}
          </p>
        </div>

        {mode !== 'forgot' && (
          <div className="auth-tabs" role="tablist" aria-label={t('auth.signIn')}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signIn'}
              onClick={() => {
                switchMode('signIn');
              }}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signUp'}
              onClick={() => {
                switchMode('signUp');
              }}
            >
              {t('auth.signUp')}
            </button>
          </div>
        )}

        <form onSubmit={(e) => void onSubmit(e)} className="card stack" style={{ gap: 16 }} noValidate>
          {mode === 'signUp' && (
            <div className="name-row">
              <TextField
                label={t('auth.firstName')}
                value={firstName}
                onChange={setFirstName}
                autoComplete="given-name"
                error={errors.firstName ?? null}
                required
              />
              <TextField
                label={t('auth.lastName')}
                value={lastName}
                onChange={setLastName}
                autoComplete="family-name"
                error={errors.lastName ?? null}
                required
              />
            </div>
          )}

          <TextField
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="username"
            error={errors.email ?? null}
            required
            autoFocus
          />

          {mode !== 'forgot' && (
            <PasswordField
              label={t('auth.password')}
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              error={errors.password ?? null}
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
              {...(mode === 'signUp' ? { hint: t('auth.passwordHint') } : {})}
            />
          )}

          {sent && <p className="notice-ok">{t('auth.forgotSent')}</p>}

          {formError !== null && (
            <p role="alert" className="small" style={{ color: 'var(--burgundy)', margin: 0 }}>
              {formError}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary btn-lg btn-block">
            {busy ? busyLabel : submitLabel}
          </button>
        </form>

        <div className="auth-foot">
          {mode === 'signIn' && (
            <>
              <button
                type="button"
                onClick={() => {
                  switchMode('forgot');
                }}
              >
                {t('auth.forgot')}
              </button>
            </>
          )}
          {mode === 'signUp' && (
            <>
              <span>{t('auth.haveAccount')}</span>
              <button
                type="button"
                onClick={() => {
                  switchMode('signIn');
                }}
              >
                {t('auth.signIn')}
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => {
                switchMode('signIn');
              }}
            >
              {t('auth.backToSignIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
