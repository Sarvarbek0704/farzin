import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Frontend lint — backend'dan ALOHIDA konfiguratsiya
 * (backend `eslint.config.mjs` faqat `{src,test}` ni ko'radi).
 *
 * ⚠️  `eslint-config-next` ATAYLAB ISHLATILMAYDI: u
 *     `@rushstack/eslint-patch` orqali ESLint'ni "yamaydi" va ESLint 9
 *     bilan yiqiladi ("Failed to patch ESLint because the calling module
 *     was not recognized"). Uning asosiy qiymati — eskirgan `next lint`
 *     uchun; `next build` o'zi allaqachon tip va React qoidalarini
 *     tekshiradi. Shuning uchun bu yerda sof typescript-eslint qoladi.
 */
export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Server Component'lar `async` bo'lishi NORMAL — React ularni
      // shunday kutadi (Next.js App Router).
      '@typescript-eslint/require-await': 'off',
    },
  },
);
