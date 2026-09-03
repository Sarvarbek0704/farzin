import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChallengePicker } from './challenge-picker';

/**
 * Do'stona chaqiriq — vaqt nazoratini tanlash.
 *
 * Eng muhim da'vo: `timeCategory` VAQTDAN hisoblanadi (K-19). Xato
 * kategoriya bilan server 422 `TIME_CATEGORY_MISMATCH` beradi, ya'ni
 * tugma jimgina ishlamay qolardi.
 */

const authFetch = vi.fn();

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ authFetch, accessToken: 'test-token', login: vi.fn(), logout: vi.fn() }),
  readJson: async (res: Response): Promise<unknown> => {
    if (!res.ok) {
      const problem = (await res.json()) as { title?: string };
      throw new Error(problem.title ?? 'xato');
    }
    return (await res.json()) as unknown;
  },
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const onCreated = vi.fn();
const onCancel = vi.fn();

async function renderPicker() {
  await act(async () => {
    render(<ChallengePicker opponentPlayerId="p-42" onCreated={onCreated} onCancel={onCancel} />);
  });
}

/** Chaqiriq so'rovining tanasi. */
function challengeBody(): Record<string, unknown> {
  const call = authFetch.mock.calls.find((c) => String(c[0]).includes('/play/challenges'));
  expect(call).toBeDefined();
  return JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe('ChallengePicker', () => {
  beforeEach(() => {
    authFetch.mockReset();
    onCreated.mockReset();
    onCancel.mockReset();
  });

  it('o`yin DARHOL boshlanishini ochiq aytadi', async () => {
    // "Taklif yuborildi, javob kutilmoqda" degan holat MAVJUD EMAS:
    // soat shu zahoti ishlay boshlaydi (play.service.ts).
    await renderPicker();
    expect(screen.getByText(/darhol/)).toBeInTheDocument();
  });

  it('kategoriya VAQTDAN hisoblanadi (K-19)', async () => {
    authFetch.mockResolvedValue(json({ gameId: 'game-1' }));
    const user = userEvent.setup();
    await renderPicker();

    // 15+10 = 25 daqiqa → RAPID.
    await user.click(screen.getByRole('button', { name: /15\+10/ }));

    const body = challengeBody();
    expect(body.timeCategory).toBe('RAPID');
    expect(body.baseTimeSeconds).toBe(900);
    expect(body.incrementSeconds).toBe(10);
    expect(body.clockType).toBe('FISCHER_INCREMENT');
    expect(body.opponentPlayerId).toBe('p-42');
  });

  it('incrementsiz preset — SUDDEN_DEATH', async () => {
    authFetch.mockResolvedValue(json({ gameId: 'game-2' }));
    const user = userEvent.setup();
    await renderPicker();

    await user.click(screen.getByRole('button', { name: /^5\+0/ }));

    expect(challengeBody().clockType).toBe('SUDDEN_DEATH');
    expect(challengeBody().timeCategory).toBe('BLITZ');
  });

  it('yaratilgach o`yin ID`si qaytariladi', async () => {
    authFetch.mockResolvedValue(json({ gameId: 'game-9' }));
    const user = userEvent.setup();
    await renderPicker();

    await user.click(screen.getByRole('button', { name: /^3\+2/ }));
    expect(onCreated).toHaveBeenCalledWith('game-9');
  });

  it('server rad etsa SABAB ko`rsatiladi va tugmalar qayta ochiladi', async () => {
    authFetch.mockResolvedValue(json({ title: "O'zingizga qarshi o'ynay olmaysiz" }, 422));
    const user = userEvent.setup();
    await renderPicker();

    await user.click(screen.getByRole('button', { name: /^3\+2/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/o.zingizga qarshi/i);
    expect(onCreated).not.toHaveBeenCalled();
    // Xatodan keyin qayta urinish MUMKIN — panel qulflanib qolmaydi.
    expect(screen.getByRole('button', { name: /^3\+2/ })).toBeEnabled();
  });
});
