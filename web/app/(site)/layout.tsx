import type { ReactNode } from 'react';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { AuthProvider } from '@/lib/auth';
import { getLocale } from '@/lib/i18n.server';

/**
 * Sayt qobig'i — sarlavha paneli, kontent, pastki qism.
 *
 * AuthProvider SHU YERDA, bo'limlarda emas. Sabab jonli sinovda
 * topilgan xato: har bo'lim (konsol, oyin) o'z provider'ini ko'tarsa,
 * bo'limlararo har o'tish YANGI refresh so'rovi degani. Navigatsiya
 * in-flight refresh'ni bekor qilsa, server allaqachon AYLANTIRGAN
 * cookie javobi yo'qoladi — keyingi refresh eski token bilan boradi
 * va reuse-detection BUTUN sessiyani bekor qiladi (docs/10 §2.4 da
 * grace period ataylab yo'q). Yagona provider bilan klient ichidagi
 * navigatsiya refresh talab qilmaydi.
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <>
      <SiteHeader locale={locale} />
      <main className="container" style={{ paddingTop: 40, paddingBottom: 88, flex: 1 }}>
        <AuthProvider>{children}</AuthProvider>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
