import { act, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fair-play qaror formasi — QOROVULLAR testi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA AYNAN SHU EKRAN TESTLANADI
 *
 *  Bu forma odamning karyerasiga ta'sir qiladigan qaror chiqaradi
 *  (docs/08 §4). Backend qorovullari bor (422 RATIONALE_REQUIRED,
 *  SANCTION_UNTIL_REQUIRED), lekin UI ularni YUBORISHDAN OLDIN
 *  ko'rsatishi kerak — hakam "yubordim, rad etildi" siklida qolmasin.
 *
 *  Test aynan shu ishqalanishni qo'riqlaydi: kimdir "qulaylik uchun"
 *  tugmani doim faol qilib qo'ysa, test yiqiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const authFetch = vi.fn();

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ authFetch, accessToken: 'test-token', login: vi.fn(), logout: vi.fn() }),
  readJson: async (res: Response): Promise<unknown> => {
    if (!res.ok) {
      throw new Error('so`rov muvaffaqiyatsiz');
    }
    return (await res.json()) as unknown;
  },
}));

const OPEN_CASE = {
  case: {
    id: '01a05c96-a693-7710-a7bd-658661df88f8',
    playerId: 'p1',
    status: 'OPEN',
    aggregateScore: 0.5,
    decisionRationale: null,
    sanctionUntil: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    reviewedAt: null,
  },
  signals: [{ id: 's1', type: 'MANUAL_REPORT', strength: 0.5, createdAt: '2026-09-01T10:00:00.000Z' }],
  reports: [],
  appeals: [],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderPage(detail: unknown = OPEN_CASE) {
  authFetch.mockResolvedValue(jsonResponse(detail));
  const { default: Page } = await import('./page');
  // Sahifa `use(params)` ishlatadi (Next 15 shartnomasi: params — promise),
  // ya'ni promise hal bo'lguncha SUSPEND bo'ladi. Ilovada buni Next'ning
  // o'z chegarasi ushlaydi; testda chegara qo'lda kerak.
  // IKKI SHART (ikkalasi ham jonli sinovda aniqlandi):
  //  1. `params` promise'i render'dan TASHQARIDA yaratiladi. JSX ichida
  //     yaratilsa har qayta chizishda YANGI promise bo'lib, `use()`
  //     cheksiz suspend qilardi (ilovada Next barqaror promise beradi).
  //  2. Suspend qiluvchi render `await act(...)` ichida bo'lishi shart,
  //     aks holda React ogohlantiradi va daraxt fallback'da qoladi.
  const params = Promise.resolve({ id: 'case-1' });
  await act(async () => {
    render(
      <Suspense fallback={<p>yuklanmoqda</p>}>
        <Page params={params} />
      </Suspense>,
    );
  });
  await screen.findByRole('heading', { name: /Qaror/ });
}

describe('fair-play qaror formasi', () => {
  beforeEach(() => {
    authFetch.mockReset();
  });

  it('asos yozilmaguncha tugma O`CHIQ (backend 422 dan oldin)', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: /Qarorni chiqarish/ })).toBeDisabled();
  });

  it('qisqa asos yetarli emas — 20 belgi chegarasi', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByRole('textbox'), 'qisqa');
    expect(screen.getByRole('button', { name: /Qarorni chiqarish/ })).toBeDisabled();
  });

  it('yetarli asos yozilsa tugma ochiladi', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(
      screen.getByRole('textbox'),
      'Signallar kuchsiz, ish yopiladi. Qo`shimcha dalil topilmadi.',
    );
    expect(screen.getByRole('button', { name: /Qarorni chiqarish/ })).toBeEnabled();
  });

  it('SANKSIYA tanlansa muddat MAJBURIY — doimiy ban yo`q (docs/08 §4.3)', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(
      screen.getByRole('textbox'),
      'Dvigatel mosligi yuqori, uch bosqichda tasdiqlandi va apellyatsiya berilmadi.',
    );
    expect(screen.getByRole('button', { name: /Qarorni chiqarish/ })).toBeEnabled();

    await user.selectOptions(screen.getByRole('combobox'), 'CLOSED_SANCTION');
    // Sana maydoni paydo bo'ldi va tugma yana yopildi.
    expect(screen.getByRole('button', { name: /Qarorni chiqarish/ })).toBeDisabled();
  });

  it('sanksiya sanasi kiritilsa tugma ochiladi', async () => {
    const user = userEvent.setup();
    const { container } = { container: document.body };
    await renderPage();

    await user.type(
      screen.getByRole('textbox'),
      'Dvigatel mosligi yuqori, uch bosqichda tasdiqlandi va apellyatsiya berilmadi.',
    );
    await user.selectOptions(screen.getByRole('combobox'), 'CLOSED_SANCTION');

    const date = container.querySelector('input[type="date"]');
    expect(date).not.toBeNull();
    await user.type(date as HTMLInputElement, '2027-01-01');

    expect(screen.getByRole('button', { name: /Qarorni chiqarish/ })).toBeEnabled();
  });

  it('sanksiya sanasi FAQAT sanksiya qarorida yuboriladi', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(
      screen.getByRole('textbox'),
      'Signallar kuchsiz, ish yopiladi. Qo`shimcha dalil topilmadi.',
    );
    authFetch.mockResolvedValue(jsonResponse({ status: 'CLOSED_NO_ACTION' }));
    await user.click(screen.getByRole('button', { name: /Qarorni chiqarish/ }));

    await waitFor(() => {
      const call = authFetch.mock.calls.find((c) => String(c[0]).includes('/decide'));
      expect(call).toBeDefined();
      const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
      expect(body.decision).toBe('CLOSED_NO_ACTION');
      // Backend `sanctionUntil` ni sanksiyasiz qarorda 422 bilan rad etadi.
      expect('sanctionUntil' in body).toBe(false);
    });
  });

  it('qaror chiqarilgan ish — forma umuman KO`RSATILMAYDI (bir marta)', async () => {
    await renderPage({
      ...OPEN_CASE,
      case: {
        ...OPEN_CASE.case,
        status: 'CLOSED_WARNING',
        decisionRationale: 'Ogohlantirish berildi.',
        reviewedAt: '2026-09-01T12:00:00.000Z',
      },
    });

    expect(screen.queryByRole('button', { name: /Qarorni chiqarish/ })).toBeNull();
    expect(screen.getByText(/Qaror BIR MARTA chiqariladi/)).toBeTruthy();
  });

  it('skor "ehtimollik, isbot emas" eslatmasi doim ko`rinadi', async () => {
    await renderPage();
    expect(screen.getByText(/ehtimollik, isbot emas/)).toBeTruthy();
  });
});
