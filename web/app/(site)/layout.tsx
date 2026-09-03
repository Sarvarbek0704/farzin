import type { ReactNode } from 'react';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { AuthProvider } from '@/lib/auth';
import { getLocale } from '@/lib/i18n.server';
import { PlaySocketProvider } from '@/lib/play-socket';

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
 *
 * `PlaySocketProvider` ham shu yerda va AYNI sababga o'xshash sabab
 * bilan: o'yin boshlangani haqidagi xabar foydalanuvchi QAYSI
 * sahifada bo'lishidan qat'i nazar yetib borishi kerak
 * (lib/play-socket.tsx dagi izohga qarang).
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <>
      <SiteHeader locale={locale} />
      <main className="container" style={{ paddingTop: 40, paddingBottom: 88, flex: 1 }}>
        <AuthProvider>
          <PlaySocketProvider>{children}</PlaySocketProvider>
        </AuthProvider>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
