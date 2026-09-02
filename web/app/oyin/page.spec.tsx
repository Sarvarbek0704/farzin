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

// Socket faqat `matchmaking:matched` push'ini kutadi; testda uni
// qo'lda chaqirish uchun tinglovchini saqlab qo'yamiz.
const handlers = new Map<string, (payload: unknown) => void>();
const disconnect = vi.fn();
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event: string, fn: (payload: unknown) => void) => {
      handlers.set(event, fn);
    },
    disconnect,
  }),
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderPage() {
  const { default: Page } = await import('./page');
  await act(async () => {
    render(<Page />);
  });
}

describe('navbat sahifasi', () => {
  beforeEach(() => {
    authFetch.mockReset();
    push.mockReset();
    handlers.clear();
    token = 'test-token';
    authFetch.mockResolvedValue(jsonResponse([]));
  });

  it('sessiya aniqlanmaguncha "kirmagansiz" DEYILMAYDI', async () => {
    token = undefined;
    await renderPage();
    expect(screen.getByText(/Yuklanmoqda/)).toBeInTheDocument();
    expect(screen.queryByText(/kirish kerak/)).toBeNull();
  });

  it('kirilmagan — o`ynash taklif qilinmaydi, tomoshabinlik esa mumkin', async () => {
    token = null;
    await renderPage();
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

  it('navbatda turganda PUSH kelsa ham o`yinga o`tiladi', async () => {
    await renderPage();
    await screen.findByText(/Faol o.yin yo.q/);

    const onMatched = handlers.get('matchmaking:matched');
    expect(onMatched).toBeDefined();
    await act(async () => {
      onMatched?.({ gameId: 'game-push' });
    });
    expect(push).toHaveBeenCalledWith('/oyin/game-push');
  });
});
