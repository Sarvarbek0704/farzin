'use client';

import { use, useCallback, useEffect, useState } from 'react';

import { TextField } from '@/components/form';
import { BackLink, Card, ErrorState, PageHeader } from '@/components/ui';
import {
  ADMIN,
  REASON_MIN_LENGTH,
  ROLE_LABEL,
  SCOPE_FOR_ROLE,
  SCOPE_LABEL,
  STATUS_LABEL,
  statusClass,
  type AdminUser,
  type Role,
  type ScopeType,
} from '@/lib/admin';
import { isSuperAdmin, readJson, useAuth } from '@/lib/auth';
import { formatDate, fullName, initials } from '@/lib/format';

/**
 * Bitta foydalanuvchi — rollari, rol berish va hisob holati.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SABAB — HAR AMALDA MAJBURIY
 *
 *  Backend `role.granted`, `role.revoked` va `user.status_changed`
 *  yozuvlarini sababsiz RAD ETADI (`AuditService` REASON_REQUIRED).
 *  Shuning uchun bu yerda sabab maydonisiz tugma umuman yo'q — u
 *  "keyin to'ldiraman" degan holatni imkonsiz qiladi.
 *
 *  Bu shunchaki formallik emas: rol o'zgarishi keyinchalik
 *  "kim ruxsat bergan?" degan savolga javob bo'lishi kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Sabab maydonining izohi — uch joyda bir xil. */
const REASON_HINT = `Kamida ${String(REASON_MIN_LENGTH)} belgi. Audit'ga yoziladi va keyin o'chirilmaydi.`;

const ALL_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'FEDERATION_ADMIN',
  'REGION_ADMIN',
  'CLUB_ADMIN',
  'ARBITER',
  'COACH',
  'SCHOOL_TEACHER',
  'PLAYER',
  'PARENT',
  'SPECTATOR',
];

export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken, session, authFetch } = useAuth();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allowed = isSuperAdmin(session);

  const load = useCallback(async (): Promise<void> => {
    setUser(await readJson<AdminUser>(await authFetch(ADMIN.user(id))));
  }, [authFetch, id]);

  useEffect(() => {
    if (!allowed) {
      return;
    }
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Xato');
    });
  }, [allowed, load]);

  /** Yozuv amali — natijadan keyin ro'yxat SERVERDAN qayta o'qiladi. */
  const send = useCallback(
    async (path: string, method: 'POST' | 'DELETE' | 'PATCH', body: unknown): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await authFetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const problem = (await res.json().catch(() => ({}))) as { title?: string };
          throw new Error(problem.title ?? "Amalni bajarib bo'lmadi");
        }
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Xato');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [authFetch, load],
  );

  if (accessToken === undefined || session === undefined) {
    return <div className="skeleton" style={{ height: 220 }} />;
  }

  if (!allowed) {
    return <ErrorState message="Bu bo'lim superadmin uchun." />;
  }

  if (user === null) {
    return error === null ? (
      <div className="skeleton" style={{ height: 220 }} />
    ) : (
      <ErrorState message={error} />
    );
  }

  const isSelf = session?.userId === user.id;

  return (
    <>
      <BackLink href="/konsol/admin">Foydalanuvchilar</BackLink>

      <PageHeader
        kicker="Ma'muriyat"
        title={
          user.firstName === null
            ? (user.email ?? 'Nomsiz')
            : fullName(user.firstName, user.lastName)
        }
      >
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <span className={statusClass(user.status)}>{STATUS_LABEL[user.status]}</span>
          {user.emailVerified && <span className="badge">Email tasdiqlangan</span>}
          {user.totpEnabled && <span className="badge">2FA yoqilgan</span>}
          {isSelf && <span className="badge">Bu — siz</span>}
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          {user.email ?? user.phone ?? '—'} · ro&apos;yxatdan o&apos;tgan{' '}
          {formatDate(user.createdAt)}
          {user.lastLoginAt !== null && ` · oxirgi kirish ${formatDate(user.lastLoginAt)}`}
        </p>
      </PageHeader>

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      <h2 className="section-title" style={{ marginTop: 8 }}>
        Rollar
      </h2>

      {user.roles.length === 0 ? (
        <Card>
          <p className="muted" style={{ margin: 0 }}>
            Rol berilmagan. Ro&apos;yxatdan o&apos;tganda beriladigan{' '}
            <strong>{ROLE_LABEL.PLAYER}</strong> roli ham ko&apos;rinmayapti — bu odatiy emas.
          </p>
        </Card>
      ) : (
        <ul className="person-list">
          {user.roles.map((r) => (
            <li key={r.id} className="person-item">
              <RoleRow
                role={r.role}
                scope={
                  r.scopeType === null ? null : `${SCOPE_LABEL[r.scopeType]} · ${r.scopeId ?? ''}`
                }
                expiresAt={r.expiresAt}
                busy={busy}
                onRevoke={(reason) => send(ADMIN.role(r.id), 'DELETE', { reason })}
              />
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title" style={{ marginTop: 32 }}>
        Rol berish
      </h2>
      <GrantForm busy={busy} onSubmit={(body) => send(ADMIN.roles(user.id), 'POST', body)} />

      <h2 className="section-title" style={{ marginTop: 32 }}>
        Hisob holati
      </h2>
      <StatusForm
        current={user.status}
        isSelf={isSelf}
        busy={busy}
        onSubmit={(body) => send(ADMIN.status(user.id), 'PATCH', body)}
      />
    </>
  );
}

/** Mavjud rol — olib tashlash sabab bilan, tasdiq QATOR ICHIDA. */
function RoleRow({
  role,
  scope,
  expiresAt,
  busy,
  onRevoke,
}: {
  role: Role;
  scope: string | null;
  expiresAt: string | null;
  busy: boolean;
  onRevoke: (reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <>
      <div className="person-row">
        <span className="avatar" aria-hidden="true">
          {initials(role.charAt(0), role.charAt(1))}
        </span>
        <span className="person-name">
          {ROLE_LABEL[role]}
          <span className="muted small" style={{ display: 'block' }}>
            {scope ?? 'Global'}
            {expiresAt !== null && ` · ${formatDate(expiresAt)} gacha`}
          </span>
        </span>
        <span className="person-actions">
          {!open && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOpen(true);
              }}
            >
              Olib tashlash
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="challenge-panel">
          <TextField
            label="Nega olib tashlanmoqda?"
            value={reason}
            onChange={setReason}
            hint={REASON_HINT}
          />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || reason.trim().length < REASON_MIN_LENGTH}
              onClick={() => {
                void onRevoke(reason.trim()).then((ok) => {
                  if (ok) {
                    setOpen(false);
                    setReason('');
                  }
                });
              }}
            >
              Olib tashlash
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
              }}
            >
              Bekor qilish
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface GrantBody {
  role: Role;
  scopeType?: ScopeType;
  scopeId?: string;
  expiresAt?: string;
  reason: string;
}

/**
 * Rol berish formasi.
 *
 * Qamrov maydoni ROLGA QARAB paydo bo'ladi (`SCOPE_FOR_ROLE`): global
 * rolga qamrov so'rash foydalanuvchini chalg'itardi, qamrov talab
 * qiladigan rolni esa qamrovsiz yuborish 422 bilan qaytardi.
 */
function GrantForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (body: GrantBody) => Promise<boolean>;
}) {
  const [role, setRole] = useState<Role>('ARBITER');
  const [scopeType, setScopeType] = useState<ScopeType | null>(null);
  const [scopeId, setScopeId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');

  const allowedScopes = SCOPE_FOR_ROLE[role];
  const scopeRequired = !allowedScopes.includes(null);
  // Rol o'zgarganda joriy tanlov mos kelmasligi mumkin.
  const effectiveScope = allowedScopes.includes(scopeType) ? scopeType : (allowedScopes[0] ?? null);

  const ready =
    reason.trim().length >= REASON_MIN_LENGTH && (effectiveScope === null || scopeId.trim() !== '');

  return (
    <Card>
      <label className="label" htmlFor="grant-role">
        Rol
      </label>
      <select
        id="grant-role"
        className="field"
        value={role}
        onChange={(e) => {
          setRole(e.target.value as Role);
          setScopeType(null);
          setScopeId('');
        }}
      >
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>

      {allowedScopes.length > 1 && (
        <>
          <span className="filter-label" style={{ marginTop: 14 }}>
            Qamrov
          </span>
          <div className="seg" role="group" aria-label="Qamrov turi">
            {allowedScopes.map((s) => (
              <button
                key={s ?? 'global'}
                type="button"
                aria-current={effectiveScope === s}
                onClick={() => {
                  setScopeType(s);
                  setScopeId('');
                }}
              >
                {s === null ? 'Global' : SCOPE_LABEL[s]}
              </button>
            ))}
          </div>
        </>
      )}

      {effectiveScope !== null && (
        <div style={{ marginTop: 14 }}>
          <TextField
            label={`${SCOPE_LABEL[effectiveScope]} ID (UUID)`}
            value={scopeId}
            onChange={setScopeId}
            hint={
              scopeRequired
                ? 'Bu rol qamrovsiz berilmaydi — u butun platformaga tarqalib ketardi.'
                : 'Qamrov tanlangani uchun ID majburiy.'
            }
          />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <label className="label" htmlFor="grant-expires">
          Muddat (ixtiyoriy)
        </label>
        <input
          id="grant-expires"
          type="date"
          className="field"
          value={expiresAt}
          onChange={(e) => {
            setExpiresAt(e.target.value);
          }}
        />
        <p className="field-hint">
          Turnir hakami uchun turnir tugagan sanani qo&apos;ying — rol o&apos;zi tugaydi.
        </p>
      </div>

      <div style={{ marginTop: 14 }}>
        <TextField
          label="Nega bu rol berilmoqda?"
          value={reason}
          onChange={setReason}
          hint={REASON_HINT}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 16 }}
        disabled={busy || !ready}
        onClick={() => {
          void onSubmit({
            role,
            ...(effectiveScope !== null && {
              scopeType: effectiveScope,
              scopeId: scopeId.trim(),
            }),
            ...(expiresAt !== '' && { expiresAt: new Date(expiresAt).toISOString() }),
            reason: reason.trim(),
          }).then((ok) => {
            if (ok) {
              setReason('');
              setScopeId('');
              setExpiresAt('');
            }
          });
        }}
      >
        Rolni berish
      </button>
    </Card>
  );
}

/** Bloklash / tiklash — o'zini bloklash tugmasi UMUMAN ko'rsatilmaydi. */
function StatusForm({
  current,
  isSelf,
  busy,
  onSubmit,
}: {
  current: string;
  isSelf: boolean;
  busy: boolean;
  onSubmit: (body: { status: string; reason: string }) => Promise<boolean>;
}) {
  const [reason, setReason] = useState('');
  const blocked = current === 'SUSPENDED' || current === 'BANNED';

  if (isSelf) {
    return (
      <Card>
        <p className="muted" style={{ margin: 0 }}>
          O&apos;z hisobingizni bloklay olmaysiz. Bu qulf ataylab: bir bosishda kirish huquqidan
          ayrilish qaytarib bo&apos;lmaydigan xato bo&apos;lardi.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <TextField
        label={blocked ? 'Nega tiklanmoqda?' : 'Nega bloklanmoqda?'}
        value={reason}
        onChange={setReason}
        hint={REASON_HINT}
      />

      <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {blocked ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || reason.trim().length < REASON_MIN_LENGTH}
            onClick={() => {
              void onSubmit({ status: 'ACTIVE', reason: reason.trim() }).then((ok) => {
                if (ok) {
                  setReason('');
                }
              });
            }}
          >
            Hisobni tiklash
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy || reason.trim().length < REASON_MIN_LENGTH}
              onClick={() => {
                void onSubmit({ status: 'SUSPENDED', reason: reason.trim() }).then((ok) => {
                  if (ok) {
                    setReason('');
                  }
                });
              }}
            >
              Vaqtincha to&apos;xtatish
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || reason.trim().length < REASON_MIN_LENGTH}
              onClick={() => {
                void onSubmit({ status: 'BANNED', reason: reason.trim() }).then((ok) => {
                  if (ok) {
                    setReason('');
                  }
                });
              }}
            >
              Bloklash
            </button>
          </>
        )}
      </div>

      <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
        Bloklash mavjud sessiyalarni ham yopadi — foydalanuvchi darhol chiqariladi.
      </p>
    </Card>
  );
}
