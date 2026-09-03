import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameState } from '@/lib/api';

/**
 * Jonli o'yin komponenti — TAXTA QULFI va SERVER HUKMI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA SHU MANTIQ TESTLANADI
 *
 *  Jonli sinovda aynan shu yerda ikkita xato topilgan edi: yurish
 *  huquqi token borligidan hisoblanardi (kirgan tomoshabin ham taxtani
 *  sudray olardi) va sahifa tokenni umuman uzatmasdi.
 *
 *  Qoida: yurish huquqi SERVER bergan `viewerRole` dan keladi va
 *  ulanish ochiq bo'lishini talab qiladi — uzilgan holda sudrash
 *  faqat aldardi, chunki yurish socket orqali ketadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Taxta soxtalashtiriladi: react-chessboard'ning sudrash mexanikasi bu
 *  testning mavzusi emas. Muhimi — unga `onMove` BERILDIMI. */
vi.mock('@/components/board', () => ({
  ChessBoard: ({
    fen,
    orientation,
    onMove,
  }: {
    fen: string;
    orientation?: string;
    onMove?: unknown;
  }) => (
    <div
      data-testid="board"
      data-fen={fen}
      data-orientation={orientation ?? 'white'}
      data-draggable={onMove === undefined ? 'no' : 'yes'}
    />
  ),
}));

interface FakeSocket {
  on: (event: string, fn: (payload: unknown) => void) => void;
  emit: (event: string, payload: unknown, ack?: (v: unknown) => void) => void;
  disconnect: () => void;
  /** Manager — socket.io`ning qayta ulanish hodisalari shu yerda. */
  io: { on: (event: string, fn: (payload: unknown) => void) => void };
}

let ioOptions: Record<string, unknown> | null = null;
let ioCalls = 0;
const listeners = new Map<string, (payload: unknown) => void>();
/** Manager darajasidagi tinglovchilar (`reconnect_failed` va h.k.). */
const managerListeners = new Map<string, (payload: unknown) => void>();
const emits: { event: string; payload: unknown }[] = [];
let joinAck: unknown = null;

vi.mock('socket.io-client', () => ({
  io: (_url: string, opts: Record<string, unknown>): FakeSocket => {
    ioCalls += 1;
    ioOptions = opts;
    return {
      on: (event, fn) => {
        listeners.set(event, fn);
      },
      emit: (event, payload, ack) => {
        emits.push({ event, payload });
        // joinAck === null => server HALI javob bermagan (sinxronlanish
        // holati). Haqiqiy serverda ack har doim to'liq snapshot bo'ladi.
        if (event === 'game:join' && ack !== undefined && joinAck !== null) {
          ack(joinAck);
        }
      },
      disconnect: vi.fn(),
      io: {
        on: (event, fn) => {
          managerListeners.set(event, fn);
        },
      },
    };
  },
}));

const BASE: GameState = {
  gameId: 'game-1',
  status: 'ACTIVE',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: [],
  ply: 0,
  clock: { whiteMs: 300_000, blackMs: 300_000, running: null },
  timeCategory: 'BLITZ',
  baseTimeSeconds: 300,
  incrementSeconds: 0,
  white: { playerId: 'w', firstName: 'Oq', lastName: 'O`yinchi', title: null, rating: 1500 },
  black: { playerId: 'b', firstName: 'Qora', lastName: 'O`yinchi', title: null, rating: 1500 },
  isRated: true,
  viewerRole: 'spectator',
  drawOfferFrom: null,
  winnerColor: null,
};

async function renderGame(token: string | null | undefined, ack: unknown = null) {
  joinAck = ack;
  const { LiveGame } = await import('./live-game');
  await act(async () => {
    render(<LiveGame initial={BASE} token={token} />);
  });
}

/** Serverning `connect` signalini taqlid qilish. */
async function connect() {
  await act(async () => {
    listeners.get('connect')?.(undefined);
  });
}

const board = () => screen.getByTestId('board');

describe('LiveGame', () => {
  beforeEach(() => {
    ioCalls = 0;
    ioOptions = null;
    listeners.clear();
    managerListeners.clear();
    emits.length = 0;
    joinAck = null;
  });

  describe('ulanish', () => {
    it('sessiya aniqlanmagan — socket OCHILMAYDI (ikki marta ulanmaslik uchun)', async () => {
      await renderGame(undefined);
      expect(ioCalls).toBe(0);
      expect(screen.getByText(/Ulanmoqda/)).toBeInTheDocument();
    });

    it('anonim (token yo`q) — socket ochiladi, lekin AUTH`SIZ (K-18)', async () => {
      await renderGame(null);
      expect(ioCalls).toBe(1);
      expect(ioOptions).not.toBeNull();
      expect('auth' in (ioOptions ?? {})).toBe(false);
    });

    it('o`yinchi — token auth sifatida uzatiladi', async () => {
      await renderGame('tok-1');
      expect(ioOptions?.auth).toEqual({ token: 'tok-1' });
    });

    it('faqat websocket transport (polling fallback ataylab yo`q)', async () => {
      await renderGame('tok-1');
      expect(ioOptions?.transports).toEqual(['websocket']);
    });

    it('ulangach `game:join` YUBORILADI va javob ACK orqali keladi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();
      expect(emits[0]).toEqual({ event: 'game:join', payload: { gameId: 'game-1' } });
      expect(screen.getByText(/Ulangan/)).toBeInTheDocument();
    });
  });

  describe('ulanish holatlari (brif §5.11)', () => {
    it('ulangach avval SINXRONLANMOQDA — taxta hali qulf', async () => {
      // Ack BERILMAYDI: snapshot kelmagan holatni taqlid qilamiz.
      await renderGame('tok-1', undefined);
      await act(async () => {
        listeners.get('connect')?.(undefined);
      });

      expect(screen.getByText(/Sinxronlanmoqda/)).toBeInTheDocument();
      expect(board()).toHaveAttribute('data-draggable', 'no');
    });

    it('snapshot kelgach ULANGAN va taxta ochiladi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      expect(screen.getByText(/Ulangan/)).toBeInTheDocument();
      expect(board()).toHaveAttribute('data-draggable', 'yes');
    });

    it('uzilganda darhol vahima ko‘tarilmaydi — «qayta ulanmoqda»', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('disconnect')?.(undefined);
      });

      // socket.io o'zi qayta urinadi — «aloqa yo'q» deyish erta bo'lardi.
      expect(screen.getByText(/Qayta ulanmoqda/)).toBeInTheDocument();
      expect(screen.queryByText(/Aloqa yo/)).toBeNull();
    });

    it('urinishlar tugagach ALOQA UZILDI deb aytiladi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('disconnect')?.(undefined);
      });
      await act(async () => {
        managerListeners.get('reconnect_failed')?.(undefined);
      });

      expect(screen.getByText(/Aloqa yo/)).toBeInTheDocument();
    });
  });

  describe('shoh (brif §6.4)', () => {
    it('SAN «+» bilan tugasa SHOH ko‘rsatiladi', async () => {
      await renderGame('tok-1', {
        ok: true,
        data: { ...BASE, viewerRole: 'white', moves: ['e4', 'e5', 'Qh5+'] },
      });
      await connect();
      expect(screen.getByText('Shoh')).toBeInTheDocument();
    });

    it('oddiy yurishda shoh YO‘Q', async () => {
      await renderGame('tok-1', {
        ok: true,
        data: { ...BASE, viewerRole: 'white', moves: ['e4', 'e5'] },
      });
      await connect();
      expect(screen.queryByText('Shoh')).toBeNull();
    });

    it('tugagan o‘yinda shoh ko‘rsatilmaydi — matni natija banneri aytadi', async () => {
      await renderGame('tok-1', {
        ok: true,
        data: { ...BASE, viewerRole: 'white', status: 'CHECKMATE', moves: ['Qh7#'] },
      });
      await connect();
      expect(screen.queryByText('Shoh')).toBeNull();
    });
  });

  describe('taxta qulfi', () => {
    it('tomoshabin — sudrab bo`lmaydi (token bo`lsa ham)', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'spectator' } });
      await connect();
      expect(board()).toHaveAttribute('data-draggable', 'no');
    });

    it('o`yinchi + ulanish ochiq — sudrash mumkin', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();
      expect(board()).toHaveAttribute('data-draggable', 'yes');
    });

    it('ULANISH UZILSA o`yinchining taxtasi ham qulflanadi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();
      expect(board()).toHaveAttribute('data-draggable', 'yes');

      await act(async () => {
        listeners.get('disconnect')?.(undefined);
      });
      expect(board()).toHaveAttribute('data-draggable', 'no');
      expect(screen.getByText(/eskirgan/)).toBeInTheDocument();
    });

    it('tugagan o`yinda yurish yo`q', async () => {
      await renderGame('tok-1', {
        ok: true,
        data: { ...BASE, viewerRole: 'white', status: 'CHECKMATE' },
      });
      await connect();
      expect(board()).toHaveAttribute('data-draggable', 'no');
    });

    it('qora taxtani O`Z tomonidan ko`radi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'black' } });
      await connect();
      expect(board()).toHaveAttribute('data-orientation', 'black');
    });

    it('tomoshabin taxtani oq tomondan ko`radi', async () => {
      await renderGame(null, { ok: true, data: BASE });
      await connect();
      expect(board()).toHaveAttribute('data-orientation', 'white');
    });
  });

  describe('server hukmi', () => {
    it('yurish server eventidan qo`shiladi (optimistik emas)', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('game:move_made')?.({
          fen: 'yangi-fen',
          san: 'e4',
          clock: { whiteMs: 299_000, blackMs: 300_000, running: 'b' },
        });
      });

      expect(board()).toHaveAttribute('data-fen', 'yangi-fen');
      expect(screen.getByText('e4')).toBeInTheDocument();
    });

    it('`resyncFen` kelsa taxta SERVERNIKIGA qaytariladi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('game:error')?.({
          code: 'illegal_move',
          message: 'Noqonuniy yurish',
          resyncFen: 'server-fen',
        });
      });

      expect(board()).toHaveAttribute('data-fen', 'server-fen');
      expect(screen.getByText('Noqonuniy yurish')).toBeInTheDocument();
    });

    it('soat SERVER qiymati bilan qayta moslanadi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('game:clock_update')?.({ whiteMs: 61_000, blackMs: 5_000, running: 'w' });
      });

      expect(screen.getByText('1:01')).toBeInTheDocument();
      expect(screen.getByText('0:05')).toBeInTheDocument();
    });
  });

  describe('durang taklifi (brif §6.4)', () => {
    it('RAQIB taklif qilsa qabul/yopish ko`rinadi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('game:draw_offered')?.({ from: 'b' });
      });

      expect(screen.getByText(/Raqib durang taklif qildi/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Qabul qilish/ })).toBeInTheDocument();
    });

    it('O`Z taklifim qabul tugmasini KO`RSATMAYDI', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('game:draw_offered')?.({ from: 'w' });
      });

      expect(screen.queryByRole('button', { name: /Qabul qilish/ })).toBeNull();
      expect(screen.getByText(/raqib javobini kutmoqda/i)).toBeInTheDocument();
    });

    it('yurish qilinsa taklif KUCHINI YO`QOTADI', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();
      await act(async () => {
        listeners.get('game:draw_offered')?.({ from: 'b' });
      });
      expect(screen.getByText(/Raqib durang taklif qildi/)).toBeInTheDocument();

      await act(async () => {
        listeners.get('game:move_made')?.({
          fen: 'yangi',
          san: 'e4',
          clock: { whiteMs: 1, blackMs: 1, running: 'b' },
        });
      });
      expect(screen.queryByText(/Raqib durang taklif qildi/)).toBeNull();
    });

    it('reconnect`da taklif YO`QOLMAYDI (ack`dan tiklanadi)', async () => {
      await renderGame('tok-1', {
        ok: true,
        data: { ...BASE, viewerRole: 'white', drawOfferFrom: 'b' },
      });
      await connect();
      expect(screen.getByText(/Raqib durang taklif qildi/)).toBeInTheDocument();
    });
  });

  describe('natija banneri (brif §5.12)', () => {
    it('SABAB bilan ko`rsatiladi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('game:ended')?.({ status: 'CHECKMATE', winnerColor: 'WHITE' });
      });

      expect(screen.getByText('Siz yutdingiz')).toBeInTheDocument();
      expect(screen.getByText('Mot')).toBeInTheDocument();
    });

    it('mag`lubiyat ham o`z nuqtai nazaridan', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'black' } });
      await connect();

      await act(async () => {
        listeners.get('game:ended')?.({ status: 'RESIGNATION', winnerColor: 'WHITE' });
      });

      expect(screen.getByText('Siz yutqazdingiz')).toBeInTheDocument();
      expect(screen.getByText('Taslim')).toBeInTheDocument();
    });

    it('tomoshabinga NEYTRAL: "Oq yutdi"', async () => {
      await renderGame(null, { ok: true, data: BASE });
      await connect();

      await act(async () => {
        listeners.get('game:ended')?.({ status: 'TIMEOUT', winnerColor: 'WHITE' });
      });

      expect(screen.getByText('Oq yutdi')).toBeInTheDocument();
      expect(screen.getByText('Vaqt tugadi')).toBeInTheDocument();
    });

    it('durang — g`olib yo`q', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();

      await act(async () => {
        listeners.get('game:ended')?.({ status: 'DRAW_AGREED', winnerColor: null });
      });

      expect(screen.getByText('Durang')).toBeInTheDocument();
      expect(screen.getByText('Kelishuv bilan durang')).toBeInTheDocument();
    });
  });

  describe('taxtani aylantirish (brif §5.1)', () => {
    it('tomoshabin ham aylantira oladi', async () => {
      await renderGame(null, { ok: true, data: BASE });
      await connect();
      expect(board()).toHaveAttribute('data-orientation', 'white');

      await act(async () => {
        screen.getByRole('button', { name: /Taxtani aylantirish/ }).click();
      });
      expect(board()).toHaveAttribute('data-orientation', 'black');
    });
  });

  describe('boshqaruv tugmalari', () => {
    it('o`yinchiga taslim va durang tugmalari ko`rinadi', async () => {
      await renderGame('tok-1', { ok: true, data: { ...BASE, viewerRole: 'white' } });
      await connect();
      expect(screen.getByRole('button', { name: /Taslim/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Durang/ })).toBeInTheDocument();
    });

    it('tomoshabinga KO`RINMAYDI — u o`yin holatiga tegolmaydi', async () => {
      await renderGame(null, { ok: true, data: BASE });
      await connect();
      expect(screen.queryByRole('button', { name: /Taslim/ })).toBeNull();
    });
  });
});
