import { defineConfig } from '@playwright/test';

/**
 * E2E / tartib testlari — HAQIQIY brauzerda.
 *
 * Vitest'dan ALOHIDA turadi: vitest jsdom'da ishlaydi va u tartibni
 * hisoblamaydi (har element 0x0). Piksel bo'yicha da'volar — nishon
 * o'lchami, gorizontal surilish, taxtaning to'liq kengligi — faqat
 * shu qatlamda tekshirilishi mumkin.
 *
 * `webServer` production build'ni ko'taradi: `next dev` boshqacha
 * chunk'lar va qo'shimcha overlay bilan keladi, ya'ni o'lchov
 * foydalanuvchi ko'radigan narsaga mos bo'lmasdi.
 *
 * ⚠️  Backend SHART EMAS: bu testlar tartibni tekshiradi. Ma'lumot
 *     kelmasa sahifa bo'sh holatni ko'rsatadi va tartib baribir
 *     o'lchanadi. Backendga bog'liq oqim testlari alohida (kelajakda).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? [['list']] : [['github'], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
  },
  webServer: {
    /*
     * `next start` — standalone serverning O'ZI EMAS.
     *
     * `output: 'standalone'` chiqishi node_modules'ni nusxalaydi va
     * pnpm'ning symlink'lari Windows'da ko'chmaydi:
     * `EPERM: operation not permitted, stat ... styled-jsx`.
     * Bu Linux konteynerda muammo emas (deploy shu yerda), lekin
     * mahalliy tekshiruvni to'sib qo'yardi.
     *
     * Tartib o'lchovi uchun bu farq AHAMIYATSIZ: ikkala yo'l ham AYNI
     * `.next` build'ini beradi — bir xil CSS, bir xil klient bundle.
     * Farq faqat serverni kim ko'tarishida.
     */
    command: 'npx next start -p 3210 -H 127.0.0.1',
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
});
