'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { BackLink, Card, EmptyState } from '@/components/ui';
import { readJson, useAuth } from '@/lib/auth';
import { formatTimeControl } from '@/lib/format';
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
 *  xonasiga yuboradi (play.gateway.ts:388 notifyMatched). Shuning uchun
 *  bu yerda `my/games` takroriy so'rov bilan tekshirilmaydi — socket
 *  ochamiz va eventni kutamiz. Takroriy so'rov 2-3 soniya kechikish va
 *  keraksiz yuk berardi.
 *
 *  Socket `/play` namespace'iga token bilan ulanadi; ulanish paytida
 *  gateway avtomatik `user:{sub}` xonasiga qo'shadi (gateway:176).
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

  const [games, setGames] = useState<GameRow[] | null>(null);
  const [queue, setQueue] = useState<QueueState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const loadGames = useCallback(async (): Promise<void> => {
    try {
      setGames(await readJson<GameRow[]>(await authFetch('/api/v1/play/my/games')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    }
  }, [authFetch]);

  useEffect(() => {
    if (accessToken === undefined || accessToken === null) {
      return;
    }
    void loadGames();
  }, [accessToken, loadGames]);

  // Juftlik topilganini KUTUVCHI socket. Navbatga turmasdan ham ochiq
  // turadi: o'yin boshqa qurilmada yoki chaqiruv orqali boshlansa ham
  // shu event keladi.
  useEffect(() => {
    if (accessToken === undefined || accessToken === null) {
      return;
    }
    const base = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000';
    const socket: Socket = io(`${base}/play`, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });

    socket.on('matchmaking:matched', (payload: { gameId: string }) => {
      // Navbat tugadi — darhol o'yinga o'tamiz. Bu yerda tasdiq
      // so'ralmaydi: raqibning soati ALLAQACHON ishlayapti.
      setQueue({ kind: 'idle' });
      router.push(`/oyin/${payload.gameId}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, router]);

  async function join(preset: TimeControlPreset): Promise<void> {
    setError(null);
    setQueue({ kind: 'joining', preset });
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
        router.push(`/oyin/${result.gameId}`);
        return;
      }
      setQueue({ kind: 'queued', preset });
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
        <BackLink href="/">Bosh sahifa</BackLink>
        <h1 style={{ fontSize: 30, marginBottom: 8 }}>Onlayn o&apos;yin</h1>
        <EmptyState
          title="O&apos;ynash uchun kirish kerak"
          hint="Reyting va fair-play nazorati o'yinchi kimligini bilishni talab qiladi. Tomoshabin sifatida istalgan o'yinni tokensiz ko'rish mumkin."
        />
        <Link href="/konsol/kirish" className="small">
          Kirish →
        </Link>
      </>
    );
  }

  return (
    <>
      <BackLink href="/">Bosh sahifa</BackLink>

      <div className="board-rule" style={{ width: 72, marginBottom: 14 }} />
      <h1 style={{ fontSize: 30, marginBottom: 6 }}>Onlayn o&apos;yin</h1>

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      <h2 style={{ marginTop: 22, marginBottom: 10 }}>Navbat</h2>

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
              Raqib qidirilmoqda. Qidiruv oralig&apos;i vaqt o&apos;tishi bilan kengayadi
              (±200 dan ±500 reytinggacha) — aynan mos raqib topilmasa, biroz farqli
              raqib beriladi. Juftlik topilishi bilan o&apos;yinga o&apos;tiladi.
            </p>
            <button type="button" className="btn" onClick={() => void leave()}>
              Navbatdan chiqish
            </button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => {
            const busy = queue.kind === 'joining';
            return (
              <button
                key={presetLabel(preset)}
                type="button"
                disabled={busy}
                onClick={() => void join(preset)}
                className="btn"
                // Preset tugmasi ikki qatorli: vaqt + kategoriya.
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}
              >
                <span style={{ fontWeight: 600 }}>{presetLabel(preset)}</span>
                <span className="muted small">
                  {CATEGORY_LABEL[categoryFor(preset.baseSeconds, preset.incrementSeconds)]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <h2 style={{ marginTop: 28, marginBottom: 10 }}>Faol o&apos;yinlarim</h2>

      {games === null ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : games.length === 0 ? (
        <EmptyState
          title="Faol o&apos;yin yo&apos;q"
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
