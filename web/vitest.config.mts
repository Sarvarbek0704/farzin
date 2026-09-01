import { defineConfig } from 'vitest/config';

/**
 * Frontend testlari — Vitest.
 *
 * Backend jest ishlatadi; bu yerda alohida vosita, chunki `web/` mustaqil
 * paket (o'z package.json va lockfile). Vitest Next.js/ESM bilan
 * qo'shimcha transform konfiguratsiyasisiz ishlaydi.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{lib,components,app}/**/*.spec.ts'],
  },
});
