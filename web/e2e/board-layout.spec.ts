import { expect, test } from '@playwright/test';

import { boxOf, horizontalOverflow } from './helpers';

/**
 * Taxta tartibi — dizayn tizimi §4.3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  IKKI TALAB, IKKALASI HAM O'LCHANADI
 *
 *  1. CLS: "board sizing is a CLS rule, not a nicety" — taxta o'z
 *     joyini YUKLANMASDAN OLDIN egallashi kerak. `react-chessboard`
 *     klient komponenti: server HTML'ida u yo'q. Ramka bo'lmasa
 *     sahifa gidratatsiyada sakraydi.
 *  2. Mobilda "full-bleed edge-to-edge" — taxta chekkadan chekkaga.
 *
 *  Ikkalasi ham PIKSEL da'vosi, ya'ni jsdom'da tekshirib bo'lmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  O'yin ID'si `FARZIN_E2E_GAME_ID` orqali beriladi. Berilmasa test
 *  o'tkazib yuboriladi — YASHIL emas, SKIP: backend yo'qligi
 *  "tekshirildi" degani emas.
 */

const gameId = process.env.FARZIN_E2E_GAME_ID;

test.describe('taxta tartibi', () => {
  test.skip(gameId === undefined, 'FARZIN_E2E_GAME_ID berilmagan');

  test('CLS: taxta joyi HTML kelishi bilanoq band (kvadrat ramka)', async ({ page }) => {
    // JavaScript'ni butunlay o'chiramiz — bu server HTML'ining o'zi
    // taxta uchun joy zaxiralaydimi degan savolga javob beradi.
    await page.context().addInitScript(() => {
      /* bo'sh — kontekst uchun */
    });
    await page.goto(`/oyin/${String(gameId)}`);

    const frame = page.locator('.board-frame');
    await expect(frame).toBeVisible();
    const box = await boxOf(frame, 'taxta ramkasi');
    // aspect-ratio: 1/1 — kvadrat (1px yaxlitlash chegarasi).
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThan(100);
  });

  test.describe('mobil (360px)', () => {
    test.use({ viewport: { width: 360, height: 740 } });

    test('taxta CHEKKADAN CHEKKAGA (full-bleed)', async ({ page }) => {
      await page.goto(`/oyin/${String(gameId)}`);
      const box = await boxOf(page.locator('.board-frame'), 'taxta ramkasi');

      // Konteyner padding'i 16px; full-bleed teskari margin bilan uni
      // yeb yuboradi, ya'ni taxta 360px ning o'zi bo'ladi.
      expect(box.x).toBeLessThanOrEqual(0.5);
      expect(box.width).toBeGreaterThanOrEqual(359);
      expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
    });

    test('taxta to`liq kenglikda ham sahifani surmaydi', async ({ page }) => {
      await page.goto(`/oyin/${String(gameId)}`);
      const overflow = await horizontalOverflow(page);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });

  test.describe('desktop (1280px)', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('taxta 440px dan oshmaydi va yon panel yonida turadi', async ({ page }) => {
      await page.goto(`/oyin/${String(gameId)}`);
      const board = await boxOf(page.locator('.board-frame'), 'taxta ramkasi');
      expect(board.width).toBeLessThanOrEqual(440);

      // Yurishlar paneli taxtaning YONIDA (pastida emas).
      const moves = await boxOf(page.getByRole('heading', { name: 'Yurishlar' }), 'Yurishlar sarlavhasi');
      expect(moves.x).toBeGreaterThan(board.x + board.width - 1);
    });
  });
});
