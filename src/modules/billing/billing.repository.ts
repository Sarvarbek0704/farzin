import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type Invoice, type Payment, Prisma } from '@prisma/client';

import type { LedgerEntryInput } from '../../core/billing/ledger';
import { ConflictError, NotFoundError } from '../../core/errors/domain.error';
import { AuditService } from '../../shared/audit/audit.service';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type {
  InvoiceRow,
  PaymentProviderValue,
  PaymentRow,
  RegistrationBillingView,
} from './billing.types';
import { formatInvoiceNumber, nextInvoiceSequence } from './invoice-number';
import { assertPaymentTransition, assertRefundPath } from './payment-status.machine';

/**
 * Billing ma'lumot qatlami — Prisma FAQAT shu faylda
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`).
 *
 * MUHIM tamoyillar:
 *  - har pul o'zgarishi + ledger + audit + outbox — BIR $transaction
 *    (docs/09 §6.5: "paid payment and its ledger entries commit or fail
 *    together"; docs/10 §10: audit atomik);
 *  - `LedgerEntry` IMMUTABLE: faqat INSERT. Refund — teskari yozuv
 *    (docs/09 §6.1, §8.2);
 *  - holat o'tishlari compare-and-set (`updateMany` + `where: status`) —
 *    ikkita parallel worker'dan faqat bittasi ledger yozadi
 *    (docs/09 §5.3).
 *
 * Registration/Tournament jadvallariga murojaat haqida:
 * `Registration.invoiceId` — schema darajasida belgilangan billing ↔
 * tournament shartnomasi (prisma/schema.prisma haqiqat manbai). Billing
 * bu bog'ni O'QIYDI va to'lov tasdig'ida `isConfirmed`ni yangilaydi —
 * bu docs/09 §7.3 oqimining billing tomonidagi mas'uliyati. Boshqa
 * hech qanday tournament ma'lumoti bu yerdan YOZILMAYDI.
 */

/** P2002 — unique constraint buzilishi (retry / idempotency signali). */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export interface CreateInvoiceInput {
  userId: string;
  tournamentId: string;
  registrationId: string;
  /** TIYINDA (ADR-0006). */
  subtotalTiyin: bigint;
  taxTiyin: bigint;
  totalTiyin: bigint;
  currency: string;
  actorUserId: string;
}

export interface CreatePaymentInput {
  invoiceId: string;
  provider: PaymentProviderValue;
  /** TIYINDA (ADR-0006). */
  amountTiyin: bigint;
  currency: string;
  idempotencyKey: string;
  actorUserId: string;
}

export interface ApplyPaymentSuccessInput {
  paymentId: string;
  /** null = tizim (webhook) — audit actorUserId NULL bo'ladi. */
  actorUserId: string | null;
  /** Balanslangan to'plam — core buildLedgerTransaction dan o'tgan. */
  entries: readonly LedgerEntryInput[];
  /** Webhook yo'lida provayder ma'lumotlari birga saqlanadi. */
  providerTransactionId?: string;
  /** Xom provayder payload — nizo dalili (repo Prisma Json ga keltiradi). */
  providerPayload?: unknown;
  reason?: string;
}

export interface ApplyRefundInput {
  paymentId: string;
  actorUserId: string;
  /** MAJBURIY — audit 'refund.requested' sababsiz rad etiladi. */
  reason: string;
  /** Teskari (reversing) balanslangan to'plam. */
  entries: readonly LedgerEntryInput[];
}

export interface LedgerAccountSums {
  account: string;
  debitTiyin: bigint;
  creditTiyin: bigint;
}

@Injectable()
export class BillingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // --- Invoice ---------------------------------------------------------------

  /**
   * Invoys yaratish + ro'yxatga bog'lash — BIR tranzaksiyada.
   *
   * Raqam generatsiyasi: 'FRZ-YYYY-NNNNNN', yil ichida ketma-ket.
   * Tranzaksiya ichida SELECT max + 1; parallel yaratishda ikkalasi bir
   * raqamni olishi mumkin — `Invoice.number @unique` yutqazganni P2002
   * bilan yiqitadi va bu metod QAYTA URINADI (3 martagacha). SELECT ...
   * FOR UPDATE o'rniga retry tanlandi: invoys yaratish kam chastotali,
   * qulf esa butun jadval bo'ylab kutish nuqtasi bo'lardi.
   */
  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceRow> {
    const MAX_ATTEMPTS = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const year = new Date().getFullYear();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.invoice.findFirst({
            where: { number: { startsWith: `FRZ-${String(year)}-` } },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          const number = formatInvoiceNumber(year, nextInvoiceSequence(last?.number ?? null));

          const created = await tx.invoice.create({
            data: {
              number,
              userId: input.userId,
              tournamentId: input.tournamentId,
              subtotalAmount: input.subtotalTiyin,
              taxAmount: input.taxTiyin,
              totalAmount: input.totalTiyin,
              currency: input.currency,
              status: 'CREATED',
            },
          });

          await tx.registration.update({
            where: { id: input.registrationId },
            data: { invoiceId: created.id },
          });

          await this.audit.write(tx, {
            action: 'invoice.created',
            actorUserId: input.actorUserId,
            resourceType: 'Invoice',
            resourceId: created.id,
            after: {
              number: created.number,
              registrationId: input.registrationId,
              tournamentId: input.tournamentId,
              totalAmount: input.totalTiyin.toString(),
              currency: input.currency,
            },
          });

          return toInvoiceRow(created);
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          lastError = e; // raqam band — qayta urinamiz (hujjatlangan strategiya)
          continue;
        }
        throw e;
      }
    }

    throw new ConflictError('Invoys raqami generatsiyasi muvaffaqiyatsiz — qayta urinib ko\'ring', {
      attempts: MAX_ATTEMPTS,
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }

  async findInvoiceById(id: string): Promise<InvoiceRow | null> {
    const row = await this.prisma.invoice.findUnique({ where: { id } });
    return row === null ? null : toInvoiceRow(row);
  }

  /** Cursor pagination — WHERE id > cursor ORDER BY id (UUID v7). */
  async listInvoicesForUser(
    userId: string,
    first: number,
    afterId: string | null,
  ): Promise<InvoiceRow[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        userId,
        ...(afterId !== null && { id: { gt: afterId } }),
      },
      orderBy: { id: 'asc' },
      take: first + 1,
    });
    return rows.map(toInvoiceRow);
  }

  /**
   * Ro'yxatning billing konteksti — registration → section → tournament
   * kesimi (start puli + RBAC scope identifikatorlari). Faqat O'QISH.
   */
  async findRegistrationBilling(registrationId: string): Promise<RegistrationBillingView | null> {
    const row = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        playerId: true,
        isConfirmed: true,
        isWithdrawn: true,
        invoiceId: true,
        section: {
          select: {
            tournament: {
              select: {
                id: true,
                entryFeeAmount: true,
                entryFeeCurrency: true,
                clubId: true,
                regionId: true,
                federationId: true,
              },
            },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }
    const t = row.section.tournament;
    return {
      registrationId: row.id,
      playerId: row.playerId,
      isConfirmed: row.isConfirmed,
      isWithdrawn: row.isWithdrawn,
      invoiceId: row.invoiceId,
      tournamentId: t.id,
      entryFeeAmount: t.entryFeeAmount === null ? null : t.entryFeeAmount.toString(),
      entryFeeCurrency: t.entryFeeCurrency,
      clubId: t.clubId,
      regionId: t.regionId,
      federationId: t.federationId,
    };
  }

  // --- Payment ---------------------------------------------------------------

  /**
   * To'lov yaratish — idempotency darvozasi.
   *
   * `Payment.idempotencyKey @unique` — concurrency darvozasi (docs/09
   * §3.2): ikkita parallel so'rovdan bittasi INSERT'da yutadi,
   * yutqazgani P2002 oladi va MAVJUD qator qaytariladi (`created:
   * false`) — service replay/konflikt deb baholaydi.
   */
  async createPaymentIdempotent(
    input: CreatePaymentInput,
  ): Promise<{ payment: PaymentRow; created: boolean }> {
    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            invoiceId: input.invoiceId,
            provider: input.provider,
            status: 'CREATED',
            amount: input.amountTiyin,
            currency: input.currency,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.audit.write(tx, {
          action: 'payment.initiated',
          actorUserId: input.actorUserId,
          resourceType: 'Payment',
          resourceId: created.id,
          after: {
            invoiceId: input.invoiceId,
            provider: input.provider,
            amount: input.amountTiyin.toString(),
            idempotencyKey: input.idempotencyKey,
          },
        });
        return created;
      });
      return { payment: toPaymentRow(payment), created: true };
    } catch (e) {
      if (isUniqueViolation(e)) {
        const existing = await this.prisma.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing !== null) {
          return { payment: toPaymentRow(existing), created: false };
        }
      }
      throw e;
    }
  }

  async findPaymentById(id: string): Promise<PaymentRow | null> {
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row === null ? null : toPaymentRow(row);
  }

  async findPaymentByIdempotencyKey(idempotencyKey: string): Promise<PaymentRow | null> {
    const row = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    return row === null ? null : toPaymentRow(row);
  }

  async findPaymentByProviderTx(
    provider: PaymentProviderValue,
    providerTransactionId: string,
  ): Promise<PaymentRow | null> {
    const row = await this.prisma.payment.findUnique({
      where: { provider_providerTransactionId: { provider, providerTransactionId } },
    });
    return row === null ? null : toPaymentRow(row);
  }

  /** Checkout natijasini saqlash (providerRef). */
  async setProviderCheckout(paymentId: string, providerTransactionId: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { providerTransactionId },
    });
  }

  /**
   * To'lov muvaffaqiyati — BIR tranzaksiya, IDEMPOTENT.
   *
   * Qadamlar (hammasi yoki hech biri — docs/09 §6.5):
   *  1. CAS: status → PAID (`updateMany` + `where: status`). Allaqachon
   *     PAID bo'lsa — NO-OP marker qaytadi (webhook 5x = bitta natija,
   *     docs/14 Faza 4 DoD). Terminal holatdan (FAILED/REFUNDED/...) —
   *     ILLEGAL_PAYMENT_TRANSITION.
   *  2. Invoys → PAID + paidAt.
   *  3. Bog'langan ro'yxatlar (Registration.invoiceId) → isConfirmed=true
   *     (PENDING_PAYMENT semantikasi yakuni, docs/14 Faza 1 izohi).
   *  4. Ledger: balanslangan to'plam, BITTA transactionId (uuid).
   *  5. Audit 'payment.succeeded' — o'sha tranzaksiyada.
   *  6. Outbox 'PaymentCompleted' (ADR-0008 ro'yxatida bor).
   */
  async applyPaymentSuccess(
    input: ApplyPaymentSuccessInput,
  ): Promise<{ applied: boolean; payment: PaymentRow }> {
    return await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
      if (payment === null) {
        throw new NotFoundError('Payment', input.paymentId);
      }

      if (payment.status === 'PAID') {
        // Idempotent NO-OP: ledger/audit/outbox QAYTA yozilmaydi.
        return { applied: false, payment: toPaymentRow(payment) };
      }

      // CREATED → PAID (MANUAL) yoki PENDING → PAID (webhook); terminal
      // holatdan chiqish yo'q — 422 (payment-status.machine.ts).
      assertPaymentTransition(payment.status, 'PAID');

      const now = new Date();
      const cas = await tx.payment.updateMany({
        where: { id: payment.id, status: payment.status },
        data: {
          status: 'PAID',
          paidAt: now,
          ...(input.providerTransactionId !== undefined && {
            providerTransactionId: input.providerTransactionId,
          }),
          ...(input.providerPayload !== undefined && {
            // Xom payload JSON sifatida saqlanadi — nizo dalili (docs/09 §9.3).
            providerPayload: input.providerPayload as Prisma.InputJsonValue,
          }),
        },
      });
      if (cas.count === 0) {
        // Poygada yutqazdik — boshqa worker allaqachon yozdi (docs/09 §5.3).
        const again = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        return { applied: false, payment: toPaymentRow(again) };
      }

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'PAID', paidAt: now },
      });

      // Registration.invoiceId — schema darajasidagi billing↔tournament
      // shartnomasi: to'lov tasdig'i ro'yxatni tasdiqlaydi.
      await tx.registration.updateMany({
        where: { invoiceId: payment.invoiceId },
        data: { isConfirmed: true },
      });

      const transactionId = randomUUID();
      await tx.ledgerEntry.createMany({
        data: input.entries.map((e) => ({
          transactionId,
          paymentId: payment.id,
          account: e.account,
          direction: e.direction,
          amount: e.amountTiyin,
          currency: payment.currency,
          description: `payment.succeeded ${payment.id}`,
        })),
      });

      await this.audit.write(tx, {
        action: 'payment.succeeded',
        actorUserId: input.actorUserId,
        resourceType: 'Payment',
        resourceId: payment.id,
        before: { status: payment.status },
        after: {
          status: 'PAID',
          invoiceId: payment.invoiceId,
          provider: payment.provider,
          amount: payment.amount.toString(),
          ledgerTransactionId: transactionId,
        },
        ...(input.reason !== undefined && { reason: input.reason }),
      });

      await this.outbox.enqueue(tx, {
        eventType: 'PaymentCompleted',
        aggregateType: 'Payment',
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          provider: payment.provider,
          amountTiyin: payment.amount.toString(),
          currency: payment.currency,
        },
      });

      const updated = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      return { applied: true, payment: toPaymentRow(updated) };
    });
  }

  /**
   * Refund — BIR tranzaksiya, IDEMPOTENT, ledger'da TESKARI yozuv.
   *
   * Asl yozuvlar HECH QACHON o'zgartirilmaydi/o'chirilmaydi (docs/09
   * §6.1 2-sabab, §8.2) — yangi transactionId bilan reversing to'plam
   * qo'shiladi. Audit 'refund.requested' — sabab MAJBURIY
   * (shared/audit REASON_REQUIRED ro'yxati).
   */
  async applyRefund(input: ApplyRefundInput): Promise<{ applied: boolean; payment: PaymentRow }> {
    return await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
      if (payment === null) {
        throw new NotFoundError('Payment', input.paymentId);
      }

      if (payment.status === 'REFUNDED') {
        return { applied: false, payment: toPaymentRow(payment) }; // idempotent NO-OP
      }

      // PAID → REFUND_REQUESTED → REFUNDED: MANUAL kabi sinxron oqimda
      // ikkala qadam bitta tranzaksiyada (payment-status.machine.ts).
      assertRefundPath(payment.status);

      const now = new Date();
      const cas = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PAID' },
        data: { status: 'REFUNDED', refundedAt: now },
      });
      if (cas.count === 0) {
        const again = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        return { applied: false, payment: toPaymentRow(again) };
      }

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'REFUNDED' },
      });

      // Ro'yxat holatiga TEGILMAYDI: turnirdan chiqarish alohida qaror
      // (withdraw, sabab bilan) — refund uni avtomatik bildirmaydi.

      const transactionId = randomUUID();
      await tx.ledgerEntry.createMany({
        data: input.entries.map((e) => ({
          transactionId,
          paymentId: payment.id,
          account: e.account,
          direction: e.direction,
          amount: e.amountTiyin,
          currency: payment.currency,
          description: `refund.requested ${payment.id}`,
        })),
      });

      await this.audit.write(tx, {
        action: 'refund.requested',
        actorUserId: input.actorUserId,
        resourceType: 'Payment',
        resourceId: payment.id,
        before: { status: payment.status },
        after: {
          status: 'REFUNDED',
          invoiceId: payment.invoiceId,
          amount: payment.amount.toString(),
          ledgerTransactionId: transactionId,
        },
        reason: input.reason,
      });

      await this.outbox.enqueue(tx, {
        eventType: 'RefundIssued',
        aggregateType: 'Payment',
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amountTiyin: payment.amount.toString(),
          currency: payment.currency,
          reason: input.reason,
        },
      });

      const updated = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      return { applied: true, payment: toPaymentRow(updated) };
    });
  }

  // --- Ledger ------------------------------------------------------------------

  /**
   * Hisob kesimida debit/kredit yig'indilari — reconciliation manbai
   * (docs/09 §11.4). Balans HECH QACHON saqlanmaydi — doim yig'indi
   * (docs/09 §6.5).
   *
   * @param account berilsa — faqat shu hisob.
   */
  async ledgerBalances(account?: string): Promise<LedgerAccountSums[]> {
    const groups = await this.prisma.ledgerEntry.groupBy({
      by: ['account', 'direction'],
      ...(account !== undefined && { where: { account } }),
      _sum: { amount: true },
    });

    const byAccount = new Map<string, { debit: bigint; credit: bigint }>();
    for (const g of groups) {
      const sums = byAccount.get(g.account) ?? { debit: 0n, credit: 0n };
      const total = g._sum.amount ?? 0n;
      if (g.direction === 'DEBIT') {
        sums.debit += total;
      } else {
        sums.credit += total;
      }
      byAccount.set(g.account, sums);
    }

    return [...byAccount.entries()]
      .map(([acc, sums]) => ({
        account: acc,
        debitTiyin: sums.debit,
        creditTiyin: sums.credit,
      }))
      .sort((a, b) => a.account.localeCompare(b.account));
  }
}

// --- Mapper'lar ---------------------------------------------------------------

function toInvoiceRow(i: Invoice): InvoiceRow {
  return {
    id: i.id,
    number: i.number,
    userId: i.userId,
    subscriptionId: i.subscriptionId,
    tournamentId: i.tournamentId,
    subtotalAmount: i.subtotalAmount.toString(),
    taxAmount: i.taxAmount.toString(),
    totalAmount: i.totalAmount.toString(),
    currency: i.currency,
    status: i.status,
    dueAt: i.dueAt,
    paidAt: i.paidAt,
    createdAt: i.createdAt,
  };
}

function toPaymentRow(p: Payment): PaymentRow {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    provider: p.provider,
    status: p.status,
    amount: p.amount.toString(),
    currency: p.currency,
    providerTransactionId: p.providerTransactionId,
    idempotencyKey: p.idempotencyKey,
    failureReason: p.failureReason,
    paidAt: p.paidAt,
    refundedAt: p.refundedAt,
    createdAt: p.createdAt,
  };
}
