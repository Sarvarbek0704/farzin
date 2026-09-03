'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Card, EmptyState, PageHeader } from '@/components/ui';
import { readJson, useAuth } from '@/lib/auth';
import { formatTimeControl } from '@/lib/format';
import { usePlaySocket } from '@/lib/play-socket';
import {
  CATEGORY_LABEL,
  PRESETS,
  categoryFor,
  presetLabel,
  type TimeControlPreset,
} from '@/lib/time-control';

/**
 * O'yin bo'limi — mening o'yinlarim va NAVBAT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NAVBAT NATIJASI — SO'ROV BILAN TEKSHIRILMAYDI, PUSH BILAN KELADI
 *
 *  `POST /play/matchmaking/join` ikki xil javob beradi:
 *   - `{status:'matched', gameId}` — raqib navbatda TURGAN edi, juftlik
 *     shu zahoti tuzildi;
 *   - `{status:'queued'}` — men navbatda birinchiman.
 *
 *  Ikkinchi holatda juftlik KEYIN, boshqa odam qo'shilganda tuziladi va
 *  bu haqda server `matchmaking:matched` eventini `user:{userId}`
 *  xonasiga yuboradi (play.gateway.ts notifyMatched). Shuning uchun
 *  navbat holati TAKRORIY SO'ROV bilan tekshirilmaydi — socket ochamiz
 *  va eventni kutamiz. Takroriy so'rov 2-3 soniya kechikish va keraksiz
 *  yuk berardi.
 *
 *  Socket `/play` namespace'iga token bilan ulanadi; ulanish paytida
 *  gateway avtomatik `user:{sub}` xonasiga qo'shadi.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  LEKIN PUSH — KAFOLAT EMAS (E2E ochib bergan xato)
 *
 *  Event BIR MARTA yuboriladi va qayta o'ynatilmaydi. Socket ulanmagan
 *  yoki uzilgan lahzada juftlik tuzilsa, xabar butunlay yo'qoladi va
 *  foydalanuvchi "Navbatdan chiqish" ekranida MUZLAB qolardi —
 *  raqibining soati esa allaqachon ishlab turgan bo'lardi. Bu jonli
 *  brauzer testida aniqlandi: Playwright tugmani sahifa
 *  interaktiv bo'lishi bilanoq bosadi, ya'ni socket ulanishidan OLDIN.
 *
 *  Ikki qatlamli yechim:
 *   1. Bo'shliqni OCHMASLIK — presetlar socket ulanmaguncha o'chiq;
 *   2. Bo'shliq baribir ochilsa (uzilish) — har ulanishda `my/games`
 *      tekshiriladi va navbatga turishdan OLDIN bo'lmagan yangi o'yin
 *      topilsa unga o'tiladi (`recoverMissedMatch`).
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  SOKETNING O'ZI ENDI BU YERDA EMAS
 *
 *  U ilova qobig'ida (`lib/play-socket.tsx`): do'stona chaqiriqda
 *  o'yinni BOSHQA odam ochadi va chaqirilgan o'yinchi bu sahifada
 *  turmagan bo'lishi mumkin. Bu sahifa endi soketdan faqat ikki
 *  narsani oladi: ulanish holati va "qayta ulandik" signali.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface GameRow {
  id: string;
  status: string;
  whitePlayerId: string;
  blackPlayerId: string;
  timeCategory: string;
  baseTimeSeconds: number;
  incrementSeconds: number;
}

type QueueState =
  | { kind: 'idle' }
  | { kind: 'joining'; preset: TimeControlPreset }
  | { kind: 'queued'; preset: TimeControlPreset };

export default function PlayPage() {
  const { accessToken, authFetch } = useAuth();
  const router = useRouter();

  const { connected: socketReady, subscribeConnected } = usePlaySocket();

  const [games, setGames] = useState<GameRow[] | null>(null);
  const [queue, setQueue] = useState<QueueState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  // Effekt ichidan O'QILADIGAN, lekin uni QAYTA ISHGA TUSHIRMAYDIGAN
  // qiymatlar. State bo'lsa socket har navbat o'zgarishida uzilib
  // qayta ulanardi — aynan biz to'sayotgan bo'shliqni kengaytirib.
  const queueRef = useRef<QueueState>({ kind: 'idle' });
  queueRef.current = queue;
  /** Navbatga turishdan OLDIN mavjud bo'lgan o'yinlar. */
  const knownGameIds = useRef<Set<string>>(new Set());

  const loadGames = useCallback(async (): Promise<GameRow[]> => {
    const rows = await readJson<GameRow[]>(await authFetch('/api/v1/play/my/games'));
    setGames(rows);
    return rows;
  }, [authFetch]);

  useEffect(() => {
    if (accessToken === undefined || accessToken === null) {
      return;
    }
    void loadGames().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Xato');
    });
  }, [accessToken, loadGames]);

  const goToGame = useCallback(
    (gameId: string) => {
      setQueue({ kind: 'idle' });
      router.push(`/oyin/${gameId}`);
    },
    [router],
  );

  /**
   * Push'ni O'TKAZIB YUBORGAN bo'lsak, o'yinni o'zimiz topamiz.
   *
   * `matchmaking:matched` BIR MARTA yuboriladi va qayta o'ynatilmaydi.
   * Socket uzilgan yoki hali ulanmagan lahzada juftlik tuzilsa, xabar
   * butunlay yo'qoladi — foydalanuvchi "Navbatdan chiqish" ekranida
   * muzlab qolardi, raqibining soati esa ishlayotgan bo'lardi.
   *
   * Shuning uchun har ulanishda: navbatda turgan bo'lsak, `my/games`
   * dan navbatga turishdan OLDIN bo'lmagan o'yinni qidiramiz. Eski
   * o'yinlar ro'yxati `knownGameIds` da — aks holda foydalanuvchini
   * allaqachon mavjud boshqa o'yiniga tortib ketardik.
   */
  const recoverMissedMatch = useCallback(async (): Promise<void> => {
    if (queueRef.current.kind === 'idle') {
      return;
    }
    const rows = await loadGames();
    const fresh = rows.find((g) => g.status === 'ACTIVE' && !knownGameIds.current.has(g.id));
    if (fresh !== undefined) {
      goToGame(fresh.id);
    }
  }, [goToGame, loadGames]);

  // Ulanish (yoki QAYTA ulanish) — o'tkazib yuborilgan juftlikni
  // tekshirish nuqtasi. `matchmaking:matched` ning O'ZI qobiqda
  // tinglanadi va u yerdan o'yinga o'tiladi.
  useEffect(() => {
    return subscribeConnected(() => {
      void recoverMissedMatch().catch(() => {
        // Tiklash urinishining muvaffaqiyatsizligi navbatni buzmaydi;
        // keyingi ulanishda yana urinib ko'riladi.
      });
    });
  }, [subscribeConnected, recoverMissedMatch]);

  async function join(preset: TimeControlPreset): Promise<void> {
    setError(null);
    setQueue({ kind: 'joining', preset });
    // Navbatga turishdan OLDINGI o'yinlar — tiklash aynan YANGI
    // o'yinni ajrata olishi uchun.
    knownGameIds.current = new Set((games ?? []).map((g) => g.id));
    try {
      const res = await authFetch('/api/v1/play/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Kategoriya QO'LDA tanlanmaydi — vaqtdan hisoblanadi
          // (lib/time-control.ts dagi izohga qarang).
          timeCategory: categoryFor(preset.baseSeconds, preset.incrementSeconds),
          clockType: preset.incrementSeconds > 0 ? 'FISCHER_INCREMENT' : 'SUDDEN_DEATH',
          baseTimeSeconds: preset.baseSeconds,
          incrementSeconds: preset.incrementSeconds,
        }),
      });
      const result = await readJson<{ status: 'queued' | 'matched'; gameId?: string }>(res);

      if (result.status === 'matched' && result.gameId !== undefined) {
        goToGame(result.gameId);
        return;
      }
      setQueue({ kind: 'queued', preset });
      // Navbatga turgunimizcha juftlik tuzilgan bo'lishi mumkin (socket
      // hali ulanmagan bo'lsa push yo'qoladi) — darhol tekshiramiz.
      //
      // ⚠️  Bu urinish ALOHIDA ushlanadi. Umumiy `catch` ga tushsa,
      //     `my/games` so'rovining xatosi navbatni BEKOR qilingandek
      //     ko'rsatardi — holbuki server tomonda odam navbatda turibdi
      //     va juftlik istalgan payt tuzilishi mumkin.
      await recoverMissedMatch().catch(() => {
        // Keyingi ulanishda yana urinib ko'riladi.
      });
    } catch (e) {
      setQueue({ kind: 'idle' });
      setError(e instanceof Error ? e.message : 'Xato');
    }
  }

  async function leave(): Promise<void> {
    try {
      await authFetch('/api/v1/play/matchmaking/leave', { method: 'POST' });
    } catch {
      // Navbatdan chiqish so'rovi muvaffaqiyatsiz bo'lsa ham UI bo'shatiladi:
      // navbat yozuvi TTL bilan o'zi o'chadi va foydalanuvchini
      // "chiqolmadingiz" deb qamab qo'yish yomonroq.
    }
    setQueue({ kind: 'idle' });
  }

  if (accessToken === undefined) {
    return <p className="muted">Yuklanmoqda…</p>;
  }

  if (accessToken === null) {
    return (
      <>
        <PageHeader kicker="Onlayn" title="Onlayn o'yin" />
        <div className="card empty">
          <span className="empty-glyph" aria-hidden="true">
            ♞
          </span>
          <p style={{ margin: 0, fontWeight: 500 }}>O&apos;ynash uchun kirish kerak</p>
          <p className="muted small" style={{ margin: '8px auto 18px', maxWidth: '48ch' }}>
            Reyting va fair-play nazorati o&apos;yinchi kimligini bilishni talab qiladi. Tomoshabin
            sifatida istalgan o&apos;yinni tokensiz ko&apos;rish mumkin.
          </p>
          <Link href="/konsol/kirish" className="btn btn-primary">
            Kirish →
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Onlayn"
        title="Onlayn o'yin"
        subtitle="Vaqt nazoratini tanlang — mos reytingli raqib avtomatik topiladi."
      />

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      <h2 style={{ marginBottom: 12 }}>Navbat</h2>

      {!socketReady && queue.kind === 'idle' && (
        <p className="muted small" style={{ marginTop: 0 }} role="status">
          Serverga ulanilmoqda…
        </p>
      )}

      {queue.kind === 'queued' ? (
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <strong>{presetLabel(queue.preset)}</strong>{' '}
              <span className="muted small">
                {
                  CATEGORY_LABEL[
                    categoryFor(queue.preset.baseSeconds, queue.preset.incrementSeconds)
                  ]
                }
              </span>
            </div>
            <p className="muted small" style={{ margin: 0, maxWidth: '58ch' }}>
              Raqib qidirilmoqda. Qidiruv oralig&apos;i vaqt o&apos;tishi bilan kengayadi (±200 dan
              ±500 reytinggacha) — aynan mos raqib topilmasa, biroz farqli raqib beriladi. Juftlik
              topilishi bilan o&apos;yinga o&apos;tiladi.
            </p>
            <button type="button" className="btn" onClick={() => void leave()}>
              Navbatdan chiqish
            </button>
          </div>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 10,
          }}
        >
          {PRESETS.map((preset) => {
            // Socket ulanmaguncha navbatga turmaymiz: juftlik shu
            // oraliqda tuzilsa `matchmaking:matched` yo'qolardi.
            // Tiklash yo'li ham bor, lekin eng yaxshisi — bo'shliqni
            // umuman ochmaslik.
            const busy = queue.kind === 'joining' || !socketReady;
            return (
              <button
                key={presetLabel(preset)}
                type="button"
                disabled={busy}
                onClick={() => void join(preset)}
                className="btn"
                // Preset tugmasi ikki qatorli: vaqt + kategoriya.
                style={{ flexDirection: 'column', gap: 2, padding: '14px 10px', height: 'auto' }}
              >
                <span className="tabular" style={{ fontWeight: 600, fontSize: 17 }}>
                  {presetLabel(preset)}
                </span>
                <span className="muted small">
                  {CATEGORY_LABEL[categoryFor(preset.baseSeconds, preset.incrementSeconds)]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <h2 style={{ marginTop: 40, marginBottom: 12 }}>Faol o&apos;yinlarim</h2>

      {games === null ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : games.length === 0 ? (
        <EmptyState
          title="Faol o'yin yo'q"
          hint="Yuqoridagi vaqt nazoratlaridan birini tanlab navbatga turing."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>O&apos;yin</th>
                <th>Vaqt nazorati</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`/oyin/${g.id}`} style={{ fontWeight: 500 }}>
                      Davom ettirish →
                    </Link>
                  </td>
                  <td className="tabular">
                    {CATEGORY_LABEL[categoryFor(g.baseTimeSeconds, g.incrementSeconds)]}{' '}
                    {formatTimeControl(g.baseTimeSeconds, g.incrementSeconds)}
                  </td>
                  <td>
                    <span className={g.status === 'ACTIVE' ? 'badge badge-live' : 'badge'}>
                      {g.status === 'ACTIVE' ? 'Davom etmoqda' : g.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
