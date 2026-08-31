import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PLAY_GAME_FINISHED_EVENT, type PlayGameFinishedEvent } from '../../play/play.types';
import { NotificationRepository } from '../notification.repository';
import { NotificationService } from '../notification.service';
import type { OutboxEventEnvelope } from '../notification.types';

/**
 * Outbox event'lari → xabarnoma (docs/02-architecture.md §6.2:
 * "notification → o'yinchilarga xabar yuboradi").
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KONTRAKT (ADR-0008, outbox.publisher.ts bilan kelishuv):
 *
 *  - Kafolat AT-LEAST-ONCE — har handler IDEMPOTENT: dedupe kaliti
 *    (eventId, userId, templateKey), mexanizm notification.repository.ts
 *    createBatchIdempotent sarlavhasida.
 *
 *  - Handler'dan chiqqan xato publisher'ni YIQITMAYDI: poll() har event'ni
 *    o'z try/catch'ida ishlaydi. Throw = event PENDING qoladi va backoff
 *    bilan QAYTA keladi. Shuning uchun:
 *      · DB o'qish/yozish xatosi → ATAYLAB throw (retry foydali, dedupe
 *        takrordan himoya qiladi);
 *      · buzuq payload → warn + SKIP (retry BEFOYDA: payload o'zgarmaydi,
 *        10 urinishdan keyin baribir FAILED bo'lardi — shovqinsiz o'tamiz);
 *      · yetkazish xatosi service ichida yutiladi (markFailed) — event
 *        muvaffaqiyatli hisoblanadi.
 *
 *  - Qabul qiluvchilar OWN repository so'rovlari bilan aniqlanadi —
 *    kulrang zona o'qishlari (arbiter/rating pretsedenti) repository
 *    sarlavhasida hujjatlangan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class NotificationOutboxListeners {
  private readonly logger = new Logger(NotificationOutboxListeners.name);

  constructor(
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService,
  ) {}

  /**
   * RoundCompleted (arbiter.repository.ts payload: roundId, sectionId,
   * roundNumber) → seksiyaning tasdiqlangan o'yinchilariga "N-tur
   * yakunlandi" (docs/01 §3.1 oqimi). IN_APP + EMAIL.
   */
  @OnEvent('RoundCompleted')
  async onRoundCompleted(event: OutboxEventEnvelope): Promise<void> {
    const payload = asRecord(event.payload);
    const sectionId = str(payload, 'sectionId');
    const roundNumber = num(payload, 'roundNumber');
    if (sectionId === null || roundNumber === null) {
      this.warnBadPayload('RoundCompleted', event.eventId);
      return;
    }
    const [userIds, context] = await Promise.all([
      this.repo.confirmedSectionUserIds(sectionId),
      this.repo.sectionContext(sectionId),
    ]);
    await this.service.notifyUsers({
      eventId: event.eventId,
      templateKey: 'round.completed',
      payload: {
        roundNumber,
        sectionId,
        sectionName: context?.sectionName ?? '—',
        tournamentName: context?.tournamentName ?? '—',
      },
      userIds,
      channels: ['IN_APP', 'EMAIL'],
    });
  }

  /**
   * PaymentCompleted (billing.repository.ts payload: paymentId, invoiceId,
   * provider, amountTiyin, currency — userId YO'Q) → invoys egasiga.
   * Qabul qiluvchi invoysdan o'qiladi (repository.invoiceRecipient).
   */
  @OnEvent('PaymentCompleted')
  async onPaymentCompleted(event: OutboxEventEnvelope): Promise<void> {
    await this.notifyInvoiceOwner(event, 'payment.completed');
  }

  /** RefundIssued (payload + reason) → invoys egasiga, sabab bilan. */
  @OnEvent('RefundIssued')
  async onRefundIssued(event: OutboxEventEnvelope): Promise<void> {
    await this.notifyInvoiceOwner(event, 'refund.issued');
  }

  private async notifyInvoiceOwner(
    event: OutboxEventEnvelope,
    templateKey: 'payment.completed' | 'refund.issued',
  ): Promise<void> {
    const payload = asRecord(event.payload);
    const invoiceId = str(payload, 'invoiceId');
    if (invoiceId === null) {
      this.warnBadPayload(templateKey, event.eventId);
      return;
    }
    const invoice = await this.repo.invoiceRecipient(invoiceId);
    if (invoice === null) {
      return; // invoys o'chirilgan — xabar oluvchi yo'q
    }
    if (invoice.userId === null) {
      return; // tizim invoysi (egasiz) — xabar oluvchi yo'q
    }
    await this.service.notifyUsers({
      eventId: event.eventId,
      templateKey,
      payload: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amountTiyin: str(payload, 'amountTiyin') ?? '',
        currency: str(payload, 'currency') ?? '',
        ...(templateKey === 'refund.issued' && { reason: str(payload, 'reason') ?? '—' }),
      },
      userIds: [invoice.userId],
      channels: ['IN_APP', 'EMAIL'],
    });
  }

  /**
   * RatingRecomputed — ATAYLAB HECH KIMGA XABAR YO'Q (hujjatlangan qaror):
   * davr hisobi minglab o'yinchini qamrashi mumkin (payload
   * playersAffected) — ommaviy xabar shovqin va DB/SMTP bosimi; yangi
   * reyting ommaviy leaderboard'da ko'rinadi (docs/06 §5.3). Kelajakda
   * xohish bo'lsa: user-level opt-in sozlamasi bilan qaytariladi.
   * Handler baribir mavjud — event tinglanganini aniq qilish uchun.
   */
  @OnEvent('RatingRecomputed')
  onRatingRecomputed(event: OutboxEventEnvelope): void {
    this.logger.debug(
      `RatingRecomputed (${event.eventId}) — ommaviy xabar ATAYLAB yuborilmaydi (leaderboard yetarli)`,
    );
  }

  /**
   * FairPlayCaseOpened (fairplay.repository.ts payload: caseId, playerId)
   * → FAQAT SUPER_ADMIN'lar, FAQAT IN_APP (docs/08 §6.3 maxfiylik:
   * ishni komissiya va ayblanuvchining o'zi ko'radi; §4.1 3-band:
   * o'yinchi bu bosqichda HECH NARSA bilmaydi — unga xabar YO'Q; email
   * ham yo'q — tashqi pochta qutisiga maxfiy ish identifikatori chiqmasin).
   */
  @OnEvent('FairPlayCaseOpened')
  async onFairPlayCaseOpened(event: OutboxEventEnvelope): Promise<void> {
    const payload = asRecord(event.payload);
    const caseId = str(payload, 'caseId');
    if (caseId === null) {
      this.warnBadPayload('FairPlayCaseOpened', event.eventId);
      return;
    }
    const userIds = await this.repo.superAdminUserIds();
    await this.service.notifyUsers({
      eventId: event.eventId,
      templateKey: 'fairplay.case_opened',
      // playerId ATAYLAB payload'ga kirmaydi — minimal ma'lumot tamoyili;
      // admin ishni panelda ochib to'liq ko'radi.
      payload: { caseId },
      userIds,
      channels: ['IN_APP'],
    });
  }

  /**
   * game.finished — ODDIY EventEmitter2 (outbox EMAS, play.types.ts izohi),
   * ya'ni at-most-once va sinxron `emit()` bilan chiqadi. Shuning uchun bu
   * handler HAMMA xatoni o'zi yutadi: reject bo'lsa unhandled rejection
   * play oqimiga sizib chiqishi mumkin edi. FAQAT IN_APP.
   *
   * eventId sintetik (`game-finished:<gameId>`) — outbox eventId bilan bir
   * xil dedupe mexanizmidan o'tadi (gameId deterministik).
   */
  @OnEvent(PLAY_GAME_FINISHED_EVENT)
  async onGameFinished(event: PlayGameFinishedEvent): Promise<void> {
    try {
      if (event.status === 'ABORTED' || event.status === 'ABANDONED') {
        return; // o'ynalmagan o'yin — xabar shovqin bo'lardi
      }
      const userIds = await this.repo.userIdsForPlayers([event.whitePlayerId, event.blackPlayerId]);
      await this.service.notifyUsers({
        eventId: `game-finished:${event.gameId}`,
        templateKey: 'game.finished',
        payload: { gameId: event.gameId, status: event.status },
        userIds,
        channels: ['IN_APP'],
      });
    } catch (err) {
      this.logger.warn(
        `game.finished xabari yiqildi (game=${event.gameId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private warnBadPayload(eventType: string, eventId: string): void {
    this.logger.error(
      `${eventType} (${eventId}): payload kutilgan maydonlarsiz — xabar O'TKAZIB YUBORILDI (retry befoyda)`,
    );
  }
}

// --- Defensiv JSON parse yordamchilari -------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function num(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
