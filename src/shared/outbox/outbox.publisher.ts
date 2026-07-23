import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, Interval } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { backoffDelayMs } from './outbox.service';

/** Poll oralig'i — ADR-0008: 500ms. Kechikish shu chegarada. */
const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 100;

/** Shundan ko'p urinish → FAILED (alert nomzodi, qo'lda ko'riladi). */
const MAX_ATTEMPTS = 10;

/** PUBLISHED event'lar 7 kundan keyin o'chiriladi (ADR-0008). */
const RETENTION_DAYS = 7;

/**
 * PostgreSQL advisory lock kaliti — bir vaqtda FAQAT BITTA publisher.
 * ADR-0008: bir nechta worker parallel ishlasa tartib buziladi.
 * API va worker processlarning ikkalasida ham poller bor, lekin lock
 * tufayli har tick'da faqat bittasi ishlaydi.
 */
const ADVISORY_LOCK_KEY = 0x0fa1_2b0c;

/**
 * Transactional outbox — o'qish/publish tomoni (ADR-0008).
 *
 * PENDING event'larni yaratilish tartibida (UUID v7 → ORDER BY id) o'qiydi,
 * EventEmitter2 orqali publish qiladi, PUBLISHED deb belgilaydi.
 * Xato bo'lsa — eksponensial backoff bilan qayta uriniladi.
 */
@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Advisory xact lock — tranzaksiya tugashi bilan avtomatik bo'shaydi.
        const [lock] = await tx.$queryRaw<[{ locked: boolean }]>`
          SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) AS locked
        `;
        if (!lock.locked) {
          return; // Boshqa instance ishlayapti — bu tick o'tkazib yuboriladi
        }

        const events = await tx.outboxEvent.findMany({
          where: { status: 'PENDING', availableAt: { lte: new Date() } },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
        });

        for (const event of events) {
          try {
            // Handler'lar shu processda sinxron/async chaqiriladi.
            // ⚠️  HAR HANDLER IDEMPOTENT — at-least-once (ADR-0008).
            await this.eventEmitter.emitAsync(event.eventType, {
              eventId: event.id,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload,
            });
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'PUBLISHED', publishedAt: new Date() },
            });
          } catch (err) {
            const attempts = event.attempts + 1;
            const failed = attempts >= MAX_ATTEMPTS;
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: {
                attempts,
                lastError: err instanceof Error ? err.message : String(err),
                status: failed ? 'FAILED' : 'PENDING',
                availableAt: new Date(Date.now() + backoffDelayMs(attempts)),
              },
            });
            if (failed) {
              // FAILED — qo'lda aralashuv kerak. Alert nomzodi
              // (docs/15-observability.md §6.4).
              this.logger.error(
                { eventId: event.id, eventType: event.eventType, attempts },
                `Outbox event ${String(MAX_ATTEMPTS)} urinishdan keyin FAILED`,
              );
            }
          }
        }
      });
    } catch (err) {
      // Poll xatosi (masalan DB uzilishi) — keyingi tick qayta uriniladi.
      this.logger.warn({ err }, 'Outbox poll xatosi');
    }
  }

  /** PUBLISHED event'larni tozalash — jadval cheksiz o'smasin (ADR-0008). */
  @Cron('0 30 3 * * *') // har kuni 03:30
  async cleanup(): Promise<void> {
    const threshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.prisma.outboxEvent.deleteMany({
      where: { status: 'PUBLISHED', publishedAt: { lt: threshold } },
    });
    if (result.count > 0) {
      this.logger.log(`Outbox tozalandi: ${String(result.count)} ta eski PUBLISHED event`);
    }
  }
}
