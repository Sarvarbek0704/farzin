import { expect, test, type Page } from '@playwright/test';

/**
 * DO'STLAR OQIMI — brauzerdan brauzergacha.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU ZANJIR ALOHIDA TEKSHIRILADI
 *
 *  Har bo'g'in o'z qatlamida sinalgan: qoidalar (sof unit), API
 *  (integration, 32 test), sahifa (komponent testi). Lekin ZANJIR —
 *  qidiruv → so'rov → ikkinchi brauzerda qabul → chaqiriq → ikkala
 *  brauzer o'yinda — faqat shu yerda tekshiriladi.
 *
 *  Aynan shu zanjirda backend bo'shlig'i topilgan edi: chaqiriq
 *  o'yinni yaratardi, lekin RAQIBGA xabar bermasdi. Endi
 *  `play.service.createFriendChallenge` matchmaking bilan bir xil
 *  hodisani yuboradi va bu test uni qo'riqlaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Backend KERAK. Yo'q bo'lsa test SKIP bo'ladi — yashil emas.
 */

const API = process.env.FARZIN_API_URL ?? 'http://localhost:3000';
const PASSWORD = 'farzin-dev-2026';
const PLAYER_A = 'oyinchi1@farzin.local';
const PLAYER_B = 'oyinchi2@farzin.local';

/**
 * B ning familiyasi (seed: oyinchi2 = Javokhir Sindarov).
 *
 * ANIQ familiya ataylab: umumiy so'z A ning O'ZINI ham topib berardi
 * va test "birinchi natija" deb o'ziga so'rov yuborishga urinardi.
 */
const SEARCH_TERM = 'Sindarov';

async function backendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health/live`);
    return res.ok;
  } catch {
    return false;
  }
}

async function tokenFor(email: string): Promise<string | null> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { accessToken?: string };
  return body.accessToken ?? null;
}

/**
 * Oldingi yurishdan qolgan aloqani tozalash.
 *
 * Testlar TAKRORLANADI va do'stlik DB'da qoladi: tozalanmasa ikkinchi
 * yurishda "allaqachon do'stsiz" chiqib, so'rov yuborish qadami
 * yiqilardi. Bloklarni ham tozalaymiz — ular so'rovni butunlay
 * to'sib qo'yadi.
 */
async function clearFriendship(email: string): Promise<void> {
  const token = await tokenFor(email);
  if (token === null) {
    return;
  }
  const auth = { Authorization: `Bearer ${token}` };

  for (const path of ['/api/v1/friends', '/api/v1/friends/requests']) {
    const res = await fetch(`${API}${path}`, { headers: auth });
    if (!res.ok) {
      continue;
    }
    const rows = (await res.json()) as { friendshipId: string }[];
    for (const row of rows) {
      await fetch(`${API}/api/v1/friends/${row.friendshipId}`, { method: 'DELETE', headers: auth });
    }
  }

  const blocks = await fetch(`${API}/api/v1/friends/blocks`, { headers: auth });
  if (blocks.ok) {
    const rows = (await blocks.json()) as { friendshipId: string }[];
    for (const row of rows) {
      await fetch(`${API}/api/v1/friends/blocks/${row.friendshipId}`, {
        method: 'DELETE',
        headers: auth,
      });
    }
  }
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/konsol/kirish');
  await page.getByLabel(/Email/i).fill(email);
  // exact MAJBURIY: ko`rsatish/yashirish tugmasining aria-label`i ham
  // "Parol" bilan boshlanadi va regexp ikkalasini tutib olardi.
  await page.getByLabel('Parol', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /Kirish/ }).click();
  await expect(page).toHaveURL(/\/konsol$/, { timeout: 15_000 });
}

test.describe('do`stlar oqimi', () => {
  let backendReady = false;

  test.beforeAll(async () => {
    backendReady = await backendUp();
  });

  test.beforeEach(async () => {
    test.skip(!backendReady, 'backend ishlamayapti — oqim tekshirilmaydi');
    await clearFriendship(PLAYER_A);
    await clearFriendship(PLAYER_B);
  });

  test('anonim ko`ruvchiga ro`yxat ko`rsatilmaydi', async ({ page }) => {
    await page.goto('/oyin/dostlar');
    await expect(page.getByText(/shaxsiy/i)).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  });

  test('qidiruv → so`rov → qabul → chaqiriq → ikkala brauzer o`yinda', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      await signIn(pageA, PLAYER_A);
      await signIn(pageB, PLAYER_B);

      // --- A: qidiruv va so'rov -----------------------------------------
      await pageA.goto('/oyin/dostlar');
      await pageA.getByRole('searchbox').fill(SEARCH_TERM);

      // Debounce 300 ms — natija qatorini KUTAMIZ, uxlamaymiz.
      const sendButtons = pageA.getByRole('button', { name: /So.rov yuborish/ });
      await expect(sendButtons.first()).toBeVisible({ timeout: 15_000 });
      await sendButtons.first().click();
      await expect(pageA.getByText(/So.rov yuborildi/)).toBeVisible({ timeout: 15_000 });

      // --- B: kelgan so'rovni qabul qiladi ------------------------------
      await pageB.goto('/oyin/dostlar');
      await pageB.getByRole('tab', { name: /So.rovlar/ }).click();
      await expect(pageB.getByText(/Sizga kelgan/)).toBeVisible({ timeout: 15_000 });
      await pageB.getByRole('button', { name: /Qabul qilish/ }).click();

      // Qabuldan keyin so'rovlar bo'shaydi, do'stlar ro'yxati to'ladi.
      await pageB.getByRole('tab', { name: /Do.stlarim/ }).click();
      await expect(pageB.getByRole('button', { name: /O.ynash/ }).first()).toBeVisible({
        timeout: 15_000,
      });

      // --- A: do'st ro'yxatda, chaqiriq yuboradi ------------------------
      await pageA.reload();
      const play = pageA.getByRole('button', { name: /O.ynash/ }).first();
      await expect(play).toBeVisible({ timeout: 15_000 });
      await play.click();

      await pageA.getByRole('button', { name: /^5\+0/ }).click();

      // A o'yin sahifasiga o'tadi (javobdagi gameId bilan).
      await expect(pageA).toHaveURL(/\/oyin\/[0-9a-f-]{36}$/, { timeout: 20_000 });
      await expect(pageA.locator('.board-frame')).toBeVisible();

      // ⚠️  ENG MUHIM DA'VO: B DO'STLAR sahifasida turibdi, navbat
      //     sahifasida EMAS — va shunda ham o'yinga tortiladi.
      //
      //     Ilgari `matchmaking:matched` tinglovchisi faqat `/oyin`
      //     sahifasida edi, ya'ni chaqirilgan o'yinchi o'yin
      //     ochilganini BILMASDI va soati ketaverardi. Endi soket
      //     ilova qobig'ida (lib/play-socket.tsx).
      await expect(pageB).toHaveURL(/\/oyin\/[0-9a-f-]{36}$/, { timeout: 20_000 });
      expect(new URL(pageB.url()).pathname).toBe(new URL(pageA.url()).pathname);
      await expect(pageB.locator('.board-frame')).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
