/**
 * Integration testlar uchun global sozlash.
 *
 * Bu testlar Testcontainers orqali REAL PostgreSQL va Redis ko'taradi.
 * Mock DB ishlatilmaydi — u yolg'on ishonch beradi: mock har doim
 * siz kutgan narsani qaytaradi, real DB esa constraint, tranzaksiya
 * va tip xatolarini ko'rsatadi.
 *
 * @see docs/13-testing-strategy.md §3
 */

// Konteyner ko'tarish (image yuklash + init) sekundlar oladi.
// Jest'ning default 5s timeout'i bu yerda yetarli emas.
jest.setTimeout(120_000);

// AppModule import bosqichida o'qiladigan env'lar (app.module.ts dekorator
// bahosi paytida): pino darajasi test chiqishini bosmasin. Konteyner
// manzillari (DATABASE_URL, REDIS_*) esa app.harness.ts da — konteyner
// ishga tushgach, AppModule DINAMIK import qilinishidan OLDIN beriladi.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
