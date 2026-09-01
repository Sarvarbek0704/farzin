import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { loadConfig, validateEnv } from './config/configuration';
import { AdminModule } from './modules/admin/admin.module';
import { ArbiterModule } from './modules/arbiter/arbiter.module';
import { BillingModule } from './modules/billing/billing.module';
import { FairplayModule } from './modules/fairplay/fairplay.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OrgModule } from './modules/org/org.module';
import { PlayModule } from './modules/play/play.module';
import { PlayerModule } from './modules/player/player.module';
import { RatingModule } from './modules/rating/rating.module';
import { TournamentModule } from './modules/tournament/tournament.module';
import { RbacGuard } from './modules/identity/rbac.port';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard';
import { AuditModule } from './shared/audit/audit.module';
import { ProblemDetailsFilter } from './shared/errors/problem-details.filter';
import { redactionConfig } from './shared/logging/redaction';
import { MetricsModule } from './shared/metrics/metrics.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { QueueModule } from './shared/queue/queue.module';
import { REDIS, RedisModule } from './shared/redis/redis.module';

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
        //     Ro'yxat shared/logging/redaction.ts da — u yerda HAQIQIY
        //     pino bilan test qilinadi (redaction.spec.ts).
        redact: redactionConfig(),
        autoLogging: {
          // Sog'liq probe'lari va Prometheus scrape'i (har 15s) log'ni
          // ko'mib tashlamasin — docs/15-observability.md §2.2.
          ignore: (req): boolean => {
            const url = req.url ?? '';
            return url.startsWith('/health') || url.startsWith('/metrics');
          },
        },
      },
    }),

    // --- Rate limiting (docs/04-api-spec.md §6) ---------------------------
    // Umumiy himoya chegarasi: 300 so'rov/min (autentifikatsiyalangan
    // foydalanuvchi normasi). Auth endpointlarining qat'iy limitlari
    // (login 5/15min, register 3/soat) SlidingWindowLimiter'da (Redis,
    // IP+email kaliti bilan) — docs/10-security.md §7.1. Bu yerda ikkinchi
    // "strict" throttler ATAYLAB YO'Q: nomlangan throttler'lar HAMMA
    // route'ga qo'llanadi va oddiy API'ni bo'g'ib qo'yadi (jonli testda
    // aniqlangan).
    //
    // ⚠️  SAQLASH JOYI — REDIS, in-memory EMAS (docs/AUDIT.md JIDDIY-6).
    //     In-memory bilan har instance O'Z hisoblagichiga ega bo'lardi va
    //     N replikada amaldagi limit N × 300 ga aylanardi — ya'ni himoya
    //     replikalar soniga qarab jimgina yumshardi.
    //
    //     Redis ulanishi QAYTA ISHLATILADI (RedisModule ning `REDIS`
    //     provayderi): ikkinchi ulanish ochish ortiqcha soket va ikkinchi
    //     nosozlik nuqtasi bo'lardi.
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),

    EventEmitterModule.forRoot({ global: true, verboseMemoryLeak: true }),
    ScheduleModule.forRoot(),

    // --- Umumiy infratuzilma ----------------------------------------------
    // Metrika ENG BIRINCHI: qolgan modullar MetricsService'ni inject
    // qiladi (@Global) va /metrics endpointi ular bilan birga tug'iladi.
    // docs/15-observability.md §3
    MetricsModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    OutboxModule,
    QueueModule,

    // --- Funksional modullar ----------------------------------------------
    HealthModule,
    IdentityModule,
    PlayerModule,
    OrgModule,
    AdminModule,
    TournamentModule,
    ArbiterModule,
    RatingModule,
    BillingModule,
    PlayModule,
    FairplayModule,
    NotificationModule,

    //
    // TODO(Faza 2): PairingModule     — Swiss Dutch  ← eng qiyin qism
    // TODO(Faza 7): SchoolModule      — B2G
    // TODO(Faza 8): BroadcastModule   — DGT, jonli tablo
    //
    // TODO: TrainingModule, AnalyticsModule
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
