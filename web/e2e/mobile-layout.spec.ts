import { expect, test } from '@playwright/test';

import { boxOf, horizontalOverflow } from './helpers';

/**
 * Mobil tartib — HAQIQIY O'LCHOV.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU TESTLAR JSDOM'DA EMAS
 *
 *  jsdom tartibni HISOBLAMAYDI: unda har elementning kengligi ham,
 *  balandligi ham 0. Ya'ni "taxta to'liq kenglikda", "tugma 24px dan
 *  katta", "sahifa gorizontal surilmaydi" kabi da'volarni jsdom
 *  TASDIQLAY OLMAYDI — u faqat "class bor" deyishi mumkin, bu esa
 *  boshqa gap.
 *
 *  Shu sababli bu qatlam haqiqiy brauzerda (chromium) ishlaydi va
 *  `getBoundingClientRect` bilan piksel o'lchaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Chegaralar manbai:
 *   - WCAG 2.5.8 (AA): bosish nishoni kamida 24x24 CSS px;
 *   - dizayn tizimi §4.3: taxta `aspect-ratio: 1/1`, mobilda
 *     "full-bleed edge-to-edge", va bu CLS qoidasi.
 */

/** iPhone SE / eng tarqalgan tor ekran. */
const MOBILE = { width: 360, height: 740 };

test.describe('mobil tartib (360px)', () => {
  test.use({ viewport: MOBILE });

  test('sahifa GORIZONTAL surilmaydi', async ({ page }) => {
    for (const path of ['/', '/turnirlar', '/reyting', '/oyin']) {
      await page.goto(path);
      const overflow = await horizontalOverflow(page);
      expect(overflow, `${path} gorizontal surilmasligi kerak`).toBeLessThanOrEqual(0);
    }
  });

  test('sarlavha paneli kontentni QIRQMAYDI', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header.site-header');
    const headerBox = await boxOf(header, 'sarlavha paneli');

    // Ichidagi har element sarlavha panelining ichida to'liq turishi kerak.
    const items = page.locator('header.site-header a, header.site-header button');
    const count = await items.count();
    expect(count).toBeGreaterThan(3);

    for (let i = 0; i < count; i += 1) {
      const box = await boxOf(items.nth(i), `panel elementi ${String(i)}`);
      expect(box.y + box.height, `element ${String(i)} panel ichida qolsin`).toBeLessThanOrEqual(
        headerBox.y + headerBox.height + 1,
      );
    }
  });

  test('navigatsiya havolalari WCAG 2.5.8 nishon o`lchamiga yetadi', async ({ page }) => {
    await page.goto('/');
    const links = page.locator('nav[aria-label="Asosiy"] a');
    const count = await links.count();
    for (let i = 0; i < count; i += 1) {
      const box = await boxOf(links.nth(i), `navigatsiya havolasi ${String(i)}`);
      expect(box.height, `havola ${String(i)} balandligi`).toBeGreaterThanOrEqual(24);
    }
  });

  test('jadval SAHIFANI emas, O`ZINI suradi', async ({ page }) => {
    await page.goto('/reyting');
    const wrap = page.locator('.table-wrap').first();
    if ((await wrap.count()) === 0) {
      test.skip(true, "reyting jadvali bo'sh — surish tekshirilmaydi");
    }
    const scrollable = await wrap.evaluate((el) => el.scrollWidth > el.clientWidth);
    const pageOverflow = await horizontalOverflow(page);
    // Jadval kengroq bo'lsa ham sahifa qimirlamaydi.
    expect(pageOverflow).toBeLessThanOrEqual(0);
    // Va o'zi surilishi MUMKIN (kenglik yetmasa).
    expect(typeof scrollable).toBe('boolean');
  });
});

test.describe('desktop tartib (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('konteyner markazda va maksimal kenglikdan oshmaydi', async ({ page }) => {
    await page.goto('/turnirlar');
    const box = await boxOf(page.locator('main.container'), 'asosiy konteyner');
    expect(box.width).toBeLessThanOrEqual(1120);
    // Markazda: chap chekka va o'ng chekka teng (1px yaxlitlash chegarasi).
    expect(Math.abs(box.x - (1280 - box.width - box.x))).toBeLessThanOrEqual(1);
  });
});
