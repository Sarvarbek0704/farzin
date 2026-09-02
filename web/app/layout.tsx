import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter, Playfair_Display } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { LanguageSwitcher } from '@/components/language-switcher';
import { translate } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n.server';

import './globals.css';

/**
 * Uch shrift oilasi — dizayn tizimi §04.
 *
 * ⚠️  HAR BIRI KIRILL HARFLARINI QO'LLASHI SHART: til almashtirgichda
 *     `uz-Cyrl` va `ru` bor (dizayn brifi §2 — "hard type constraint").
 *     Playfair, Inter va IBM Plex Mono uchalasi ham kirillni qo'llaydi.
 *     `subsets` da `cyrillic` shu sababli.
 */
const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['600', '700'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: "Farzin — O'zbekiston shaxmatining raqamli infratuzilmasi",
    template: '%s · Farzin',
  },
  description:
    "Turnir kalendari, jonli jadval va milliy Glicko-2 reyting. O'zbekiston shaxmati uchun ochiq ma'lumotlar.",
};

/** Navigatsiya — yorliqlar lug'atdan (dizayn tizimidagi LOCALES jadvali). */
const NAV = [
  { href: '/turnirlar', key: 'nav.tournaments' },
  { href: '/oyin', key: 'nav.play' },
  { href: '/reyting', key: 'nav.ratings' },
  { href: '/konsol', key: 'nav.console' },
] as const;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${playfair.variable} ${inter.variable} ${mono.variable}`}>
      <body>
        {/*
          Balandlik CSS'da (`.site-header`), inline emas: mobil ekranda
          qat'iy 60px o'ralgan qatorni QIRQARDI. Endi balandlik
          minimal, kontent esa o'sishi mumkin.
        */}
        <header className="site-header">
          <div className="container site-header-inner">
            <Link
              href="/"
              style={{
                fontFamily: 'var(--font-playfair), serif',
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--ink)',
              }}
            >
              Farzin
            </Link>

            <nav aria-label="Asosiy" className="site-nav">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ color: 'var(--ink-secondary)', fontSize: 14, fontWeight: 500 }}
                >
                  {translate(locale, item.key)}
                </Link>
              ))}
            </nav>

            <LanguageSwitcher current={locale} />
          </div>
        </header>

        <main className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
          {children}
        </main>

        <footer
          style={{
            borderTop: '1px solid var(--hairline)',
            padding: '20px 0',
            marginTop: 'auto',
          }}
        >
          <div className="container muted small">
            {/*
              HALOLLIK: bu ilova hozircha FAQAT ommaviy o'qish qismini
              qamraydi. Hakam konsoli va onlayn o'yin — keyingi bo'laklar.
              Foydalanuvchini "hammasi tayyor" degan taassurotga
              solmaslik uchun buni ochiq yozamiz.
            */}
            {translate(locale, 'footer.note')}
          </div>
        </footer>
      </body>
    </html>
  );
}
