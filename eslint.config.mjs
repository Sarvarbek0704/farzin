// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js', '**/*.mjs'],
  },

  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- NestJS bilan moslik ---------------------------------------------
      // Dekoratorlar `any` qaytaradi — bu framework tabiati.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',

      // --- Tip xavfsizligi: qat'iy -----------------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // --- Async: eng ko'p xato shu yerda -----------------------------------
      // Kutilmagan Promise — jimgina yo'qolgan xato.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],

      // --- Aniqlik ----------------------------------------------------------
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // --- Umumiy -----------------------------------------------------------
      // Logging Pino orqali — console emas. docs/15-observability.md §2
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
    },
  },

  // --- PUL: Float taqiqlanadi (ADR-0006) ------------------------------------
  {
    files: ['src/modules/billing/**/*.ts', 'src/core/money/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSTypeAnnotation > TSNumberKeyword[parent.parent.key.name=/[Aa]mount|[Pp]rice|[Ff]ee|[Bb]alance/]",
          message:
            "Pul HECH QACHON `number` bo'lmaydi. `bigint` ishlating (tiyinda). " +
            'docs/adr/0006-money-as-bigint-tiyin.md',
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message:
            "Pul bilan ishlashda parseFloat taqiqlanadi. docs/adr/0006-money-as-bigint-tiyin.md",
        },
      ],
    },
  },

  // --- Testlar: biroz yumshoqroq ---------------------------------------------
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // --- Seed va skriptlar -----------------------------------------------------
  {
    files: ['prisma/seed.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
