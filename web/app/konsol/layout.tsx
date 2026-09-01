'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';

/**
 * Hakam konsoli — himoyalangan bo'lim.
 *
 * ⚠️  BU HIMOYA EMAS, QULAYLIK. Haqiqiy tekshiruv HAR DOIM serverda:
 *     backend RBAC guard'i ruxsatsiz so'rovni 404 bilan rad etadi
 *     (docs/04-api-spec.md §2.4). Bu yerdagi shart shunchaki
 *     foydalanuvchini bo'sh ekranga olib bormaslik uchun.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </AuthProvider>
  );
}

function ConsoleShell({ children }: { children: ReactNode }) {
  const { accessToken, logout } = useAuth();
  const pathname = usePathname();
  const onLoginPage = pathname === '/konsol/kirish';

  if (accessToken === undefined) {
    return <p className="muted">Yuklanmoqda…</p>;
  }

  if (accessToken === null && !onLoginPage) {
    return (
      <div className="card" style={{ maxWidth: 460 }}>
        <h2 style={{ marginBottom: 8 }}>Kirish talab qilinadi</h2>
        <p className="muted small">Hakam konsoli faqat autentifikatsiyadan keyin ochiladi.</p>
        <Link href="/konsol/kirish">Kirish sahifasiga o`tish →</Link>
      </div>
    );
  }

  return (
    <>
      {accessToken !== null && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <nav style={{ display: 'flex', gap: 16 }}>
            <Link href="/konsol" style={{ fontWeight: 500 }}>
              Konsol
            </Link>
          </nav>
          <button
            type="button"
            onClick={() => void logout()}
            className="badge"
            style={{ cursor: 'pointer', background: 'transparent' }}
          >
            Chiqish
          </button>
        </div>
      )}
      {children}
    </>
  );
}
