'use client';

import { useCallback, useEffect, useState } from 'react';

import { BackLink, EmptyState, PageHeader } from '@/components/ui';
import { ADMIN, AUDIT_ACTIONS, type AuditLogRow } from '@/lib/admin';
import { isSuperAdmin, readJson, useAuth } from '@/lib/auth';

/**
 * AUDIT LOG — o'zgarmas iz.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAQAT O'QISH — VA BU KOD DARAJASIDA EMAS, BAZADA
 *
 *  `audit_logs` jadvali PostgreSQL trigger'i bilan himoyalangan:
 *  UPDATE va DELETE RAD ETILADI. Matritsada ham hech kimda C/U/D yo'q
 *  — SUPER_ADMIN da ham (docs/01 §4.1). Shuning uchun bu ekranda
 *  birorta yozuv tugmasi yo'q va bo'lmaydi ham.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Sabab (`reason`) hozircha alohida ustun emas — u `after` JSONB
 *  ichida saqlanadi (docs/AUDIT.md K-9). Shuning uchun quyida u
 *  tafsilotdan ajratib ko'rsatiladi.
 */
export default function AuditPage() {
  const { accessToken, session, authFetch } = useAuth();

  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = isSuperAdmin(session);

  const load = useCallback(
    async (filter: string | null): Promise<void> => {
      const params = new URLSearchParams({ first: '50' });
      if (filter !== null) {
        params.set('action', filter);
      }
      const page = await readJson<{ items: AuditLogRow[] }>(
        await authFetch(`${ADMIN.auditLogs}?${params.toString()}`),
      );
      // Cursor pagination oldinga (id ASC) — eng yangisi oxirida.
      // Ekranda esa yangisi TEPADA bo'lishi kerak.
      setRows([...page.items].reverse());
    },
    [authFetch],
  );

  useEffect(() => {
    if (!allowed) {
      return;
    }
    void load(action).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Xato');
    });
  }, [allowed, load, action]);

  if (accessToken === undefined || session === undefined) {
    return <div className="skeleton" style={{ height: 240 }} />;
  }

  if (!allowed) {
    return (
      <>
        <PageHeader kicker="Ma'muriyat" title="Audit" />
        <EmptyState title="Bu bo'lim superadmin uchun" glyph="♜" />
      </>
    );
  }

  return (
    <>
      <BackLink href="/konsol/admin">Foydalanuvchilar</BackLink>

      <PageHeader
        kicker="Ma'muriyat"
        title="Audit"
        subtitle="Har muhim o'zgarish izi. Yozuvlar o'zgartirilmaydi va o'chirilmaydi — buni DB trigger'i qo'riqlaydi."
      />

      <div className="tabs" role="tablist" aria-label="Amal turi" style={{ marginBottom: 20 }}>
        <button
          type="button"
          role="tab"
          aria-selected={action === null}
          className="tab-btn"
          onClick={() => {
            setAction(null);
          }}
        >
          Hammasi
        </button>
        {AUDIT_ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={action === a}
            className="tab-btn"
            onClick={() => {
              setAction(a);
            }}
          >
            {a}
          </button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      {rows === null ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Yozuv yo'q"
          hint="Bu amal turi bo'yicha hali hech narsa qayd etilmagan."
          glyph="♟"
        />
      ) : (
        <ul className="person-list">
          {rows.map((row) => (
            <li key={row.id} className="person-item">
              <div className="audit-head">
                <code className="audit-action">{row.action}</code>
                <span className="muted small tabular">{formatMoment(row.createdAt)}</span>
              </div>

              <p className="muted small" style={{ margin: '6px 0 0' }}>
                {row.resourceType}
                {row.resourceId !== null && ` · ${row.resourceId}`}
                {row.actorUserId !== null && ` · aktor ${row.actorUserId}`}
                {row.actorUserId === null && ' · tizim'}
              </p>

              {reasonOf(row) !== null && (
                <p className="audit-reason">
                  <strong>Sabab:</strong> {reasonOf(row)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Sababni JSONB ichidan olish.
 *
 * `AuditService` uni `after.reason` ga yozadi (alohida ustun yo'q —
 * docs/AUDIT.md K-9). Shakl kutilganidan boshqacha bo'lsa `null`
 * qaytadi: bu ekran ma'lumot shaklidagi kutilmagan farqdan
 * YIQILMASLIGI kerak.
 */
function reasonOf(row: AuditLogRow): string | null {
  if (typeof row.after !== 'object' || row.after === null) {
    return null;
  }
  const reason = (row.after as { reason?: unknown }).reason;
  return typeof reason === 'string' && reason.trim() !== '' ? reason : null;
}

/** Sana + vaqt — audit uchun daqiqa aniqligi kerak. */
function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
