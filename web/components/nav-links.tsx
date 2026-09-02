'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Asosiy navigatsiya — FAOL bo'lim belgilanadi.
 *
 * Bu klient komponenti, chunki faol holat joriy URL'dan keladi
 * (`usePathname`). Belgi rang + vazn bilan, chiziqsiz: editorial
 * uslubda pastki chiziq shovqin (globals.css dagi qarorga mos).
 */
export function NavLinks({ items }: { items: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Asosiy" className="site-nav">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
