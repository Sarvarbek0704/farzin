import Link from 'next/link';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth';

/**
 * Auth qobig'i — MINIMAL: logo va markazlashtirilgan kontent.
 *
 * Kirish ekrani ilova navigatsiyasini ko'rsatmaydi (dizayn brifi §6.2
 * "logged-out navbar" alohida holat): foydalanuvchi bu yerda bitta ish
 * qiladi — kiradi. Sayt qobig'i (header/footer) chalg'itish bo'lardi.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="diag" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '20px 24px' }}>
        <Link href="/" className="wordmark">
          <span className="logo-mark" aria-hidden="true" />
          Farzin
        </Link>
      </header>

      <AuthProvider>{children}</AuthProvider>

      <footer style={{ padding: '20px 24px', textAlign: 'center' }}>
        <Link href="/" className="crumb" style={{ marginBottom: 0 }}>
          Bosh sahifaga qaytish
        </Link>
      </footer>
    </div>
  );
}
