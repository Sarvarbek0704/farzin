import type { Config } from 'jest';

/**
 * Test konfiguratsiyasi.
 *
 * Ikki loyihaga bo'lingan:
 *  - unit        — sof mantiq, tashqi bog'liqliksiz. Tez (sekundlar).
 *  - integration — REAL PostgreSQL/Redis (Testcontainers). Sekin (daqiqalar).
 *
 * Nega ajratilgan: `pnpm test:unit` har saqlashda ishlashi mumkin.
 * Integration testlar CI'da va commit oldidan.
 *
 * @see docs/13-testing-strategy.md
 */
const config: Config = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      moduleNameMapper: {
        '^@core/(.*)$': '<rootDir>/src/core/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1',
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@config/(.*)$': '<rootDir>/src/config/$1',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      // Testcontainers konteyner ko'taradi — vaqt kerak.
      // Timeout setup faylida beriladi: Jest 29 `testTimeout` ni project
      // darajasida qabul qilmaydi, root'ga qo'ysak unit testlar ham
      // sekin yiqiladigan bo'lib qoladi.
      setupFilesAfterEnv: ['<rootDir>/test/integration/setup.ts'],
      moduleNameMapper: {
        '^@core/(.*)$': '<rootDir>/src/core/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1',
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@config/(.*)$': '<rootDir>/src/config/$1',
        '^@test/(.*)$': '<rootDir>/test/$1',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
      },
    },
  ],

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/worker.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.types.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage — VOSITA, maqsad emas. Bu chegaralar past sifatli testni
  // yozishga majburlash uchun emas, regressiyani ushlash uchun.
  //
  // core/ (pairing, Glicko-2, money) uchun chegara YUQORI, chunki u yerda
  // xato jimgina o'tadi va qimmatga tushadi.
  // docs/13-testing-strategy.md §10
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
    './src/core/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
