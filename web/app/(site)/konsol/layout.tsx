'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';

/**
 * Hakam konsoli — himoyalangan bo'lim.
 *
 * ⚠️  BU HIMOYA EMAS, QULAYLIK. Haqiqiy tekshiruv HAR DOIM serverda:
 *     backend RBAC guard'i ruxsatsiz so'rovni 404 bilan rad etadi
 *     (docs/04-api-spec.md §2.4). Bu yerdagi shart shunchaki
 *     foydalanuvchini bo'sh ekranga olib bormaslik uchun.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  // AuthProvider YO'Q — u (site)/layout da yagona (u yerdagi izohga qarang).
  return <ConsoleShell>{children}</ConsoleShell>;
}

const TABS = [
  { href: '/konsol', label: 'Turnirlar' },
  { href: '/konsol/fairplay', label: 'Fair-play' },
] as const;

function ConsoleShell({ children }: { children: ReactNode }) {
  const { accessToken, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Kirilmagan — kirish ekraniga. U (auth) guruhida, o'z qobig'i bilan.
  useEffect(() => {
    if (accessToken === null) {
      router.replace('/konsol/kirish');
    }
  }, [accessToken, router]);

  if (accessToken === undefined || accessToken === null) {
    // Sessiya aniqlanmoqda yoki redirect ketmoqda — skelet, sakrash emas.
    return (
      <div className="stack" style={{ gap: 14 }}>
        <div className="skeleton" style={{ height: 40, width: 280 }} />
        <div className="skeleton" style={{ height: 16, width: 380 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  return (
    <>
      <div className="subnav">
        <nav aria-label="Konsol" className="site-nav" style={{ marginLeft: -12 }}>
          {TABS.map((tab) => {
            const active =
              tab.href === '/konsol'
                ? pathname === '/konsol' || pathname.startsWith('/konsol/turnir')
                : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <button type="button" onClick={() => void logout()} className="btn">
          Chiqish
        </button>
      </div>
      {children}
    </>
  );
}
