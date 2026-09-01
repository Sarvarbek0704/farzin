import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Umumiy UI bo'laklari.
 *
 * ⚠️  BO'SH va XATO holatlari BIRINCHI DARAJALI ekran (dizayn brifi):
 *     "empty/error/loading states" alohida talab qilingan. Ular
 *     keyinroq qo'shiladigan bezak emas — foydalanuvchi ularni
 *     muvaffaqiyatli holatdan KAM ko'rmaydi.
 */

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header style={{ marginBottom: 24 }}>
      <div className="board-rule" style={{ width: 96, marginBottom: 14 }} />
      <h1>{title}</h1>
      {subtitle !== undefined && (
        <p className="muted" style={{ marginTop: 8, marginBottom: 0, maxWidth: '62ch' }}>
          {subtitle}
        </p>
      )}
      {children}
    </header>
  );
}

/**
 * Bo'sh holat.
 *
 * Har doim SABABNI aytadi va — imkon bo'lsa — keyingi qadamni beradi.
 * "Ma'lumot yo'q" degan yolg'iz jumla foydalanuvchini boshi berk
 * ko'chaga olib boradi.
 */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div
        className="board-rule"
        aria-hidden="true"
        style={{ width: 64, margin: '0 auto 16px', opacity: 0.5 }}
      />
      <p style={{ margin: 0, fontWeight: 500 }}>{title}</p>
      {hint !== undefined && (
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Xato holati.
 *
 * Texnik detal KO'RSATILMAYDI (backend ham RFC 9457 da faqat traceId
 * beradi) — foydalanuvchiga nima qilishini aytamiz.
 */
export function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="card"
      role="alert"
      style={{ borderColor: 'rgba(155,44,44,.45)', textAlign: 'center', padding: '32px 20px' }}
    >
      <p style={{ margin: 0, fontWeight: 500, color: 'var(--burgundy)' }}>
        Ma`lumotni olishning iloji bo`lmadi
      </p>
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        {message}
      </p>
    </div>
  );
}

/** Unvon nishoni — GM/IM/... oltin rangda, KAM ishlatiladi. */
export function TitleTag({ title }: { title: string | null }) {
  if (title === null || title === '') {
    return null;
  }
  return <span className="title-tag">{title} </span>;
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

/** Sahifa ichidagi "orqaga" havolasi. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="small" style={{ display: 'inline-block', marginBottom: 12 }}>
      ← {children}
    </Link>
  );
}
