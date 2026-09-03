'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ChallengePicker } from '@/components/challenge-picker';
import { EmptyState, PageHeader, TitleTag } from '@/components/ui';
import { readJson, useAuth } from '@/lib/auth';
import { fullName, initials } from '@/lib/format';
import {
  FRIENDS,
  MIN_SEARCH_LENGTH,
  playerSearchPath,
  type FriendRow,
  type PlayerSearchRow,
} from '@/lib/friends';

/**
 * Do'stlar — ro'yxat, so'rovlar, bloklanganlar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  HAR AMALDAN KEYIN RO'YXAT QAYTA O'QILADI
 *
 *  Optimistik yangilash (qatorni darhol o'chirib qo'yish) tezroq
 *  ko'rinardi, lekin bu ekranda holat IKKI TOMONLAMA: raqib ham shu
 *  paytda qabul qilishi, rad etishi yoki bloklashi mumkin. Optimistik
 *  UI bunday holatda YOLG'ON ko'rsatadi — "do'st qo'shildi", holbuki
 *  server rad etgan.
 *
 *  Ro'yxatlar kichik (chegara 200) va so'rov arzon, shuning uchun
 *  haqiqat manbai bitta bo'lib qoladi: server.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Tab = 'friends' | 'requests' | 'blocked';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'friends', label: "Do'stlarim" },
  { id: 'requests', label: "So'rovlar" },
  { id: 'blocked', label: 'Bloklanganlar' },
];

export default function FriendsPage() {
  const { accessToken, authFetch } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [requests, setRequests] = useState<FriendRow[] | null>(null);
  const [blocked, setBlocked] = useState<FriendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Ayni paytda ochiq bo'lgan chaqiriq paneli (do'stlik ID'si). */
  const [challenging, setChallenging] = useState<string | null>(null);
  /** Tasdiq kutayotgan xavfli amal: `${friendshipId}:${action}`. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** So'rov ketayotgan qator — tugmalar ikki marta bosilmasin. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [a, b, c] = await Promise.all([
      readJson<FriendRow[]>(await authFetch(FRIENDS.list)),
      readJson<FriendRow[]>(await authFetch(FRIENDS.requests)),
      readJson<FriendRow[]>(await authFetch(FRIENDS.blocks)),
    ]);
    setFriends(a);
    setRequests(b);
    setBlocked(c);
  }, [authFetch]);

  useEffect(() => {
    if (accessToken === undefined || accessToken === null) {
      return;
    }
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Xato');
    });
  }, [accessToken, load]);

  if (accessToken === undefined) {
    return <ListSkeleton />;
  }

  if (accessToken === null) {
    return (
      <>
        <PageHeader kicker="Onlayn" title="Do'stlar" />
        <div className="card empty">
          <span className="empty-glyph" aria-hidden="true">
            ♟
          </span>
          <p style={{ margin: 0, fontWeight: 500 }}>Do&apos;stlar ro&apos;yxati shaxsiy</p>
          <p className="muted small" style={{ margin: '8px auto 18px', maxWidth: '46ch' }}>
            Uni ko&apos;rish uchun hisobingizga kiring.
          </p>
          <Link href="/konsol/kirish" className="btn btn-primary">
            Kirish →
          </Link>
        </div>
      </>
    );
  }

  const incoming = (requests ?? []).filter((r) => !r.outgoing);
  const outgoing = (requests ?? []).filter((r) => r.outgoing);
  const counts: Record<Tab, number | null> = {
    friends: friends?.length ?? null,
    requests: incoming.length === 0 ? null : incoming.length,
    blocked: blocked?.length ?? null,
  };

  return (
    <>
      <PageHeader
        kicker="Onlayn"
        title="Do'stlar"
        subtitle="Do'stingizni toping, so'rov yuboring va istalgan vaqt nazoratida o'ynang."
      />

      <AddFriend onDone={() => void load()} />

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      <div
        className="tabs"
        role="tablist"
        aria-label="Do'stlar bo'limlari"
        style={{ marginTop: 8 }}
      >
        {TABS.map((t) => {
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="tab-btn"
              onClick={() => {
                setTab(t.id);
                setChallenging(null);
                setConfirming(null);
              }}
            >
              {t.label}
              {/* Faqat KELGAN so'rovlar sanaladi: yuborilganlari e'tibor
                  talab qilmaydi va nishon "ish bor" degan yolg'on
                  signal berardi. */}
              {count !== null && count > 0 && (
                <span
                  className={t.id === 'requests' ? 'count-pill count-pill-alert' : 'count-pill'}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        {tab === 'friends' &&
          (friends === null ? (
            <ListSkeleton />
          ) : friends.length === 0 ? (
            <EmptyState
              title="Hali do'st qo'shilmagan"
              hint="Yuqoridagi qidiruvdan ism yoki familiyani yozing — topilgan o'yinchiga so'rov yuboring."
              glyph="♟"
            />
          ) : (
            <ul className="person-list">
              {friends.map((f) => (
                <li key={f.friendshipId} className="person-item">
                  <PersonRow row={f}>
                    {confirming === `${f.friendshipId}:remove` ? (
                      <Confirm
                        question="Do'stlikdan chiqarilsinmi?"
                        busy={busyId === f.friendshipId}
                        onYes={() =>
                          void act(f.friendshipId, FRIENDS.end(f.friendshipId), 'DELETE')
                        }
                        onNo={() => {
                          setConfirming(null);
                        }}
                      />
                    ) : confirming === `${f.friendshipId}:block` ? (
                      <Confirm
                        question="Bloklansinmi? U sizga so'rov yubora olmaydi."
                        busy={busyId === f.friendshipId}
                        danger
                        onYes={() =>
                          void act(f.friendshipId, FRIENDS.blocks, 'POST', f.otherPlayerId)
                        }
                        onNo={() => {
                          setConfirming(null);
                        }}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            setChallenging(challenging === f.friendshipId ? null : f.friendshipId);
                          }}
                          aria-expanded={challenging === f.friendshipId}
                        >
                          O&apos;ynash
                        </button>
                        <Link href={`/oyinchi/${f.otherPlayerId}`} className="btn btn-ghost">
                          Profil
                        </Link>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setConfirming(`${f.friendshipId}:remove`);
                          }}
                        >
                          Chiqarish
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setConfirming(`${f.friendshipId}:block`);
                          }}
                        >
                          Bloklash
                        </button>
                      </>
                    )}
                  </PersonRow>

                  {challenging === f.friendshipId && (
                    <ChallengePicker
                      opponentPlayerId={f.otherPlayerId}
                      onCreated={(gameId) => {
                        router.push(`/oyin/${gameId}`);
                      }}
                      onCancel={() => {
                        setChallenging(null);
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          ))}

        {tab === 'requests' &&
          (requests === null ? (
            <ListSkeleton />
          ) : requests.length === 0 ? (
            <EmptyState
              title="So'rov yo'q"
              hint="Sizga yuborilgan so'rovlar va o'zingiz yuborganlari shu yerda ko'rinadi."
              glyph="♞"
            />
          ) : (
            <div className="stack" style={{ gap: 28 }}>
              {incoming.length > 0 && (
                <section>
                  <h2 className="section-title">Sizga kelgan</h2>
                  <ul className="person-list">
                    {incoming.map((r) => (
                      <li key={r.friendshipId} className="person-item">
                        <PersonRow row={r}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busyId === r.friendshipId}
                            onClick={() =>
                              void act(r.friendshipId, FRIENDS.accept(r.friendshipId), 'POST')
                            }
                          >
                            Qabul qilish
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyId === r.friendshipId}
                            onClick={() =>
                              void act(r.friendshipId, FRIENDS.end(r.friendshipId), 'DELETE')
                            }
                          >
                            Rad etish
                          </button>
                        </PersonRow>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {outgoing.length > 0 && (
                <section>
                  <h2 className="section-title">Siz yuborgan</h2>
                  <ul className="person-list">
                    {outgoing.map((r) => (
                      <li key={r.friendshipId} className="person-item">
                        <PersonRow row={r}>
                          <span className="muted small">Javob kutilmoqda</span>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyId === r.friendshipId}
                            onClick={() =>
                              void act(r.friendshipId, FRIENDS.end(r.friendshipId), 'DELETE')
                            }
                          >
                            Bekor qilish
                          </button>
                        </PersonRow>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ))}

        {tab === 'blocked' &&
          (blocked === null ? (
            <ListSkeleton />
          ) : blocked.length === 0 ? (
            <EmptyState
              title="Bloklangan o'yinchi yo'q"
              hint="Bloklangan o'yinchi sizga so'rov yubora olmaydi. Blokni istalgan payt ochasiz."
              glyph="♜"
            />
          ) : (
            <ul className="person-list">
              {blocked.map((b) => (
                <li key={b.friendshipId} className="person-item">
                  <PersonRow row={b}>
                    <button
                      type="button"
                      className="btn"
                      disabled={busyId === b.friendshipId}
                      onClick={() =>
                        void act(b.friendshipId, FRIENDS.unblock(b.friendshipId), 'DELETE')
                      }
                    >
                      Blokni ochish
                    </button>
                  </PersonRow>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </>
  );

  /**
   * Bloklash MAQSAD ID'si bilan ketadi (do'stlik ID'si bilan emas) —
   * backend uni juftlikdan topadi va mavjud qatorni BLOCKED ga
   * o'tkazadi. Shu sababli bu amal `act` ning tanasiga qo'shimcha
   * argument talab qiladi.
   */
  async function act(
    id: string,
    path: string,
    method: 'POST' | 'DELETE',
    blockTargetId?: string,
  ): Promise<void> {
    setBusyId(id);
    setError(null);
    setConfirming(null);
    try {
      const res = await authFetch(path, {
        method,
        ...(blockTargetId !== undefined && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: blockTargetId }),
        }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => ({}))) as { title?: string };
        throw new Error(problem.title ?? "Amalni bajarib bo'lmadi");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    } finally {
      setBusyId(null);
    }
  }
}

/** Bir qator: bosh harflar + ism + amallar. */
function PersonRow({ row, children }: { row: FriendRow; children: ReactNode }) {
  return (
    <div className="person-row">
      <span className="avatar" aria-hidden="true">
        {initials(row.firstName, row.lastName)}
      </span>
      <span className="person-name">
        <TitleTag title={row.title} />
        {fullName(row.firstName, row.lastName)}
      </span>
      <span className="person-actions">{children}</span>
    </div>
  );
}

/**
 * Xavfli amal tasdig'i — QATOR ICHIDA, modal emas.
 *
 * Modal butun ekranni to'sadi va "qaysi odam edi?" degan savol
 * tug'diradi. Qator ichidagi tasdiq kontekstni saqlaydi.
 */
function Confirm({
  question,
  busy,
  danger = false,
  onYes,
  onNo,
}: {
  question: string;
  busy: boolean;
  danger?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <>
      <span className="small" style={{ color: 'var(--ink-secondary)' }}>
        {question}
      </span>
      <button
        type="button"
        className={danger ? 'btn btn-danger' : 'btn'}
        disabled={busy}
        onClick={onYes}
      >
        Ha
      </button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onNo}>
        Yo&apos;q
      </button>
    </>
  );
}

/**
 * Qidiruv natijasidagi bitta qatorning holati.
 *
 * Xato MATNI saqlanadi, chunki u foydali: "allaqachon do'stsiz",
 * "bu odamdan sizga so'rov kelgan" — ikkalasi ham keyingi qadamni
 * aytadi va uni "xatolik" degan umumiy so'z bilan almashtirish
 * ma'lumotni yo'qotardi.
 */
type SendResult = { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * O'yinchi qidiruvi + so'rov yuborish.
 *
 * Qidiruv har harfda EMAS, 300 ms tinchlikdan keyin yuboriladi:
 * "Sar" yozgan odam uchun bu 3 ta emas, 1 ta so'rov.
 */
function AddFriend({ onDone }: { onDone: () => void }) {
  const { authFetch } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sent, setSent] = useState<Record<string, SendResult>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const page = await readJson<{ items: PlayerSearchRow[] }>(
            await authFetch(playerSearchPath(trimmed)),
          );
          setResults(page.items);
        } catch {
          // Qidiruv xatosi butun sahifani buzmasin — bo'sh natija
          // ko'rsatiladi va foydalanuvchi qayta yozishi mumkin.
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);

    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, [query, authFetch]);

  async function send(playerId: string): Promise<void> {
    try {
      const res = await authFetch(FRIENDS.list, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => ({}))) as { title?: string };
        throw new Error(problem.title ?? "So'rov yuborilmadi");
      }
      setSent((prev) => ({ ...prev, [playerId]: { kind: 'sent' } }));
      onDone();
    } catch (e) {
      // Xato AYNAN shu qator ostida ko'rsatiladi: "allaqachon do'stsiz"
      // yoki "so'rov kelgan" — bularning har biri foydali javob.
      setSent((prev) => ({
        ...prev,
        [playerId]: { kind: 'error', message: e instanceof Error ? e.message : 'Xato' },
      }));
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <label className="label" htmlFor="friend-search">
        O&apos;yinchi qidirish
      </label>
      <input
        id="friend-search"
        type="search"
        className="field"
        placeholder="Ism yoki familiya…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        autoComplete="off"
      />

      {query.trim().length > 0 && query.trim().length < MIN_SEARCH_LENGTH && (
        <p className="field-hint">Kamida {MIN_SEARCH_LENGTH} harf yozing.</p>
      )}

      {searching && (
        <p className="field-hint" role="status">
          Qidirilmoqda…
        </p>
      )}

      {results !== null && !searching && results.length === 0 && (
        <p className="field-hint">
          Hech kim topilmadi. Profili yopiq o&apos;yinchilar qidiruvda ko&apos;rinmaydi.
        </p>
      )}

      {results !== null && results.length > 0 && (
        <ul className="person-list" style={{ marginTop: 12 }}>
          {results.map((p) => {
            const state = sent[p.id];
            return (
              <li key={p.id} className="person-item">
                <div className="person-row">
                  <span className="avatar" aria-hidden="true">
                    {initials(p.firstName, p.lastName)}
                  </span>
                  <span className="person-name">
                    <TitleTag title={p.title} />
                    {fullName(p.firstName, p.lastName)}
                  </span>
                  <span className="person-actions">
                    {state?.kind === 'sent' ? (
                      <span className="small" style={{ color: 'var(--accent)' }}>
                        So&apos;rov yuborildi
                      </span>
                    ) : (
                      <button type="button" className="btn" onClick={() => void send(p.id)}>
                        So&apos;rov yuborish
                      </button>
                    )}
                  </span>
                </div>
                {state?.kind === 'error' && (
                  <p className="field-error" role="alert" style={{ marginLeft: 46 }}>
                    {state.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="skeleton" style={{ height: 60 }} />
      <div className="skeleton" style={{ height: 60 }} />
      <div className="skeleton" style={{ height: 60 }} />
    </div>
  );
}
