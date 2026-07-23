import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { BusinessRuleError } from '../../core/errors/domain.error';

/**
 * Outbox talab qiladigan event'lar — RO'YXAT QAT'IY (ADR-0008).
 *
 * Mezon: event yo'qolsa pul, sport natijasi yoki odamning huquqi zarar
 * ko'radimi? Ha bo'lsa — outbox. Yo'q bo'lsa — oddiy EventEmitter2.
 * Hamma event'ni outbox'ga o'tkazish — keraksiz murakkablik va DB yuklamasi.
 */
export const OUTBOX_EVENT_TYPES = [
  'PaymentCompleted',
  'RefundIssued',
  'RoundCompleted',
  'RatingRecomputed',
  'FairPlayCaseOpened',
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

export interface OutboxEventInput {
  eventType: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  /** JSON payload. BigInt bo'lsa — string'ga aylantirib bering. */
  payload: Prisma.InputJsonValue;
}

/**
 * Transactional outbox — yozish tomoni (ADR-0008).
 *
 * Event biznes o'zgarishi bilan BIR TRANZAKSIYADA `outbox_events` ga
 * yoziladi — dual write problem hal:
 *
 *   await prisma.$transaction(async (tx) => {
 *     await tx.payment.update({ ... status: 'PAID' });
 *     await outbox.enqueue(tx, {
 *       eventType: 'PaymentCompleted',
 *       aggregateType: 'Payment',
 *       aggregateId: id,
 *       payload: { paymentId: id },
 *     });
 *   });
 *
 * ⚠️  Kafolat at-least-once — HAR HANDLER IDEMPOTENT BO'LISHI SHART.
 *     Bu tavsiya emas, arxitektura talabi (ADR-0008).
 */
@Injectable()
export class OutboxService {
  async enqueue(tx: Prisma.TransactionClient, event: OutboxEventInput): Promise<void> {
    if (!OUTBOX_EVENT_TYPES.includes(event.eventType)) {
      // Ro'yxat qat'iy: kritik bo'lmagan event outbox'ga TUSHMAYDI.
      throw new BusinessRuleError(
        'OUTBOX_EVENT_NOT_ALLOWED',
        `"${event.eventType}" outbox ro'yxatida yo'q — oddiy EventEmitter2 ishlating (ADR-0008)`,
      );
    }

    await tx.outboxEvent.create({
      data: {
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
      },
    });
  }
}

/**
 * Eksponensial backoff: 1s, 2s, 4s, ... maksimum 5 daqiqa.
 * Sof funksiya — unit test uchun eksport qilinadi.
 */
export function backoffDelayMs(attempts: number): number {
  const base = 1_000 * 2 ** Math.min(attempts, 10);
  return Math.min(base, 5 * 60 * 1_000);
}
