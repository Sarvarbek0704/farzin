'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * O'yin bo'limi qobig'i.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUBNAV TAXTA USTIDA KO'RINMAYDI
 *
 *  `/oyin` va `/oyin/dostlar` — bir bo'limning ikki ekrani, ular
 *  orasida o'tish kerak. `/oyin/{id}` esa O'YIN EKRANI: u yerda soat
 *  ishlayapti va har qanday qo'shimcha havola diqqatni bo'ladi
 *  (dizayn brifi §5.11 — o'yin ekrani boshqa hamma narsadan tozalanadi).
 *
 *  Shuning uchun subnav faqat ro'yxat ekranlarida chiziladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const TABS = [
  { href: '/oyin', label: 'Navbat' },
  { href: '/oyin/dostlar', label: "Do'stlar" },
] as const;

export default function PlayLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showNav = TABS.some((tab) => tab.href === pathname);

  if (!showNav) {
    return <>{children}</>;
  }

  return (
    <>
      <nav aria-label="O'yin bo'limi" className="site-nav" style={{ marginLeft: -12 }}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
