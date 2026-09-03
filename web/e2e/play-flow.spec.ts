import { expect, test, type Page } from '@playwright/test';

/**
 * O'YIN OQIMI — brauzerdan brauzergacha.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU TEST NIMANI QO'RIQLAYDI
 *
 *  Oqimning har bo'g'ini alohida tekshirilgan (unit, komponent,
 *  integratsiya), lekin ULARNING ZANJIRI emas. Aynan zanjirda ikki
 *  xato topilgandi: sahifa tokenni umuman uzatmasdi va `game:join`
 *  javobi ack orqali kelishi e'tibordan chetda qolgandi.
 *
 *  Bu yerda ikki HAQIQIY brauzer bir-biriga qarshi o'ynaydi:
 *   A navbatga turadi → B qo'shiladi → server juftlashtiradi →
 *   A ning sahifasi PUSH bilan o'yinga o'tadi.
 *
 *  Uchinchi kontekst — ANONIM tomoshabin: u shu o'yinni ko'radi,
 *  lekin boshqara olmaydi (K-18).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Backend KERAK. Yo'q bo'lsa test SKIP bo'ladi — yashil emas.
 */

const API = process.env.FARZIN_API_URL ?? 'http://localhost:3000';
const PASSWORD = 'farzin-dev-2026';
const PLAYER_A = 'oyinchi1@farzin.local';
const PLAYER_B = 'oyinchi2@farzin.local';

/** Preset tugmasi: 5+0 — increment yo'q, ya'ni SUDDEN_DEATH blits. */
const PRESET = /^5\+0/;

async function backendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health/live`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Navbatda qolgan yozuvni tozalash — oldingi yurish testidan qolishi mumkin. */
async function clearQueue(email: string): Promise<void> {
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await login.json()) as { accessToken?: string };
  if (body.accessToken === undefined) {
    return;
  }
  await fetch(`${API}/api/v1/play/matchmaking/leave`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${body.accessToken}` },
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/konsol/kirish');
  await page.getByLabel(/Email/i).fill(email);
  // exact MAJBURIY: ko`rsatish/yashirish tugmasining aria-label`i ham
  // "Parol" bilan boshlanadi va regexp ikkalasini tutib olardi.
  await page.getByLabel('Parol', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /Kirish/ }).click();
  // Kirish muvaffaqiyatli bo'lsa konsolga o'tadi.
  await expect(page).toHaveURL(/\/konsol$/, { timeout: 15_000 });
}

test.describe('o`yin oqimi (ikki brauzer)', () => {
  // `test.skip(condition)` describe darajasida SINXRON shart kutadi,
  // backend holati esa so'rov talab qiladi — shuning uchun bayroq
  // `beforeAll` da hisoblanadi va har test uni tekshiradi.
  let backendReady = false;

  test.beforeAll(async () => {
    backendReady = await backendUp();
  });

  test.beforeEach(async () => {
    test.skip(!backendReady, 'backend ishlamayapti — oqim tekshirilmaydi');
    await clearQueue(PLAYER_A);
    await clearQueue(PLAYER_B);
  });

  test('anonim ko`ruvchiga o`ynash taklif qilinmaydi', async ({ page }) => {
    await page.goto('/oyin');
    await expect(page.getByText(/kirish kerak/i)).toBeVisible();
    await expect(page.getByRole('button', { name: PRESET })).toHaveCount(0);
  });

  test('navbat → juftlik → o`yin sahifasi (PUSH bilan)', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      await signIn(pageA, PLAYER_A);
      await signIn(pageB, PLAYER_B);

      // A navbatga turadi va NAVBATDA QOLADI (raqib hali yo'q).
      await pageA.goto('/oyin');
      await pageA.getByRole('button', { name: PRESET }).click();
      await expect(pageA.getByRole('button', { name: /Navbatdan chiqish/ })).toBeVisible({
        timeout: 15_000,
      });

      // B qo'shiladi — server DARHOL juftlashtiradi.
      await pageB.goto('/oyin');
      await pageB.getByRole('button', { name: PRESET }).click();

      // B `matched` javobini oladi va o'zi o'tadi; A esa PUSH bilan.
      await expect(pageB).toHaveURL(/\/oyin\/[0-9a-f-]{36}$/, { timeout: 20_000 });
      await expect(pageA).toHaveURL(/\/oyin\/[0-9a-f-]{36}$/, { timeout: 20_000 });

      // Ikkalasi ham AYNI o'yinda.
      expect(new URL(pageA.url()).pathname).toBe(new URL(pageB.url()).pathname);

      // Taxta ikkalasida ham chizilgan va JONLI ulanish bor.
      for (const p of [pageA, pageB]) {
        await expect(p.locator('.board-frame')).toBeVisible();
        await expect(p.getByText(/Jonli/)).toBeVisible({ timeout: 15_000 });
      }

      // O'yinchiga boshqaruv tugmalari ko'rinadi.
      await expect(pageA.getByRole('button', { name: /Taslim/ })).toBeVisible();

      // --- ANONIM TOMOSHABIN (K-18) ------------------------------------
      const ctxAnon = await browser.newContext();
      const anon = await ctxAnon.newPage();
      try {
        await anon.goto(new URL(pageA.url()).pathname);
        await expect(anon.locator('.board-frame')).toBeVisible();
        // Tokensiz ham JONLI ulanadi.
        await expect(anon.getByText(/Jonli/)).toBeVisible({ timeout: 15_000 });
        // Lekin o'yinni boshqara olmaydi.
        await expect(anon.getByRole('button', { name: /Taslim/ })).toHaveCount(0);
      } finally {
        await ctxAnon.close();
      }
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('navbatdan chiqish — holat qaytadi', async ({ page }) => {
    await signIn(page, PLAYER_A);
    await page.goto('/oyin');

    await page.getByRole('button', { name: PRESET }).click();
    const leave = page.getByRole('button', { name: /Navbatdan chiqish/ });
    await expect(leave).toBeVisible({ timeout: 15_000 });

    await leave.click();
    // Presetlar qaytadi — ya'ni yana navbatga turish mumkin.
    await expect(page.getByRole('button', { name: PRESET })).toBeVisible();
  });
});
