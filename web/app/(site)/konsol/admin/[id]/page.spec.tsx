import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ma'muriy foydalanuvchi sahifasi — ROL BERISH formasi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU QATLAM NIMANI QO'RIQLAYDI
 *
 *  Delegatsiya qoidalari backendda (`role-grant.rules.spec.ts`, 21 test)
 *  va u YAGONA himoya. Bu yerda faqat FORMANING to'g'riligi:
 *
 *   - sababsiz yuborib bo'lmaydimi (backend 400 berardi);
 *   - qamrov maydoni ROLGA QARAB paydo bo'ladimi (aks holda odam
 *     422 oladi va nima qilishni bilmaydi);
 *   - o'zini bloklash tugmasi UMUMAN ko'rsatilmaydimi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const authFetch = vi.fn();
let session: { userId: string; roles: { role: string; scopeType: string | null }[] } | null = {
  userId: 'admin-1',
  roles: [{ role: 'SUPER_ADMIN', scopeType: null }],
};

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    isSuperAdmin: actual.isSuperAdmin,
    useAuth: () => ({
      authFetch,
      accessToken: 'test-token',
      session,
      login: vi.fn(),
      logout: vi.fn(),
    }),
    readJson: async (res: Response): Promise<unknown> => (await res.json()) as unknown,
  };
});

const USER = {
  id: 'user-9',
  email: 'nodir@test.uz',
  phone: null,
  status: 'ACTIVE',
  emailVerified: true,
  totpEnabled: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  firstName: 'Nodirbek',
  lastName: 'Abdusattorov',
  roles: [
    {
      id: 'role-1',
      role: 'PLAYER',
      scopeType: null,
      scopeId: null,
      expiresAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderPage(user: unknown = USER) {
  authFetch.mockImplementation((_path: string, init?: RequestInit) => {
    if (init?.method !== undefined) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(json(user));
  });
  const { default: Page } = await import('./page');
  await act(async () => {
    render(<Page params={Promise.resolve({ id: 'user-9' })} />);
  });
}

/** Yozuv so'rovi (POST/PATCH/DELETE) — bo'lsa qaytaradi. */
function writeCall(match: string): [string, RequestInit] | undefined {
  return authFetch.mock.calls.find(
    (c) => String(c[0]).includes(match) && (c[1] as RequestInit | undefined)?.method !== undefined,
  ) as [string, RequestInit] | undefined;
}

const GOOD_REASON = 'Bahorgi chempionat uchun hakam sifatida tayinlanmoqda';

describe('ma`muriy foydalanuvchi sahifasi', () => {
  beforeEach(() => {
    authFetch.mockReset();
    session = { userId: 'admin-1', roles: [{ role: 'SUPER_ADMIN', scopeType: null }] };
  });

  it('superadmin BO`LMAGANGA bo`lim ko`rsatilmaydi', async () => {
    session = { userId: 'oddiy-1', roles: [{ role: 'PLAYER', scopeType: null }] };
    await renderPage();
    expect(screen.getByText(/superadmin uchun/i)).toBeInTheDocument();
    // Rol berish formasi UMUMAN chizilmaydi.
    expect(screen.queryByRole('button', { name: /Rolni berish/ })).toBeNull();
  });

  it('mavjud rollar ko`rinadi', async () => {
    await renderPage();
    // "O'yinchi" ham, "Global" ham ikki joyda uchraydi: mavjud rollar
    // ro'yxatida VA rol berish formasida (select / qamrov tugmalari).
    // Shuning uchun ro'yxat qatorining O'ZINI qidiramiz.
    await screen.findByRole('button', { name: /Olib tashlash/ });
    expect(screen.getAllByText("O'yinchi").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Global').length).toBeGreaterThanOrEqual(1);
  });

  it('SABABSIZ rol berib bo`lmaydi', async () => {
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });
    // Backend qisqa sababni 400 bilan rad etardi — tugma shu holatda
    // umuman bosilmaydi.
    expect(screen.getByRole('button', { name: /Rolni berish/ })).toBeDisabled();
  });

  it('QISQA sabab ham yetarli emas', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });

    await user.type(screen.getByLabelText(/Nega bu rol berilmoqda/), 'ok');
    expect(screen.getByRole('button', { name: /Rolni berish/ })).toBeDisabled();
  });

  it('to`liq sabab bilan rol beriladi', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });

    await user.type(screen.getByLabelText(/Nega bu rol berilmoqda/), GOOD_REASON);
    await user.click(screen.getByRole('button', { name: /Rolni berish/ }));

    const call = writeCall('/roles');
    expect(call?.[1].method).toBe('POST');
    const body = JSON.parse(call?.[1].body as string) as Record<string, unknown>;
    expect(body.role).toBe('ARBITER');
    expect(body.reason).toBe(GOOD_REASON);
  });

  it('QAMROV talab qiladigan rol tanlansa maydon paydo bo`ladi', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });

    // CLUB_ADMIN faqat klub qamrovida bo'ladi (backend: ALLOWED_SCOPES).
    await user.selectOptions(screen.getByLabelText('Rol'), 'CLUB_ADMIN');
    expect(screen.getByLabelText(/Klub ID/)).toBeInTheDocument();
  });

  it('qamrov ID`siz yuborib bo`lmaydi', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });

    await user.selectOptions(screen.getByLabelText('Rol'), 'CLUB_ADMIN');
    await user.type(screen.getByLabelText(/Nega bu rol berilmoqda/), GOOD_REASON);

    expect(screen.getByRole('button', { name: /Rolni berish/ })).toBeDisabled();
  });

  it('GLOBAL rolda qamrov maydoni YO`Q', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });

    await user.selectOptions(screen.getByLabelText('Rol'), 'SUPER_ADMIN');
    expect(screen.queryByLabelText(/ID \(UUID\)/)).toBeNull();
  });

  it('rolni olib tashlash ham SABAB so`raydi', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });

    await user.click(screen.getByRole('button', { name: /Olib tashlash/ }));
    // Panel ochildi, lekin hali hech narsa yuborilmadi.
    expect(writeCall('/roles/')).toBeUndefined();

    // Ochilgach TRIGGER tugma yo'qoladi va o'rnida TASDIQ tugmasi
    // qoladi — ya'ni "Olib tashlash" baribir bitta.
    expect(screen.getByRole('button', { name: /Olib tashlash/ })).toBeDisabled();

    await user.type(
      screen.getByLabelText(/Nega olib tashlanmoqda/),
      'Turnir yakunlandi, muddati tugadi',
    );
    await user.click(screen.getByRole('button', { name: /Olib tashlash/ }));

    const call = writeCall('/roles/role-1');
    expect(call?.[1].method).toBe('DELETE');
  });

  it("O'ZINI bloklash tugmasi UMUMAN ko'rsatilmaydi", async () => {
    // Backend ham to'sadi (SELF_LOCKOUT), lekin bosib bo'lmaydigan
    // tugmani ko'rsatishdan ko'ra uni umuman chizmaslik to'g'riroq.
    await renderPage({ ...USER, id: 'admin-1' });
    expect(await screen.findByText(/O.z hisobingizni bloklay olmaysiz/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bloklash$/ })).toBeNull();
  });

  it('begona hisob uchun bloklash mavjud', async () => {
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });
    expect(screen.getByRole('button', { name: /^Bloklash$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vaqtincha to.xtatish/ })).toBeInTheDocument();
  });

  it('bloklangan hisob uchun TIKLASH tugmasi', async () => {
    await renderPage({ ...USER, status: 'BANNED' });
    expect(await screen.findByRole('button', { name: /Hisobni tiklash/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bloklash$/ })).toBeNull();
  });

  it('server rad etsa SABAB ko`rsatiladi', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('button', { name: /Rolni berish/ });

    authFetch.mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method !== undefined) {
        return Promise.resolve(json({ title: 'Oxirgi superadminni olib tashlab bo`lmaydi' }, 422));
      }
      return Promise.resolve(json(USER));
    });

    await user.type(screen.getByLabelText(/Nega bu rol berilmoqda/), GOOD_REASON);
    await user.click(screen.getByRole('button', { name: /Rolni berish/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Oxirgi superadmin/);
  });
});
