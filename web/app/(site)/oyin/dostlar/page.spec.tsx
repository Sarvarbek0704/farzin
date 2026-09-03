import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Do'stlar sahifasi — HOLATLAR va AMALLAR.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU YERDA NIMA TEKSHIRILADI
 *
 *  Qoidalarning O'ZI backendda (`friendship.rules.spec.ts`, 23 test)
 *  va API zanjiri integratsiyada (32 test). Bu qatlamda faqat
 *  KLIENTNING qarorlari:
 *
 *   - kelgan va yuborilgan so'rov AJRATIB ko'rsatiladimi;
 *   - xavfli amal (chiqarish, bloklash) TASDIQ so'raydimi;
 *   - bloklash so'rovi maqsad ID'sini TANAda yuboradimi (yo'lda emas);
 *   - qidiruv minimal uzunlikni hurmat qiladimi;
 *   - server xatosi AYNAN o'sha qator ostida chiqadimi.
 * ═══════════════════════════════════════════════════════════════════════════
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

interface Row {
  friendshipId: string;
  otherPlayerId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  status: string;
  outgoing: boolean;
  createdAt: string;
}

function row(over: Partial<Row> = {}): Row {
  return {
    friendshipId: 'f-1',
    otherPlayerId: 'p-1',
    firstName: 'Nodirbek',
    lastName: 'Abdusattorov',
    title: null,
    status: 'ACCEPTED',
    outgoing: false,
    createdAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Uch ro'yxat so'rovi — yo'l bo'yicha javob beriladi. */
function respondWithLists(lists: { friends?: Row[]; requests?: Row[]; blocks?: Row[] }): void {
  authFetch.mockImplementation((path: string, init?: RequestInit) => {
    // Yozuv amallari: bo'sh 204.
    if (init?.method !== undefined) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (path.endsWith('/friends/requests')) {
      return Promise.resolve(json(lists.requests ?? []));
    }
    if (path.endsWith('/friends/blocks')) {
      return Promise.resolve(json(lists.blocks ?? []));
    }
    if (path.includes('/players?')) {
      return Promise.resolve(json({ items: [], pageInfo: {} }));
    }
    return Promise.resolve(json(lists.friends ?? []));
  });
}

async function renderPage() {
  const { default: Page } = await import('./page');
  await act(async () => {
    render(<Page />);
  });
}

/** So'rovlar ichidan yozuv amalini topish. */
function writeCall(match: string): [string, RequestInit] | undefined {
  return authFetch.mock.calls.find(
    (c) => String(c[0]).includes(match) && (c[1] as RequestInit | undefined)?.method !== undefined,
  ) as [string, RequestInit] | undefined;
}

describe('do`stlar sahifasi', () => {
  beforeEach(() => {
    authFetch.mockReset();
    push.mockReset();
    token = 'test-token';
    respondWithLists({});
  });

  it('kirilmagan — ro`yxat ko`rsatilmaydi, kirish so`raladi', async () => {
    token = null;
    await renderPage();
    expect(screen.getByText(/shaxsiy/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kirish/ })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('sessiya aniqlanmaguncha "kirmagansiz" DEYILMAYDI', async () => {
    token = undefined;
    await renderPage();
    expect(screen.queryByText(/shaxsiy/i)).toBeNull();
  });

  it('do`st yo`q bo`lsa — BO`SH holat, yolg`on ro`yxat emas', async () => {
    await renderPage();
    expect(await screen.findByText(/Hali do.st qo.shilmagan/)).toBeInTheDocument();
  });

  it('do`stlar ro`yxati ism bilan chiqadi', async () => {
    respondWithLists({ friends: [row()] });
    await renderPage();
    expect(await screen.findByText(/Abdusattorov Nodirbek/)).toBeInTheDocument();
  });

  it('KELGAN va YUBORILGAN so`rovlar ajratiladi', async () => {
    respondWithLists({
      requests: [
        row({ friendshipId: 'in-1', status: 'PENDING', outgoing: false, lastName: 'Kelgan' }),
        row({ friendshipId: 'out-1', status: 'PENDING', outgoing: true, lastName: 'Yuborilgan' }),
      ],
    });
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('tab', { name: /So.rovlar/ }));

    expect(screen.getByText('Sizga kelgan')).toBeInTheDocument();
    expect(screen.getByText('Siz yuborgan')).toBeInTheDocument();
    // Yuborilgan so'rovni QABUL QILIB bo'lmaydi — faqat bekor qilinadi.
    expect(screen.getAllByRole('button', { name: /Qabul qilish/ })).toHaveLength(1);
    expect(screen.getByText(/Javob kutilmoqda/)).toBeInTheDocument();
  });

  it('faqat KELGAN so`rovlar nishonda sanaladi', async () => {
    // Yuborilgan so'rov e'tibor talab qilmaydi — nishon "ish bor"
    // degan yolg'on signal bermasligi kerak.
    respondWithLists({
      requests: [row({ friendshipId: 'out-1', status: 'PENDING', outgoing: true })],
    });
    await renderPage();
    const tab = await screen.findByRole('tab', { name: /So.rovlar/ });
    expect(within(tab).queryByText('1')).toBeNull();
  });

  it('qabul qilish — to`g`ri endpointga POST', async () => {
    respondWithLists({
      requests: [row({ friendshipId: 'in-9', status: 'PENDING', outgoing: false })],
    });
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('tab', { name: /So.rovlar/ }));
    await user.click(screen.getByRole('button', { name: /Qabul qilish/ }));

    const call = writeCall('/friends/in-9/accept');
    expect(call).toBeDefined();
    expect(call?.[1].method).toBe('POST');
  });

  it('do`stlikdan chiqarish TASDIQ so`raydi — bir bosishda o`chmaydi', async () => {
    respondWithLists({ friends: [row({ friendshipId: 'f-7' })] });
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText(/Abdusattorov/);

    await user.click(screen.getByRole('button', { name: /Chiqarish/ }));
    // Hali hech narsa yuborilmagan.
    expect(writeCall('/friends/f-7')).toBeUndefined();
    expect(screen.getByText(/chiqarilsinmi/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Ha$/ }));
    const call = writeCall('/friends/f-7');
    expect(call?.[1].method).toBe('DELETE');
  });

  it('tasdiqni bekor qilish HECH NARSA yubormaydi', async () => {
    respondWithLists({ friends: [row({ friendshipId: 'f-7' })] });
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText(/Abdusattorov/);

    await user.click(screen.getByRole('button', { name: /Chiqarish/ }));
    await user.click(screen.getByRole('button', { name: /Yo.q/ }));

    expect(writeCall('/friends/f-7')).toBeUndefined();
    expect(screen.getByRole('button', { name: /Chiqarish/ })).toBeInTheDocument();
  });

  it('bloklash MAQSAD ID`sini tanada yuboradi (yo`lda emas)', async () => {
    // Backend blokni juftlikdan topadi; shaxsiy ma'lumot URL'ga
    // chiqmasin (dto/friend-target.dto.ts izohi).
    respondWithLists({ friends: [row({ friendshipId: 'f-7', otherPlayerId: 'p-77' })] });
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText(/Abdusattorov/);

    await user.click(screen.getByRole('button', { name: /Bloklash/ }));
    await user.click(screen.getByRole('button', { name: /^Ha$/ }));

    const call = writeCall('/friends/blocks');
    expect(call?.[1].method).toBe('POST');
    expect(JSON.parse(call?.[1].body as string)).toEqual({ playerId: 'p-77' });
  });

  it('blokni ochish — DELETE /friends/blocks/:id', async () => {
    respondWithLists({ blocks: [row({ friendshipId: 'b-3', status: 'BLOCKED', outgoing: true })] });
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('tab', { name: /Bloklanganlar/ }));
    await user.click(await screen.findByRole('button', { name: /Blokni ochish/ }));

    const call = writeCall('/friends/blocks/b-3');
    expect(call?.[1].method).toBe('DELETE');
  });

  describe('qidiruv', () => {
    it('bitta harfda so`rov YUBORILMAYDI', async () => {
      const user = userEvent.setup();
      await renderPage();
      await screen.findByText(/Hali do.st qo.shilmagan/);

      await user.type(screen.getByRole('searchbox'), 'S');

      expect(screen.getByText(/Kamida 2 harf/)).toBeInTheDocument();
      expect(authFetch.mock.calls.some((c) => String(c[0]).includes('/players?'))).toBe(false);
    });

    it('natija topilmasa — sabab tushuntiriladi', async () => {
      const user = userEvent.setup();
      await renderPage();
      await screen.findByText(/Hali do.st qo.shilmagan/);

      await user.type(screen.getByRole('searchbox'), 'Zzz');
      expect(
        await screen.findByText(/Hech kim topilmadi/, {}, { timeout: 3000 }),
      ).toBeInTheDocument();
    });

    it('so`rov yuborilganda tugma o`rniga tasdiq matni chiqadi', async () => {
      authFetch.mockImplementation((path: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(json({ id: 'new-1' }, 201));
        }
        if (path.includes('/players?')) {
          return Promise.resolve(
            json({
              items: [{ id: 'p-5', firstName: 'Javokhir', lastName: 'Sindarov', title: null }],
            }),
          );
        }
        return Promise.resolve(json([]));
      });
      const user = userEvent.setup();
      await renderPage();

      await user.type(screen.getByRole('searchbox'), 'Sindarov');
      const send = await screen.findByRole(
        'button',
        { name: /So.rov yuborish/ },
        { timeout: 3000 },
      );
      await user.click(send);

      expect(await screen.findByText(/So.rov yuborildi/)).toBeInTheDocument();
    });

    it('server RAD ETSA sabab AYNAN o`sha qator ostida chiqadi', async () => {
      // "Allaqachon do'stsiz" — foydali javob; uni umumiy "xatolik"
      // bilan almashtirish ma'lumotni yo'qotardi.
      authFetch.mockImplementation((path: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            json({ title: "Siz allaqachon do'stsiz", code: 'ALREADY_FRIENDS' }, 422),
          );
        }
        if (path.includes('/players?')) {
          return Promise.resolve(
            json({
              items: [{ id: 'p-5', firstName: 'Javokhir', lastName: 'Sindarov', title: null }],
            }),
          );
        }
        return Promise.resolve(json([]));
      });
      const user = userEvent.setup();
      await renderPage();

      await user.type(screen.getByRole('searchbox'), 'Sindarov');
      const send = await screen.findByRole(
        'button',
        { name: /So.rov yuborish/ },
        { timeout: 3000 },
      );
      await user.click(send);

      expect(await screen.findByRole('alert')).toHaveTextContent(/allaqachon do.stsiz/i);
    });
  });
});
