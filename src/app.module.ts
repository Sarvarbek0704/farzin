import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { loadConfig, validateEnv } from './config/configuration';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrgModule } from './modules/org/org.module';
import { PlayerModule } from './modules/player/player.module';
import { TournamentModule } from './modules/tournament/tournament.module';
import { RbacGuard } from './modules/identity/rbac.port';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard';
import { AuditModule } from './shared/audit/audit.module';
import { ProblemDetailsFilter } from './shared/errors/problem-details.filter';
import { OutboxModule } from './shared/outbox/outbox.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';

/**
 * Ildiz modul.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULAR MONOLITH — ADR-0001
 *
 *  Modul chegarasi niyat bilan emas, CI bilan saqlanadi:
 *    `pnpm arch:check` (.dependency-cruiser.js)
 *
 *  Qoidalar:
 *   - core/ sof TypeScript — NestJS ham, Prisma ham bilmaydi
 *   - Modul boshqa modulning service'iga to'g'ridan-to'g'ri murojaat qilmaydi,
 *     faqat *.port.ts orqali
 *   - Modul boshqa modulning jadvaliga so'rov yubormaydi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @see docs/02-architecture.md §5
 */
@Module({
  imports: [
    // --- Konfiguratsiya ---------------------------------------------------
    // Noto'g'ri env bilan ilova ISHGA TUSHMAYDI — xato erta chiqsin.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [loadConfig],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),

    // --- Correlation ID ---------------------------------------------------
    // Har so'rovga ID beriladi va har logda ko'rinadi.
    // Foydalanuvchi traceId aytadi → biz log'dan butun so'rovni topamiz.
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: { headers: Record<string, unknown> }): string =>
          (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
      },
    }),

    // --- Logging (docs/15-observability.md §2) ----------------------------
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Dev'da o'qish uchun chiroyli format; prod'da JSON (mashina o'qiydi).
        // (`exactOptionalPropertyTypes` sababli shartli spread — `undefined`
        //  ni ochiq uzatib bo'lmaydi.)
        ...(process.env.NODE_ENV === 'development'
          ? {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              },
            }
          : {}),
        // ⚠️  Sir hech qachon loglanmaydi. docs/10-security.md §8
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.passwordHash',
            'req.body.totpSecret',
            'req.body.refreshToken',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: {
          ignore: (req): boolean => (req.url ?? '').startsWith('/health'),
        },
      },
    }),

    // --- Rate limiting (docs/04-api-spec.md §6) ---------------------------
    // TODO(Faza 0): Redis storage qo'shish — hozircha in-memory,
    //               ya'ni ko'p instance'da limit har instance uchun alohida.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 300 },
      { name: 'strict', ttl: 900_000, limit: 5 },
    ]),

    EventEmitterModule.forRoot({ global: true, verboseMemoryLeak: true }),
    ScheduleModule.forRoot(),

    // --- Umumiy infratuzilma ----------------------------------------------
    PrismaModule,
    RedisModule,
    AuditModule,
    OutboxModule,

    // --- Funksional modullar ----------------------------------------------
    HealthModule,
    IdentityModule,
    PlayerModule,
    OrgModule,
    AdminModule,
    TournamentModule,

    //
    // TODO(Faza 1): ArbiterModule     — natija kiritish, apellyatsiya
    //
    // TODO(Faza 2): PairingModule     — Swiss Dutch  ← eng qiyin qism
    // TODO(Faza 3): RatingModule      — Glicko-2
    // TODO(Faza 4): BillingModule     — Click/Payme, ledger
    // TODO(Faza 5): PlayModule        — onlayn o'yin, WebSocket
    // TODO(Faza 6): FairPlayModule    — Stockfish tahlili
    // TODO(Faza 7): SchoolModule      — B2G
    // TODO(Faza 8): BroadcastModule   — DGT, jonli tablo
    //
    // TODO: NotificationModule, TrainingModule, AnalyticsModule
    //
    // To'liq reja: docs/14-roadmap.md
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Default YOPIQ: har endpoint token talab qiladi, @Public() dan tashqari.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // RBAC: @RequirePermission(...) gate + request.actor biriktirish.
    // Ruxsat yo'q → 404 (403 emas — resurs mavjudligi oshkor bo'lmasin).
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    // Hamma xato bitta formatda — RFC 9457. docs/04-api-spec.md §2.5
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
