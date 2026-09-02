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
}

let ioOptions: Record<string, unknown> | null = null;
let ioCalls = 0;
const listeners = new Map<string, (payload: unknown) => void>();
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
        if (event === 'game:join' && ack !== undefined) {
          ack(joinAck);
        }
      },
      disconnect: vi.fn(),
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
      // Nishon "● Jonli" ko'rinishida — aniq moslik emas, regex.
      expect(screen.getByText(/Jonli/)).toBeInTheDocument();
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
      expect(screen.getByRole('status')).toHaveTextContent('Noqonuniy yurish');
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
