import { execSync } from 'node:child_process';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

/**
 * Testcontainers infratuzilmasi — REAL PostgreSQL 17 + Redis 7.
 *
 * Nega mock emas: mock DB constraint, tranzaksiya va tip xatolarini
 * KO'RSATMAYDI — u faqat taxminlarimizni tasdiqlaydi
 * (docs/13-testing-strategy.md §3.1). Mock siyosati: PostgreSQL/Redis/
 * o'z modullarimiz HECH QACHON mock qilinmaydi.
 *
 * Hayot sikli: konteynerlar har test FAYLI uchun bir marta ko'tariladi
 * (jest --runInBand fayllarni ketma-ket yuritadi — konteyner bo'roni yo'q)
 * va faylning afterAll'ida to'xtatiladi. Izolyatsiya fayl ichida
 * `truncateAll` + `flushall` bilan (docs/13-testing-strategy.md §3.3 —
 * TRUNCATE varianti: bu suite HTTP orqali to'liq oqimlarni sinaydi,
 * rollback usuli ichma-ich $transaction'lar bilan to'g'ri kelmaydi).
 */
export interface TestInfra {
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  /** Prisma uchun to'liq ulanish URI'si */
  databaseUrl: string;
  redisHost: string;
  redisPort: number;
}

let infra: TestInfra | null = null;

export async function startContainers(): Promise<TestInfra> {
  if (infra !== null) {
    return infra;
  }

  const [postgres, redis] = await Promise.all([
    // Versiya PRODUCTION bilan bir xil — PostgreSQL 17 (docs/13 §3.2:
    // "Boshqa versiyada test qilish = boshqa DB'ni test qilish").
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('farzin_test')
      .withUsername('farzin')
      .withPassword('test')
      // Testda chidamlilik kerak emas — tezlik kerak.
      .withCommand(['postgres', '-c', 'fsync=off', '-c', 'full_page_writes=off'])
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const databaseUrl = postgres.getConnectionUri();

  // Migratsiyalar REAL holda qo'llanadi — `db push` EMAS: migration
  // fayllarining o'zi ham test qilinishi kerak (docs/13-testing-strategy.md
  // §3.2, docs/11-infrastructure.md §6.4).
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  infra = {
    postgres,
    redis,
    databaseUrl,
    redisHost: redis.getHost(),
    redisPort: redis.getMappedPort(6379),
  };
  return infra;
}

export async function stopContainers(): Promise<void> {
  if (infra === null) {
    return;
  }
  const current = infra;
  infra = null;
  await Promise.all([current.postgres.stop(), current.redis.stop()]);
}
