import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';

import { getLocale } from '@/lib/i18n.server';

import './globals.css';

/**
 * ILDIZ layout — faqat hujjat qobig'i: til, shriftlar, meta.
 *
 * Sarlavha paneli va pastki qism BU YERDA EMAS — ular `(site)`
 * guruhida. Sabab: kirish sahifasi ilova navigatsiyasini
 * ko'rsatmasligi kerak (u `(auth)` guruhida, o'z minimal qobig'i
 * bilan). Ilgari hammasi ildizda edi va auth ekrani umumiy sayt
 * ichida "suzib" yurardi.
 */

/**
 * Uch shrift oilasi — dizayn brifi §4.2.
 *
 * ⚠️  HAR BIRI KIRILLNI QO'LLASHI SHART (brif §2 "hard type
 *     constraint"): til almashtirgichda `uz-Cyrl` va `ru` bor.
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${playfair.variable} ${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
