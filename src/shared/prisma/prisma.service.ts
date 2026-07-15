import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client.
 *
 * ⚠️  Bu servis FAQAT repository/infrastructure qatlamida ishlatiladi.
 *     Service qatlami repository interfeysini ishlatadi, PrismaService'ni emas.
 *     Bu qoida `.dependency-cruiser.js` da majburlanadi (`prisma-only-in-infrastructure`).
 *
 * @see docs/02-architecture.md §4
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL ulanishi tayyor');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Testlar uchun bazani tozalash.
   *
   * ⚠️  Production'da CHAQIRILMAYDI. Himoya sifatida NODE_ENV tekshiriladi.
   *
   * Integration testlar Testcontainers bilan real PostgreSQL ishlatadi
   * (docs/13-testing-strategy.md §3), va har test orasida baza tozalanishi kerak.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('truncateAll() production muhitida chaqirilishi MUMKIN EMAS');
    }

    const tables = await this.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;

    if (tables.length === 0) {
      return;
    }

    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}
