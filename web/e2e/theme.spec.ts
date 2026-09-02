import { expect, test } from '@playwright/test';

import { boxOf } from './helpers';

/**
 * IKKI TEMA — har ikkalasi ham tekshiriladi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU FAYL BOR
 *
 *  Playwright standart holatda YORUG' temada ochadi. Shu sababli qorong'i
 *  tema hech qachon ko'rilmagan va foydalanuvchi ekranida buzilgan holda
 *  chiqdi: kirish formasi sahifaning yuqori-chapiga yopishgan, Chrome
 *  avtoto'ldirishi esa maydonlarni ko'k-kulrang qilib bo'yagan edi.
 *
 *  Endi ikkala tema ham qamrab olinadi. "Chiroyli ko'rinadi" ni test
 *  o'lchay olmaydi, lekin quyidagilarni o'lchay OLADI:
 *   - tema haqiqatan qo'llanganmi (fon rangi);
 *   - kontent markazdami yoki burchakka yopishganmi;
 *   - maydonlar UMUMIY uslubdan foydalanadimi (qotirilgan rang emas).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `rgb(r, g, b)` dan yorug'lik (0..255). */
function luminance(color: string): number {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (m === null) {
    throw new Error(`rang o'qib bo'lmadi: ${color}`);
  }
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} tema`, () => {
    test.use({ colorScheme: scheme });

    test('sahifa foni temaga mos', async ({ page }) => {
      await page.goto('/');
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const lum = luminance(bg);
      if (scheme === 'dark') {
        expect(lum, `qorong'i temada fon qorong'i bo'lsin (${bg})`).toBeLessThan(80);
      } else {
        expect(lum, `yorug' temada fon yorug' bo'lsin (${bg})`).toBeGreaterThan(180);
      }
    });

    test('kirish formasi MARKAZDA — burchakka yopishmaydi', async ({ page }) => {
      await page.goto('/konsol/kirish');
      const form = await boxOf(page.locator('form.card'), 'kirish formasi');
      const viewport = page.viewportSize();
      if (viewport === null) {
        throw new Error('viewport aniqlanmadi');
      }

      // Gorizontal markaz: chap va o'ng bo'shliq farqi kichik bo'lsin.
      const left = form.x;
      const right = viewport.width - (form.x + form.width);
      expect(Math.abs(left - right), 'forma gorizontal markazda').toBeLessThan(24);

      // Forma ekranning yuqori chekkasiga yopishmasin.
      expect(form.y, 'formada yuqoridan bo`shliq bor').toBeGreaterThan(120);
    });

    test('maydonlar umumiy `.field` uslubidan foydalanadi', async ({ page }) => {
      await page.goto('/konsol/kirish');
      // `count()` KUTMAYDI — avval forma chizilishini kutish shart,
      // aks holda test sahifa tayyor bo'lgunicha 0 ko'radi.
      await expect(page.locator('form.card')).toBeVisible();
      const inputs = page.locator('form.card input');
      const count = await inputs.count();
      expect(count).toBe(2);

      for (let i = 0; i < count; i += 1) {
        await expect(inputs.nth(i)).toHaveClass(/field/);
        // Fon temadan kelib chiqadi, qotirilgan emas: qorong'ida
        // qorong'i, yorug'da yorug'.
        const bg = await inputs.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
        const lum = luminance(bg);
        if (scheme === 'dark') {
          expect(lum, `maydon foni qorong'i bo'lsin (${bg})`).toBeLessThan(90);
        } else {
          expect(lum, `maydon foni yorug' bo'lsin (${bg})`).toBeGreaterThan(170);
        }
      }
    });

    test('AVTOTO`LDIRISH qoidasi mavjud va rangni majburlaydi', async ({ page }) => {
      await page.goto('/konsol/kirish');
      // Chrome avtoto'ldirishini testda ishga tushirib bo'lmaydi (u
      // saqlangan parolni talab qiladi). Shuning uchun QOIDANING O'ZI
      // tekshiriladi: u yuklangan stil jadvalida bormi va ichki
      // box-shadow bilan fonni qoplaydimi.
      const rule = await page.evaluate(() => {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRule[];
          try {
            rules = Array.from(sheet.cssRules);
          } catch {
            continue; // cross-origin stylesheet
          }
          for (const r of rules) {
            const text = r.cssText;
            if (text.includes('-webkit-autofill') && text.includes('.field')) {
              return text;
            }
          }
        }
        return null;
      });

      expect(rule, 'avtoto`ldirish qoidasi topilmadi').not.toBeNull();
      expect(rule).toContain('inset');
      expect(rule).toContain('-webkit-text-fill-color');
    });
  });
}
