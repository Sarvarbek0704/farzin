'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { ChessBoard } from '@/components/board';
import { Card } from '@/components/ui';
import type { GameState } from '@/lib/api';

/** Gateway ack konverti — play.types.ts `Ack<T>` bilan bir xil. */
type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/**
 * Jonli o'yin — Socket.IO orqali.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVER — YAGONA HAKAM (docs/07-realtime-and-clock.md §2)
 *
 *  Bu komponent HECH NARSANI o'zi hal qilmaydi:
 *   - yurish qonuniyligini server tekshiradi (`game:move` → `move_made`
 *     yoki `game:error{illegal_move}`); klient faqat so'raydi;
 *   - SOAT manbai ham server (`game:clock_update`, §3.7). Bu yerdagi
 *     sanoq faqat KO'RSATISH uchun va har `clock_update` da serverning
 *     qiymatiga QAYTA MOSLANADI — klient soati hech qachon "haqiqat"
 *     bo'lmaydi;
 *   - `resyncFen` kelsa taxta serverning FEN'iga qaytariladi.
 *
 *  Sabab: taymer adolat masalasi (docs/14 Faza 5 xavflar jadvali —
 *  "taymer noto'g'ri → o'yinchi haqsiz yutqazadi", ta'siri "juda yuqori").
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Ulanish `/play` namespace'iga, FAQAT websocket transport bilan
 *  (gateway polling fallback'ni ataylab o'chirgan).
 */

interface Props {
  initial: GameState;
  /** Access token — o'yinchi sifatida ulanish uchun. `null` = tomoshabin. */
  token: string | null;
}

type Connection = 'connecting' | 'open' | 'closed' | 'error' | 'anonymous';

export function LiveGame({ initial, token }: Props) {
  const [game, setGame] = useState<GameState>(initial);
  // Dastlabki holat TOKENGA qarab — SSR chiqargan HTML ham to'g'ri
  // bo'lsin: anonim ko'ruvchiga 'Ulanmoqda…' ko'rsatib, keyin uni
  // almashtirish yolg'on va'da bo'lardi.
  const [connection, setConnection] = useState<Connection>(
    token === null ? 'anonymous' : 'connecting',
  );
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // ⚠️  TOKENSIZ ULANMAYMIZ. Gateway `handleConnection` da tokenni
    //     SHARTSIZ talab qiladi va tokensiz socket'ni darhol uzadi
    //     (`game:error{token_expired}`). REST tomonda esa
    //     `GET /play/games/:id` @Public va `viewerRole: 'spectator'`
    //     qaytaradi — ya'ni REST anonim tomoshabinni qo'llaydi, WS esa
    //     YO'Q. Bu nomuvofiqlik jonli tekshiruvda aniqlandi va
    //     docs/AUDIT.md ga topilma sifatida yozildi.
    //
    //     Shu sababli anonim ko'ruvchiga socket OCHILMAYDI: server
    //     bergan holat statik ko'rsatiladi va buni ekranda ochiq aytamiz.
    //     Har safar "Ulanib bo'lmadi" chiqarish yolg'on signal bo'lardi.
    if (token === null) {
      setConnection('anonymous');
      return;
    }

    // Socket to'g'ridan-to'g'ri backend'ga ulanadi: Next rewrite faqat
    // HTTP uchun, WebSocket upgrade'ni o'tkazmaydi.
    const base = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000';
    const socket = io(`${base}/play`, {
      transports: ['websocket'],
      // Bu nuqtada token NULL EMAS (yuqoridagi erta qaytish).
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnection('open');
      // ⚠️  `game:join` javobi ACK orqali keladi, `game:state` EVENT
      //     sifatida EMAS (play.gateway.ts onJoin). Bu jonli tekshiruvda
      //     aniqlandi: event tinglash bilan hech narsa kelmasdi.
      //     docs/07 §8.1: ack HAR DOIM to'liq snapshot — taxta shundan
      //     noldan quriladi (reconnect shartnomasi).
      socket.emit('game:join', { gameId: initial.gameId }, (ack: Ack<GameState>) => {
        if (ack.ok) {
          setGame(ack.data);
        } else {
          setNotice(ack.error.message);
        }
      });
    });
    socket.on('disconnect', () => {
      setConnection('closed');
    });
    socket.on('connect_error', () => {
      setConnection('error');
    });

    socket.on('game:move_made', (payload: { fen: string; san: string; clock: GameState['clock'] }) => {
      setGame((prev) => ({
        ...prev,
        fen: payload.fen,
        moves: [...prev.moves, payload.san],
        clock: payload.clock,
      }));
      setNotice(null);
    });

    // Soat — SERVER qiymati bilan qayta moslash (§3.7).
    socket.on('game:clock_update', (clock: GameState['clock']) => {
      setGame((prev) => ({ ...prev, clock }));
    });

    socket.on('game:ended', (payload: { status: string }) => {
      setGame((prev) => ({ ...prev, status: payload.status }));
    });

    socket.on('game:error', (payload: { code: string; message: string; resyncFen?: string }) => {
      setNotice(payload.message);
      // Server FEN yuborsa — taxta ATAYLAB serverникига qaytariladi.
      if (payload.resyncFen !== undefined) {
        const fen = payload.resyncFen;
        setGame((prev) => ({ ...prev, fen }));
      }
    });

    socket.on('game:opponent_gone', () => {
      setNotice('Raqib uzildi — kutilmoqda…');
    });
    socket.on('game:opponent_back', () => {
      setNotice(null);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [initial.gameId, token]);

  /**
   * Yurish — server tekshiradi.
   * Taxta OPTIMISTIK yangilanmaydi: noto'g'ri yurish bir lahza to'g'ri
   * ko'rinib, keyin orqaga sakrashi — eng chalg'ituvchi xulq.
   */
  const onMove = useCallback(
    (from: string, to: string): boolean => {
      const socket = socketRef.current;
      if (socket === null || token === null) {
        return false;
      }
      // Kontrakt: {gameId, from, to, promotion?} — docs/07 §7.2.
      // Server UCI'ga o'zi yig'adi (play.gateway.ts moveIntent).
      socket.emit(
        'game:move',
        { gameId: game.gameId, from, to },
        (ack: Ack<{ ply: number }>) => {
          if (!ack.ok) {
            setNotice(ack.error.message);
          }
        },
      );
      return false;
    },
    [game.gameId, token],
  );

  const isPlayer = token !== null;
  const active = game.status === 'ACTIVE';

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div>
        <ChessBoard fen={game.fen} {...(isPlayer && active ? { onMove } : {})} />
        <ConnectionBadge state={connection} />
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 240 }}>
        {notice !== null && (
          <p
            role="status"
            className="small"
            style={{ color: 'var(--amber)', marginTop: 0 }}
          >
            {notice}
          </p>
        )}

        <Card>
          <ClockLine
            label={`${game.black.lastName} ${game.black.firstName}`}
            ms={game.clock.blackMs}
            active={game.clock.running === 'b'}
          />
          <div className="board-rule" style={{ margin: '12px 0' }} />
          <ClockLine
            label={`${game.white.lastName} ${game.white.firstName}`}
            ms={game.clock.whiteMs}
            active={game.clock.running === 'w'}
          />
        </Card>

        {isPlayer && active && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="badge"
              style={{ cursor: 'pointer', background: 'transparent' }}
              onClick={() => socketRef.current?.emit('game:draw_offer', { gameId: game.gameId })}
            >
              Durang taklif qilish
            </button>
            <button
              type="button"
              className="badge badge-cancelled"
              style={{ cursor: 'pointer', background: 'transparent' }}
              onClick={() => socketRef.current?.emit('game:resign', { gameId: game.gameId })}
            >
              Taslim
            </button>
          </div>
        )}

        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Yurishlar</h3>
        {game.moves.length === 0 ? (
          <p className="muted small">Hali yurish qilinmagan.</p>
        ) : (
          <ol className="tabular small" style={{ margin: 0, paddingLeft: 26, maxHeight: 300, overflowY: 'auto' }}>
            {pairMoves(game.moves).map((pair) => (
              <li key={pair.number}>
                {pair.white}
                {pair.black !== null && ` ${pair.black}`}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function pairMoves(moves: string[]): { number: number; white: string; black: string | null }[] {
  const pairs: { number: number; white: string; black: string | null }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i] ?? '', black: moves[i + 1] ?? null });
  }
  return pairs;
}

function ClockLine({ label, ms, active }: { label: string; ms: number; active: boolean }) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{label}</span>
      <span
        className="tabular"
        style={{ fontWeight: 600, color: active ? 'var(--accent)' : 'var(--ink-secondary)' }}
      >
        {Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

/**
 * Ulanish holati — YASHIRILMAYDI.
 * Uzilgan holatda taxta eskirgan bo'ladi va o'yinchi buni BILISHI kerak.
 */
function ConnectionBadge({ state }: { state: Connection }) {
  const view: Record<Connection, { text: string; color: string }> = {
    connecting: { text: 'Ulanmoqda…', color: 'var(--ink-secondary)' },
    anonymous: {
      text: 'Statik ko`rinish — jonli yangilanish uchun kiring',
      color: 'var(--ink-secondary)',
    },
    open: { text: 'Jonli', color: 'var(--emerald-bright)' },
    closed: { text: 'Uzildi — ma`lumot eskirgan', color: 'var(--amber)' },
    error: { text: 'Ulanib bo`lmadi', color: 'var(--burgundy)' },
  };
  const { text, color } = view[state];
  return (
    <p className="small" style={{ color, marginTop: 8, marginBottom: 0 }}>
      ● {text}
    </p>
  );
}
