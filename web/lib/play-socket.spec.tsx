import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaySocketProvider, usePlaySocket } from './play-socket';

/**
 * Qobiqdagi o'yin soketi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ENG MUHIM XULQ: XABAR QAYSI SAHIFADA BO'LSANGIZ HAM YETADI
 *
 *  Do'stona chaqiriqda o'yinni BOSHQA odam ochadi va soat darhol
 *  ishlay boshlaydi. Chaqirilgan o'yinchi navbat sahifasida
 *  turmagan bo'lishi mumkin — shuning uchun tinglovchi qobiqda.
 *  Bu testlar aynan shuni qo'riqlaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const push = vi.fn();
let token: string | null | undefined = 'test-token';
let pathname = '/reyting';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ accessToken: token, authFetch: vi.fn(), login: vi.fn(), logout: vi.fn() }),
}));

const handlers = new Map<string, (payload: unknown) => void>();
const disconnect = vi.fn();
const ioSpy = vi.fn();

vi.mock('socket.io-client', () => ({
  io: (url: string, options: unknown) => {
    ioSpy(url, options);
    return {
      on: (event: string, fn: (payload: unknown) => void) => {
        handlers.set(event, fn);
      },
      disconnect,
    };
  },
}));

/** Holatni ekranga chiqaruvchi eng kichik iste'molchi. */
function Probe() {
  const { connected } = usePlaySocket();
  return <span data-testid="conn">{connected ? 'ulangan' : 'uzilgan'}</span>;
}

async function renderProvider(children = <Probe />) {
  await act(async () => {
    render(<PlaySocketProvider>{children}</PlaySocketProvider>);
  });
}

async function fire(event: string, payload?: unknown): Promise<void> {
  const handler = handlers.get(event);
  if (handler === undefined) {
    throw new Error(`"${event}" tinglovchisi ro'yxatdan o'tmagan`);
  }
  await act(async () => {
    handler(payload);
  });
}

describe('PlaySocketProvider', () => {
  beforeEach(() => {
    push.mockReset();
    disconnect.mockReset();
    ioSpy.mockReset();
    handlers.clear();
    token = 'test-token';
    pathname = '/reyting';
  });

  it('token bo`lmasa soket UMUMAN ochilmaydi', async () => {
    token = null;
    await renderProvider();
    expect(ioSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('conn')).toHaveTextContent('uzilgan');
  });

  it('sessiya aniqlanmagan bo`lsa ham kutadi — soket ochilmaydi', async () => {
    token = undefined;
    await renderProvider();
    expect(ioSpy).not.toHaveBeenCalled();
  });

  it('token bilan `/play` namespace`iga ulanadi', async () => {
    await renderProvider();
    expect(ioSpy).toHaveBeenCalledTimes(1);
    const [url, options] = ioSpy.mock.calls[0] as [string, { auth: { token: string } }];
    expect(url).toMatch(/\/play$/);
    expect(options.auth.token).toBe('test-token');
  });

  it('ulanish holati iste`molchiga yetadi', async () => {
    await renderProvider();
    expect(screen.getByTestId('conn')).toHaveTextContent('uzilgan');
    await fire('connect');
    expect(screen.getByTestId('conn')).toHaveTextContent('ulangan');
    await fire('disconnect');
    expect(screen.getByTestId('conn')).toHaveTextContent('uzilgan');
  });

  it('PUSH kelganda o`yinga o`tiladi — tasdiq SO`RALMAYDI', async () => {
    // Soat allaqachon ishlayapti: "o'ynaysizmi?" deb so'rash vaqt
    // yo'qotish degani.
    await renderProvider();
    await fire('matchmaking:matched', { gameId: 'game-push' });
    expect(push).toHaveBeenCalledWith('/oyin/game-push');
  });

  it('NAVBAT sahifasida bo`lmasa ham o`tadi (do`stona chaqiriq holati)', async () => {
    // Iste'molchi navbat sahifasi EMAS — shunda ham o'tish ishlaydi,
    // chunki tinglovchi qobiqda.
    await renderProvider(<span>reyting sahifasi</span>);
    await fire('matchmaking:matched', { gameId: 'game-chaqiriq' });
    expect(push).toHaveBeenCalledWith('/oyin/game-chaqiriq');
  });

  it('TAXTADA turgan o`yinchini yangi o`yinga TORTIB OLMAYDI', async () => {
    // Jonli partiyani tashlab ketish — soati ishlab turgan holda —
    // yangi o'yinni o'tkazib yuborishdan YOMONROQ. Yangi o'yin
    // "Faol o'yinlarim" ro'yxatida qoladi.
    pathname = '/oyin/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    await renderProvider();
    await fire('matchmaking:matched', { gameId: 'game-yangi' });
    expect(push).not.toHaveBeenCalled();
  });

  it('NAVBAT sahifasi o`yin ekrani EMAS — o`tish ishlaydi', async () => {
    pathname = '/oyin';
    await renderProvider();
    await fire('matchmaking:matched', { gameId: 'game-navbat' });
    expect(push).toHaveBeenCalledWith('/oyin/game-navbat');
  });

  it('DO`STLAR sahifasi ham o`yin ekrani emas', async () => {
    pathname = '/oyin/dostlar';
    await renderProvider();
    await fire('matchmaking:matched', { gameId: 'game-dost' });
    expect(push).toHaveBeenCalledWith('/oyin/game-dost');
  });

  it('ulanishda obunachilarga signal beradi (o`tkazib yuborilgan juftlik uchun)', async () => {
    const seen: number[] = [];

    function Subscriber() {
      const { subscribeConnected } = usePlaySocket();
      // Obuna BIR MARTA o'rnatiladi va har ulanishda chaqiriladi.
      useEffect(() => subscribeConnected(() => seen.push(seen.length + 1)), [subscribeConnected]);
      return null;
    }

    await renderProvider(<Subscriber />);
    await fire('connect');
    await fire('disconnect');
    await fire('connect');

    expect(seen).toHaveLength(2);
  });
});
