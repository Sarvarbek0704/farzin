import type { Server } from 'node:http';

import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
  type ValidationError,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';

import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { REDIS } from '../../src/shared/redis/redis.module';
import { startContainers, stopContainers } from './containers';

/**
 * To'liq ilova harness'i — TO'LIQ AppModule real PostgreSQL/Redis bilan.
 *
 * Mock siyosati (docs/13-testing-strategy.md): PostgreSQL, Redis va o'z
 * modullarimiz mock qilinmaydi — faqat tashqi tarmoq chegaralari (bu
 * suite'da bunday chegara yo'q).
 *
 * MUHIM: global pipe/middleware'lar src/main.ts bilan AYNAN bir xil
 * bo'lishi shart — aks holda test boshqa ilovani sinaydi. main.ts
 * o'zgartirilsa, bu fayl ham sinxron yangilansin.
 */
export interface TestApp {
  app: INestApplication;
  /** supertest uchun HTTP server */
  server: Server;
  prisma: PrismaService;
  redis: Redis;
  /** Ilova + konteynerlarni to'xtatish (afterAll'da chaqiriladi). */
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const infra = await startContainers();

  // ⚠️  ENV MODUL GRAFI YUKLANISHIDAN OLDIN: AppModule import qilinganda
  //     ConfigModule.forRoot validatsiyasi DARHOL ishlaydi (dekorator
  //     bahosi paytida). Shuning uchun AppModule quyida DINAMIK import
  //     qilinadi — env allaqachon to'liq bo'lganda.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_HOST = infra.redisHost;
  process.env.REDIS_PORT = String(infra.redisPort);
  process.env.REDIS_DB = '0';
  // ≥32 belgi va bir-biridan FARQLI (configuration.ts semantik tekshiruvi).
  process.env.JWT_ACCESS_SECRET = 'farzin-test-access-secret-0123456789-abcdefgh';
  process.env.JWT_REFRESH_SECRET = 'farzin-test-refresh-secret-9876543210-hgfedcba';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
  // EMAIL kanali testda O'CHIQ (bo'sh SMTP_HOST → mail=null): .env'dagi
  // lokal mailpit sozlamasi harness'ga sizib kirmasin — SMTP yetkazish
  // jsonTransport bilan unit darajada sinaladi (email.channel.spec.ts).
  process.env.SMTP_HOST = '';

  const { AppModule } = await import('../../src/app.module');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  // --- src/main.ts bilan bir xil global sozlash ----------------------------
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Xavfsizlik (docs/10-security.md §11) — test NODE_ENV'da prod emas:
  // main.ts kabi CSP o'chirilgan holat.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cookieParser());

  // API shakli (docs/04-api-spec.md §2.1)
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/live', 'health/ready', 'metrics'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validatsiya (docs/10-security.md §6, docs/04-api-spec.md §2.5) —
  // src/main.ts dagi exceptionFactory AYNAN takrorlanadi.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      disableErrorMessages: false,
      exceptionFactory: (validationErrors: ValidationError[]): BadRequestException =>
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          errors: validationErrors.flatMap((e) =>
            Object.entries(e.constraints ?? {}).map(([constraint, message]) => ({
              field: e.property,
              code: constraint.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
              message,
            })),
          ),
        }),
    }),
  );

  await app.init();

  const server: Server = app.getHttpServer();
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS);

  return {
    app,
    server,
    prisma,
    redis,
    close: async (): Promise<void> => {
      await app.close();
      await stopContainers();
    },
  };
}
