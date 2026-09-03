'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { ChessBoard } from '@/components/board';
import type { GameState } from '@/lib/api';

/** Gateway ack konverti — play.types.ts `Ack<T>` bilan bir xil. */
type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** `game:ended` yuki (play.types.ts GameEndedPayload). */
interface GameEnded {
  status: string;
  winnerColor: 'WHITE' | 'BLACK' | null;
  finalFen?: string;
}

/**
 * Natija SABABI — brif §5.12: banner har doim NEGA tugaganini aytadi.
 * "O'yin tugadi" yolg'iz o'zi foydalanuvchiga hech narsa bermaydi.
 */
const REASON: Record<string, string> = {
  CHECKMATE: 'Mot',
  RESIGNATION: 'Taslim',
  TIMEOUT: 'Vaqt tugadi',
  TIMEOUT_VS_INSUFFICIENT_MATERIAL: 'Vaqt tugadi — material yetarli emas',
  DRAW_AGREED: 'Kelishuv bilan durang',
  STALEMATE: 'Pat',
  THREEFOLD_REPETITION: 'Uch marta takror',
  FIFTY_MOVE_RULE: '50 yurish qoidasi',
  INSUFFICIENT_MATERIAL: 'Material yetarli emas',
  ABANDONED: 'Tashlab ketildi',
  ABORTED: 'Bekor qilindi',
};

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
  /**
   * Access token — o'yinchi sifatida ulanish uchun.
   *  - `string`    — o'yinchi (yoki kirgan tomoshabin);
   *  - `null`      — kirilmagan, anonim tomoshabin;
   *  - `undefined` — sessiya HALI ANIQLANMADI (`/auth/refresh` javobi
   *    kutilmoqda). Buni `null` bilan aralashtirmaslik kerak: aks holda
   *    kirgan o'yinchiga bir lahza "kirmagansiz" deyilardi.
   */
  token: string | null | undefined;
}

type Connection = 'connecting' | 'open' | 'closed' | 'error';

export function LiveGame({ initial, token }: Props) {
  const [game, setGame] = useState<GameState>(initial);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [notice, setNotice] = useState<string | null>(null);
  /** Kim durang taklif qilgan ('w'/'b') — null = taklif yo'q. */
  const [drawFrom, setDrawFrom] = useState<'w' | 'b' | null>(initial.drawOfferFrom);
  /** Yakuniy natija — server e'lon qilganda to'ldiriladi. */
  const [ended, setEnded] = useState<GameEnded | null>(null);
  /** Taxta yo'nalishini QO'LDA aylantirish (brif §5.1). */
  const [flipped, setFlipped] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Sessiya hali aniqlanmagan bo'lsa kutamiz: tokensiz ulanib, keyin
    // token kelganda qayta ulanish ikki marta ulanish demakdir. Effekt
    // token kelganda o'zi qayta ishlaydi (u bog'liqliklar ro'yxatida).
    if (token === undefined) {
      setConnection('connecting');
      return;
    }
    setConnection('connecting');

    // Socket to'g'ridan-to'g'ri backend'ga ulanadi: Next rewrite faqat
    // HTTP uchun, WebSocket upgrade'ni o'tkazmaydi.
    //
    // TOKENSIZ ham ulanamiz — anonim tomoshabin jonli yangilanish oladi
    // (K-18 tuzatildi: gateway tokensiz ulanishni qabul qiladi va
    // `viewerRole: 'spectator'` beradi). Ochiqlik huquq bermaydi:
    // yurish, taslim va durang `not_a_player` bilan rad etiladi.
    const base = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000';
    const socket = io(`${base}/play`, {
      transports: ['websocket'],
      ...(token === null ? {} : { auth: { token } }),
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
          setDrawFrom(ack.data.drawOfferFrom);
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
      // Yurish qilindi — osilgan durang taklifi kuchini yo'qotadi
      // (server ham shunday hisoblaydi).
      setDrawFrom(null);
    });

    // Soat — SERVER qiymati bilan qayta moslash (§3.7).
    socket.on('game:clock_update', (clock: GameState['clock']) => {
      setGame((prev) => ({ ...prev, clock }));
    });

    socket.on('game:ended', (payload: GameEnded) => {
      setGame((prev) => ({ ...prev, status: payload.status, fen: payload.finalFen ?? prev.fen }));
      setEnded(payload);
      // O'yin tugadi — osilib qolgan taklif ham ketadi.
      setDrawFrom(null);
      setNotice(null);
    });

    // Durang taklifi — brif §6.4: "Raqib durang taklif qildi" + qabul/rad.
    socket.on('game:draw_offered', (payload: { from: 'w' | 'b' }) => {
      setDrawFrom(payload.from);
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
      if (socket === null) {
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
    [game.gameId],
  );

  const active = game.status === 'ACTIVE';
  // Yurish huquqi token BORLIGIDAN emas, server bergan ROLDAN kelib
  // chiqadi: kirgan foydalanuvchi ham begona o'yinning tomoshabini
  // bo'lishi mumkin. `viewerRole` SSR'da doim 'spectator', haqiqiy
  // qiymat `game:join` ack'i bilan keladi.
  const isPlayer = game.viewerRole !== 'spectator';
  const mySide: 'w' | 'b' | null =
    game.viewerRole === 'white' ? 'w' : game.viewerRole === 'black' ? 'b' : null;
  // Ulanish yopiq bo'lsa taxta ham QULFLANADI: yurish socket orqali
  // ketadi, ya'ni uzilgan holda sudrash faqat aldardi.
  const canMove = isPlayer && active && connection === 'open';
  const baseOrientation = game.viewerRole === 'black' ? 'black' : 'white';
  const orientation: 'white' | 'black' = flipped
    ? baseOrientation === 'white'
      ? 'black'
      : 'white'
    : baseOrientation;
  // Yuqorida RAQIB, pastda O'ZIM (tomoshabin uchun: yuqorida qora).
  const topIsBlack = orientation === 'white';
  const whiteName = `${game.white.lastName} ${game.white.firstName}`;
  const blackName = `${game.black.lastName} ${game.black.firstName}`;

  return (
    <div className="game-layout">
      {/*
        TARTIB (brif §6.4): taxta chapda, o'ng ustunda yuqoridan pastga —
        raqib podi, yurishlar, o'z podim, boshqaruv. Pod tartibi
        YO'NALISHGA bog'liq: pastda har doim O'ZIM turaman.
      */}
      <div>
        <ChessBoard fen={game.fen} orientation={orientation} {...(canMove ? { onMove } : {})} />
        <ConnectionBadge state={connection} />
      </div>

      <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        {/*
          NATIJA BANNERI (brif §5.12) — sabab bilan. G'olib o'yinchining
          nuqtai nazaridan yoziladi: tomoshabin uchun neytral.
        */}
        {ended !== null && (
          <div className={resultClass(ended, game.viewerRole)} role="status">
            <strong className="result-headline">{resultHeadline(ended, game.viewerRole)}</strong>
            <span className="result-reason">{REASON[ended.status] ?? ended.status}</span>
          </div>
        )}

        {/*
          DURANG TAKLIFI — faqat RAQIB taklif qilganda va faqat
          o'yinchiga. O'z taklifingni "qabul qilish" bema'nilik.
        */}
        {drawFrom !== null && isPlayer && active && drawFrom !== mySide && (
          <div className="offer" role="alert">
            <span>Raqib durang taklif qildi</span>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  socketRef.current?.emit('game:draw_accept', { gameId: game.gameId })
                }
              >
                Qabul qilish
              </button>
              {/*
                RAD ETISH — serverda alohida event YO'Q (docs/07 §7.2).
                Taklif yurish qilinganda kuchini yo'qotadi, shuning uchun
                bu tugma faqat bannerni yopadi va buni ochiq aytamiz.
              */}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDrawFrom(null);
                }}
                title="Taklif yurish qilinganda o'z-o'zidan bekor bo'ladi"
              >
                Yopish
              </button>
            </div>
          </div>
        )}

        {drawFrom !== null && drawFrom === mySide && active && (
          <p className="muted small" role="status" style={{ margin: 0 }}>
            Durang taklifi yuborildi — raqib javobini kutmoqda.
          </p>
        )}

        {notice !== null && (
          <p role="status" className="small" style={{ color: 'var(--amber)', margin: 0 }}>
            {notice}
          </p>
        )}

        <PlayerPod
          label={topIsBlack ? blackName : whiteName}
          ms={topIsBlack ? game.clock.blackMs : game.clock.whiteMs}
          active={game.clock.running === (topIsBlack ? 'b' : 'w')}
        />

        <div className="card" style={{ padding: 16 }}>
          <h3 className="kicker" style={{ margin: 0 }}>
            Yurishlar
          </h3>
          {game.moves.length === 0 ? (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Hali yurish qilinmagan.
            </p>
          ) : (
            <ol className="movelist" style={{ marginTop: 8 }}>
              {pairMoves(game.moves).map((pair) => (
                <li key={pair.number}>
                  {pair.white}
                  {pair.black !== null && ` ${pair.black}`}
                </li>
              ))}
            </ol>
          )}
        </div>

        <PlayerPod
          label={topIsBlack ? whiteName : blackName}
          ms={topIsBlack ? game.clock.whiteMs : game.clock.blackMs}
          active={game.clock.running === (topIsBlack ? 'w' : 'b')}
        />

        <div className="row" style={{ gap: 8 }}>
          {/* Taxtani aylantirish — brif §5.1, tomoshabinga ham kerak. */}
          <button
            type="button"
            className="btn"
            aria-pressed={flipped}
            onClick={() => {
              setFlipped((f) => !f);
            }}
          >
            Taxtani aylantirish
          </button>
        </div>

        {isPlayer && active && (
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={drawFrom === mySide}
              onClick={() => socketRef.current?.emit('game:draw_offer', { gameId: game.gameId })}
            >
              Durang taklif qilish
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => socketRef.current?.emit('game:resign', { gameId: game.gameId })}
            >
              Taslim
            </button>
          </div>
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

/** O'yinchi podi — ism + soat (brif §5.4/§5.5 soddalashtirilgan birinchi bo'lagi). */
function PlayerPod({ label, ms, active }: { label: string; ms: number; active: boolean }) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const low = active && total < 10;
  return (
    <div className="pod">
      <span className="pod-name">{label}</span>
      <span className="pod-clock" data-active={active || undefined} data-low={low || undefined}>
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

/** Banner sarlavhasi — ko'ruvchi nuqtai nazaridan. */
function resultHeadline(ended: GameEnded, role: string): string {
  if (ended.winnerColor === null) {
    return 'Durang';
  }
  if (role === 'spectator') {
    return ended.winnerColor === 'WHITE' ? 'Oq yutdi' : 'Qora yutdi';
  }
  const iWon =
    (role === 'white' && ended.winnerColor === 'WHITE') ||
    (role === 'black' && ended.winnerColor === 'BLACK');
  return iWon ? 'Siz yutdingiz' : 'Siz yutqazdingiz';
}

/** Rang: g'alaba emerald, mag'lubiyat burgundy, durang neytral. */
function resultClass(ended: GameEnded, role: string): string {
  if (ended.winnerColor === null || role === 'spectator') {
    return 'result result-neutral';
  }
  const iWon =
    (role === 'white' && ended.winnerColor === 'WHITE') ||
    (role === 'black' && ended.winnerColor === 'BLACK');
  return iWon ? 'result result-win' : 'result result-loss';
}
