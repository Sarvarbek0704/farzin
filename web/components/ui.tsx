import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Umumiy UI bo'laklari — dizayn tizimining React tomoni.
 *
 * ⚠️  BO'SH va XATO holatlari birinchi darajali ekran (dizayn brifi §7):
 *     foydalanuvchi ularni muvaffaqiyatli holatdan KAM ko'rmaydi.
 */

/** Sahifa boshi: kicker + serif sarlavha + izoh. Hamma sahifada BIR XIL. */
export function PageHeader({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      {kicker !== undefined && (
        <div>
          <span className="kicker">{kicker}</span>
        </div>
      )}
      <h1 style={{ marginTop: kicker !== undefined ? 10 : 0 }}>{title}</h1>
      {subtitle !== undefined && <p className="muted">{subtitle}</p>}
      {children}
    </header>
  );
}

/**
 * Bo'sh holat — donaning silueti bilan (brif §4.3: "piece glyphs double
 * as empty-state art"). Har doim SABAB va imkon bo'lsa keyingi qadam.
 */
export function EmptyState({
  title,
  hint,
  glyph = '♟',
}: {
  title: string;
  hint?: string;
  glyph?: string;
}) {
  return (
    <div className="card empty">
      <span className="empty-glyph" aria-hidden="true">
        {glyph}
      </span>
      <p style={{ margin: 0, fontWeight: 500 }}>{title}</p>
      {hint !== undefined && (
        <p className="muted small" style={{ margin: '8px auto 0', maxWidth: '48ch' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Xato holati — texnik detal ko'rsatilmaydi, qadam aytiladi. */
export function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="card empty"
      role="alert"
      style={{ borderColor: 'color-mix(in srgb, var(--burgundy) 45%, transparent)' }}
    >
      <span className="empty-glyph" aria-hidden="true">
        ♚
      </span>
      <p style={{ margin: 0, fontWeight: 500, color: 'var(--burgundy)' }}>
        Ma`lumotni olishning iloji bo`lmadi
      </p>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        {message}
      </p>
    </div>
  );
}

/** Unvon nishoni — GM/IM/... oltin rangda, KAM ishlatiladi (brif: gilt sparing). */
export function TitleTag({ title }: { title: string | null }) {
  if (title === null || title === '') {
    return null;
  }
  return <span className="title-tag">{title} </span>;
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

/** "Orqaga" havolasi — har ichki sahifada bir xil joy va ko'rinish. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="crumb">
      {children}
    </Link>
  );
}
