'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { EmptyState, PageHeader } from '@/components/ui';
import {
  ADMIN,
  ROLE_LABEL,
  STATUS_LABEL,
  statusClass,
  type AdminUser,
  type Role,
  type UserStatus,
} from '@/lib/admin';
import { isSuperAdmin, readJson, useAuth } from '@/lib/auth';
import { fullName, initials } from '@/lib/format';

/**
 * MA'MURIYAT — foydalanuvchilar va rollar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU EKRAN KERAK EDI
 *
 *  RBAC matritsasi to'liq yozilgan va CI bilan qo'riqlanadi, lekin
 *  rol BERADIGAN yo'l umuman yo'q edi: rollar faqat seed yoki qo'lda
 *  SQL bilan paydo bo'lardi. Ya'ni ishlab turgan platformada hakam
 *  tayinlab ham bo'lmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Ruxsat tekshiruvi SERVERDA (`/admin/*` global `User` huquqini
 *  talab qiladi va aks holda 404 beradi). Bu yerdagi shart faqat
 *  foydalanuvchini bo'sh ekranga olib bormaslik uchun.
 */

const STATUS_FILTERS: readonly UserStatus[] = [
  'ACTIVE',
  'PENDING_VERIFICATION',
  'SUSPENDED',
  'BANNED',
];

const ROLE_FILTERS: readonly Role[] = ['SUPER_ADMIN', 'FEDERATION_ADMIN', 'ARBITER', 'COACH'];

interface Stats {
  users: number;
  active: number;
  suspended: number;
  players: number;
  tournaments: number;
  activeGames: number;
  openCases: number;
}

export default function AdminPage() {
  const { accessToken, session, authFetch } = useAuth();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowed = isSuperAdmin(session);

  const load = useCallback(
    async (query: { search: string; status: UserStatus | null; role: Role | null }) => {
      const params = new URLSearchParams({ first: '50' });
      // Qidiruv 2 harfdan qisqa bo'lsa umuman yuborilmaydi — backend
      // uni 400 bilan rad etardi.
      if (query.search.trim().length >= 2) {
        params.set('search', query.search.trim());
      }
      if (query.status !== null) {
        params.set('status', query.status);
      }
      if (query.role !== null) {
        params.set('role', query.role);
      }
      const page = await readJson<{ items: AdminUser[] }>(
        await authFetch(`${ADMIN.users}?${params.toString()}`),
      );
      setUsers(page.items);
    },
    [authFetch],
  );

  useEffect(() => {
    if (!allowed) {
      return;
    }
    void (async () => {
      try {
        setStats(await readJson<Stats>(await authFetch(ADMIN.stats)));
      } catch {
        // Xulosa ikkinchi darajali — u kelmasa ham ro'yxat ishlaydi.
      }
    })();
  }, [allowed, authFetch]);

  // Qidiruv har harfda emas, 300 ms tinchlikdan keyin.
  useEffect(() => {
    if (!allowed) {
      return;
    }
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      void load({ search, status, role }).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Xato');
      });
    }, 300);

    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, [allowed, load, search, status, role]);

  if (accessToken === undefined || session === undefined) {
    return <PanelSkeleton />;
  }

  if (!allowed) {
    return (
      <>
        <PageHeader kicker="Ma'muriyat" title="Foydalanuvchilar" />
        <EmptyState
          title="Bu bo'lim superadmin uchun"
          hint="Sizda global boshqaruv huquqi yo'q. Kerak bo'lsa mavjud superadminga murojaat qiling."
          glyph="♜"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Ma'muriyat"
        title="Foydalanuvchilar"
        subtitle="Rol berish, olib tashlash va hisobni bloklash. Har amal sabab talab qiladi va audit'ga tushadi."
      />

      {stats !== null && (
        <div className="stat-grid">
          <Stat label="Foydalanuvchi" value={stats.users} />
          <Stat label="Faol" value={stats.active} />
          <Stat label="Bloklangan" value={stats.suspended} />
          <Stat label="O'yinchi" value={stats.players} />
          <Stat label="Turnir" value={stats.tournaments} />
          <Stat label="Jonli o'yin" value={stats.activeGames} />
          <Stat label="Ochiq fair-play ishi" value={stats.openCases} />
        </div>
      )}

      <div className="card" style={{ marginTop: 24, marginBottom: 20 }}>
        <label className="label" htmlFor="admin-search">
          Qidirish
        </label>
        <input
          id="admin-search"
          type="search"
          className="field"
          placeholder="Email, telefon yoki ism…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          autoComplete="off"
        />

        <div className="filter-row">
          <FilterGroup
            label="Holat"
            options={STATUS_FILTERS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            selected={status}
            onSelect={setStatus}
          />
          <FilterGroup
            label="Rol"
            options={ROLE_FILTERS.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            selected={role}
            onSelect={setRole}
          />
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      {users === null ? (
        <PanelSkeleton />
      ) : users.length === 0 ? (
        <EmptyState
          title="Hech kim topilmadi"
          hint="Qidiruv shartlarini yumshating yoki filtrlarni tozalang."
          glyph="♟"
        />
      ) : (
        <ul className="person-list">
          {users.map((u) => (
            <li key={u.id} className="person-item">
              <div className="person-row">
                <span className="avatar" aria-hidden="true">
                  {initials(u.firstName, u.lastName)}
                </span>
                <span className="person-name">
                  <Link href={`/konsol/admin/${u.id}`} style={{ fontWeight: 500 }}>
                    {u.firstName === null
                      ? (u.email ?? 'Nomsiz')
                      : fullName(u.firstName, u.lastName)}
                  </Link>
                  <span className="muted small" style={{ display: 'block' }}>
                    {u.email ?? u.phone ?? '—'}
                  </span>
                </span>
                <span className="person-actions">
                  {u.roles.map((r) => (
                    <span key={r.id} className="badge">
                      {ROLE_LABEL[r.role]}
                      {r.scopeType !== null && ' ·'}
                    </span>
                  ))}
                  <span className={statusClass(u.status)}>{STATUS_LABEL[u.status]}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value tabular">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/**
 * Filtr guruhi — bitta tanlov, qayta bosilsa TOZALANADI.
 *
 * "Hammasi" tugmasi qo'shilmadi: tanlangan tugmani qayta bosish shu
 * ma'noni beradi va bir tugma kam bo'ladi.
 */
function FilterGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <div>
      <span className="filter-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-current={selected === option.value}
            onClick={() => {
              onSelect(selected === option.value ? null : option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="skeleton" style={{ height: 60 }} />
      <div className="skeleton" style={{ height: 60 }} />
      <div className="skeleton" style={{ height: 60 }} />
    </div>
  );
}
