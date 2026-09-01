'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { LOCALES, LOCALE_COOKIE, LOCALE_LABEL, type Locale } from '@/lib/i18n';

/**
 * Til almashtirgich — dizayn brifi §2 talabi:
 * `uz-Latn` · `uz-Cyrl` · `Ru` · `En`.
 *
 * Tanlov cookie'ga yoziladi va `router.refresh()` server komponentlarni
 * yangi til bilan qayta chizadi — sahifa to'liq qayta yuklanmaydi.
 *
 * ⚠️  Cookie `Lax`: til tanlovi sir emas va boshqa saytdan kelganda ham
 *     saqlanishi kerak. `httpOnly` EMAS — buni klient o'zi o'qiydi.
 */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(locale: Locale): void {
    // 1 yil — til tanlovi kamdan-kam o'zgaradi.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="Til / Language"
      style={{ display: 'flex', gap: 4, marginLeft: 'auto', opacity: pending ? 0.6 : 1 }}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => {
            select(locale);
          }}
          aria-current={locale === current ? 'true' : undefined}
          title={LOCALE_LABEL[locale]}
          style={{
            background: 'transparent',
            border: '1px solid var(--hairline)',
            borderRadius: 6,
            padding: '3px 7px',
            font: 'inherit',
            fontSize: 12,
            cursor: 'pointer',
            color: locale === current ? 'var(--accent)' : 'var(--ink-secondary)',
            borderColor: locale === current ? 'var(--accent)' : 'var(--hairline)',
          }}
        >
          {SHORT[locale]}
        </button>
      ))}
    </div>
  );
}

/** Qisqa yorliq — navigatsiyada joy kam. */
const SHORT: Record<Locale, string> = {
  'uz-Latn': 'UZ',
  'uz-Cyrl': 'ЎЗ',
  ru: 'RU',
  en: 'EN',
};
