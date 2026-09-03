import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Navbat sahifasi — HOLATLAR testi.
 *
 * Navbatning uchta natijasi bor va uchalasi ham boshqacha ko'rinadi:
 *  - kirilmagan   → o'ynash taklif qilinmaydi, kirish so'raladi;
 *  - `queued`     → navbatdan chiqish tugmasi;
 *  - `matched`    → darhol o'yinga o'tish.
 *
 * Alohida: yuborilgan `timeCategory` VAQTGA mos bo'lishi (K-19) —
 * backend mos kelmasa 422 beradi, ya'ni xato preset butun tugmani
 * ishlamas qilardi.
 */

const authFetch = vi.fn();
const push = vi.fn();
let token: string | null | undefined = 'test-token';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ authFetch, accessToken: token, login: vi.fn(), logout: vi.fn() }),
  readJson: async (res: Response): Promise<unknown> => (await res.json()) as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

/*
 * SOKET — SAHIFANIKI EMAS, QOBIQNIKI.
 *
 * `matchmaking:matched` endi `lib/play-socket.tsx` da tinglanadi
 * (do'stona chaqiriqda o'yinchi bu sahifada bo'lmasligi mumkin), va
 * uning O'Z testi bor: lib/play-socket.spec.tsx.
 *
 * Bu yerda sahifaga faqat ikki narsa kerak: ulanish HOLATI (presetlar
 * shunga qarab ochiladi) va "qayta ulandik" SIGNALI (o'tkazib
 * yuborilgan juftlikni tiklash). Ikkalasi ham quyidagi soxta do'kon
 * orqali boshqariladi.
 */
const socketStore = {
  connected: false,
  /** `useSyncExternalStore` tinglovchilari — qayta chizish uchun. */
  subscribers: new Set<() => void>(),
  /** Sahifaning "ulandik" ishlovchilari. */
  onConnect: new Set<() => void>(),
};

function subscribeStore(callback: () => void): () => void {
  socketStore.subscribers.add(callback);
  return () => socketStore.subscribers.delete(callback);
}

function subscribeConnected(callback: () => void): () => void {
  socketStore.onConnect.add(callback);
  return () => socketStore.onConnect.delete(callback);
}

vi.mock('@/lib/play-socket', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePlaySocket: () => ({
      connected: useSyncExternalStore(
        subscribeStore,
        () => socketStore.connected,
        () => socketStore.connected,
      ),
      subscribeConnected,
    }),
  };
});

/** `my/games` qatori namunasi. */
const GAME_ROW = {
  id: 'game-1',
  status: 'ACTIVE',
  whitePlayerId: 'a',
  blackPlayerId: 'b',
  timeCategory: 'BLITZ',
  baseTimeSeconds: 300,
  incrementSeconds: 0,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderPage(options: { connect?: boolean } = {}) {
  const { default: Page } = await import('./page');
  await act(async () => {
    render(<Page />);
  });
  // Haqiqiy soket ulangach signal beradi; presetlar shundan keyin
  // ochiladi. Testlar buni ATAYLAB qo'lda chaqiradi — ulanish
  // bo'lmagan holat ham tekshiriladigan xulq.
  if (options.connect !== false) {
    await fire('connect');
  }
}

/** Ulanish/uzilishni taqlid qilish. */
async function fire(event: 'connect' | 'disconnect'): Promise<void> {
  await act(async () => {
    socketStore.connected = event === 'connect';
    for (const callback of socketStore.subscribers) {
      callback();
    }
    if (event === 'connect') {
      for (const callback of socketStore.onConnect) {
        callback();
      }
    }
  });
}

describe('navbat sahifasi', () => {
  beforeEach(() => {
    authFetch.mockReset();
    push.mockReset();
    socketStore.connected = false;
    socketStore.onConnect.clear();
    socketStore.subscribers.clear();
    token = 'test-token';
    authFetch.mockResolvedValue(jsonResponse([]));
  });

  it('sessiya aniqlanmaguncha "kirmagansiz" DEYILMAYDI', async () => {
    token = undefined;
    // Socket ochilmaydi — `connect` ni chaqirib bo'lmaydi.
    await renderPage({ connect: false });
    expect(screen.getByText(/Yuklanmoqda/)).toBeInTheDocument();
    expect(screen.queryByText(/kirish kerak/)).toBeNull();
  });

  it('kirilmagan — o`ynash taklif qilinmaydi, tomoshabinlik esa mumkin', async () => {
    token = null;
    await renderPage({ connect: false });
    expect(screen.getByText(/O.ynash uchun kirish kerak/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kirish/ })).toBeInTheDocument();
    // Navbat tugmalari umuman ko'rsatilmaydi.
    expect(screen.queryByRole('button', { name: /3\+2/ })).toBeNull();
  });

  it('faol o`yin yo`q bo`lsa — bo`sh holat, yolg`on jadval emas', async () => {
    await renderPage();
    expect(await screen.findByText(/Faol o.yin yo.q/)).toBeInTheDocument();
  });

  it('faol o`yin bor bo`lsa ro`yxatda ko`rinadi va havola beradi', async () => {
    authFetch.mockResolvedValue(
      jsonResponse([
        {
          id: 'game-1',
          status: 'ACTIVE',
          whitePlayerId: 'a',
          blackPlayerId: 'b',
          timeCategory: 'BLITZ',
          baseTimeSeconds: 300,
          incrementSeconds: 0,
        },
      ]),
    );
    await renderPage();
    const link = await screen.findByRole('link', { name: /Davom ettirish/ });
    expect(link).toHaveAttribute('href', '/oyin/game-1');
  });

  it('preset bosilganda kategoriya VAQTDAN hisoblanadi (K-19)', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText(/Faol o.yin yo.q/);

    authFetch.mockResolvedValue(jsonResponse({ status: 'queued' }));
    await user.click(screen.getByRole('button', { name: /15\+10/ }));

    const call = authFetch.mock.calls.find((c) => String(c[0]).includes('matchmaking/join'));
    expect(call).toBeDefined();
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
    // 15 + 10 = 25 daqiqa → RAPID (docs/06 §5). BULLET yoki CLASSICAL
    // yuborilsa backend 422 berardi.
    expect(body.timeCategory).toBe('RAPID');
    expect(body.baseTimeSeconds).toBe(900);
    expect(body.incrementSeconds).toBe(10);
    // Increment bor → Fischer; yo'q → sudden death.
    expect(body.clockType).toBe('FISCHER_INCREMENT');
  });

  it('incrementsiz preset — SUDDEN_DEATH', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText(/Faol o.yin yo.q/);

    authFetch.mockResolvedValue(jsonResponse({ status: 'queued' }));
    await user.click(screen.getByRole('button', { name: /^5\+0/ }));

    const call = authFetch.mock.calls.find((c) => String(c[0]).includes('matchmaking/join'));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.clockType).toBe('SUDDEN_DEATH');
    expect(body.timeCategory).toBe('BLITZ');
  });

  it('`queued` — navbatdan chiqish tugmasi paydo bo`ladi', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText(/Faol o.yin yo.q/);

    authFetch.mockResolvedValue(jsonResponse({ status: 'queued' }));
    await user.click(screen.getByRole('button', { name: /3\+2/ }));

    expect(await screen.findByRole('button', { name: /Navbatdan chiqish/ })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('`matched` — darhol o`yinga o`tiladi, tasdiq so`ralmaydi', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText(/Faol o.yin yo.q/);

    authFetch.mockResolvedValue(jsonResponse({ status: 'matched', gameId: 'game-9' }));
    await user.click(screen.getByRole('button', { name: /3\+2/ }));

    expect(push).toHaveBeenCalledWith('/oyin/game-9');
  });

  describe('push yo`qolganda tiklash (E2E ochib bergan xato)', () => {
    it('socket ulanmaguncha navbatga turib bo`lmaydi', async () => {
      await renderPage({ connect: false });
      await screen.findByText(/Faol o.yin yo.q/);

      expect(screen.getByRole('button', { name: /3\+2/ })).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent(/ulanilmoqda/i);
    });

    it('ulangach navbat ochiladi', async () => {
      await renderPage();
      await screen.findByText(/Faol o.yin yo.q/);
      expect(screen.getByRole('button', { name: /3\+2/ })).toBeEnabled();
    });

    it('QAYTA ulanishda o`tkazib yuborilgan juftlik topiladi', async () => {
      const user = userEvent.setup();
      await renderPage();
      await screen.findByText(/Faol o.yin yo.q/);

      authFetch.mockResolvedValue(jsonResponse({ status: 'queued' }));
      await user.click(screen.getByRole('button', { name: /3\+2/ }));
      await screen.findByRole('button', { name: /Navbatdan chiqish/ });
      expect(push).not.toHaveBeenCalled();

      // Uzilish paytida server juftlashtirdi va push yo'qoldi.
      await fire('disconnect');
      authFetch.mockResolvedValue(
        jsonResponse([{ ...GAME_ROW, id: 'game-yangi', status: 'ACTIVE' }]),
      );
      await fire('connect');

      expect(push).toHaveBeenCalledWith('/oyin/game-yangi');
    });

    it('ESKI o`yinga TORTIB KETMAYDI — faqat yangisi', async () => {
      const user = userEvent.setup();
      // Navbatga turishdan oldin allaqachon faol o'yin bor.
      authFetch.mockResolvedValue(jsonResponse([{ ...GAME_ROW, id: 'game-eski' }]));
      await renderPage();
      await screen.findByRole('link', { name: /Davom ettirish/ });

      authFetch.mockResolvedValue(jsonResponse({ status: 'queued' }));
      await user.click(screen.getByRole('button', { name: /3\+2/ }));
      await screen.findByRole('button', { name: /Navbatdan chiqish/ });

      // Qayta ulanishda o'sha ESKI o'yin qaytadi — bu juftlik EMAS.
      authFetch.mockResolvedValue(jsonResponse([{ ...GAME_ROW, id: 'game-eski' }]));
      await fire('connect');

      expect(push).not.toHaveBeenCalled();
    });

    it('navbatda BO`LMASA ulanish hech qayerga olib bormaydi', async () => {
      authFetch.mockResolvedValue(jsonResponse([{ ...GAME_ROW, id: 'game-eski' }]));
      await renderPage();
      await screen.findByRole('link', { name: /Davom ettirish/ });

      await fire('connect');
      expect(push).not.toHaveBeenCalled();
    });

    it('tiklash so`rovi yiqilsa navbat BEKOR QILINMAYDI', async () => {
      const user = userEvent.setup();
      await renderPage();
      await screen.findByText(/Faol o.yin yo.q/);

      // join -> queued, keyingi `my/games` esa yiqiladi.
      authFetch
        .mockResolvedValueOnce(jsonResponse({ status: 'queued' }))
        .mockRejectedValue(new Error('tarmoq uzildi'));
      await user.click(screen.getByRole('button', { name: /3\+2/ }));

      // Foydalanuvchi SERVERDA navbatda — UI ham shuni ko'rsatishi kerak.
      expect(await screen.findByRole('button', { name: /Navbatdan chiqish/ })).toBeInTheDocument();
    });
  });
});
