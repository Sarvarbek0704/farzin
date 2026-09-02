import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Frontend testlari — Vitest.
 *
 * Backend jest ishlatadi; bu yerda alohida vosita, chunki `web/` mustaqil
 * paket (o'z package.json va lockfile). Vitest Next.js/ESM bilan
 * qo'shimcha transform konfiguratsiyasisiz ishlaydi.
 *
 * IKKI LOYIHA — muhit ataylab ajratilgan:
 *  - `logic` (`*.spec.ts`)  — sof funksiyalar, `node` muhiti. Tez va
 *    brauzer soxtalashtirilmagan holda ishlaydi.
 *  - `component` (`*.spec.tsx`) — React komponentlari, `jsdom`. DOM
 *    faqat shu yerda quriladi: barcha testlarni jsdom'da yuritish
 *    sof mantiq testlarini sekinlashtirardi va ular tasodifan
 *    brauzer API'lariga tayanib qolishi mumkin edi.
 */
export default defineConfig({
  test: {
    projects: [
      {
        // `extends` yo'q — bu yerda resolve/plugin sozlamasi kerak emas.
        test: {
          name: 'logic',
          environment: 'node',
          include: ['{lib,components,app}/**/*.spec.ts'],
        },
      },
      {
        // JSX'ni Next SWC emas, shu plagin o'giradi — vitest Next
        // quvuridan mustaqil ishlaydi.
        plugins: [react()],
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['{lib,components,app}/**/*.spec.tsx'],
          setupFiles: ['./test/setup.ts'],
        },
        resolve: {
          // `fileURLToPath` — Windows'da `new URL(...).pathname` boshida
          // ortiqcha `/` beradi (`/D:/...`) va yo'l hal bo'lmaydi.
          alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
        },
      },
    ],
  },
});
