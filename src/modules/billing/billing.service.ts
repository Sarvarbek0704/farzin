import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  buildEntryFeePaymentEntries,
  reverseLedgerEntries,
} from '../../core/billing/ledger';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.error';
import {
  paymentProviderLabel,
  type PaymentFailureReason,
  type PaymentOperationLabel,
} from '../../shared/metrics/metrics.labels';
import { MetricsService } from '../../shared/metrics/metrics.service';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  MAX_PAGE_SIZE,
  type Page,
  toPage,
} from '../../shared/pagination/cursor';
import { type Actor, RbacService } from '../identity/rbac.port';
import { PLAYER_PORT, type PlayerPort } from '../player/player.port';
import { BillingRepository } from './billing.repository';
import type {
  InitiatableProvider,
  InitiatedPayment,
  InvoiceRow,
  PaymentProviderValue,
  PaymentRow,
  ReconciliationReport,
  RegistrationBillingView,
} from './billing.types';
import { evaluateIdempotentInitiate } from './idempotency';
import { assertRefundPath } from './payment-status.machine';
import { ProviderRegistry } from './providers/provider.registry';

/**
 * Billing — Faza 4 yadrosi: invoys, to'lov, ledger, refund,
 * reconciliation. docs/09-payments-and-billing.md, docs/14-roadmap.md.
 *
 * IDOR himoyasi: har amal YUKLANGAN obyekt bilan tekshiriladi;
 * ruxsat yo'q → 404, hech qachon 403 (docs/04-api-spec.md §2.4).
 *
 * RUXSAT QARORI (hujjatlangan tanlov): matritsada (docs/01 §4.1)
 * `Payment` uchun `update` FAQAT SUPER_ADMIN'da bor (PLAYER/PARENT — CR).
 * Shu sababli confirm-manual va refund amalda SUPER_ADMIN bilan
 * cheklanadi: `rbac.can(actor, 'update', { type: 'Payment' })` scope'siz
 * ref bilan faqat global scope (SUPER_ADMIN) dan o'tadi. Hakamga naqd
 * tasdiq berish kerak bo'lsa — matritsaga turnir-scoped grant qo'shiladi
 * va bu kod O'ZGARMAYDI (scope tekshiruvi tayyor).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly repo: BillingRepository,
    private readonly rbac: RbacService,
    private readonly registry: ProviderRegistry,
    @Inject(PLAYER_PORT) private readonly players: PlayerPort,
    private readonly metrics: MetricsService,
  ) {}

  // --- Invoys ------------------------------------------------------------------

  /**
   * Ro'yxat uchun invoys yaratish.
   *
   * Qoidalar (docs/09 §7.3 + topshiriq):
   *  - ro'yxat aktorning O'ZINIKI (PLAYER_PORT orqali playerId
   *    solishtiriladi) YOKI aktor scope ichidagi mas'ul (admin/tashkilotchi);
   *  - turnir start puli > 0 bo'lishi shart;
   *  - mavjud to'lanmagan (yoki to'langan) invoys bo'lsa → 409.
   *
   * Invoys egasi (userId) — AKTOR: o'z oqimida o'yinchining o'zi;
   * admin yaratganda to'lov mas'ulligini admin oladi (MANUAL naqd oqim).
   */
  async createInvoiceForRegistration(actor: Actor, registrationId: string): Promise<InvoiceRow> {
    const view = await this.repo.findRegistrationBilling(registrationId);
    if (view === null) {
      throw new NotFoundError('Registration', registrationId);
    }

    // Ruxsat BIRINCHI — biznes xatosi ham resurs haqida ma'lumot
    // sizdirmasin (docs/04-api-spec.md §2.4).
    const ownPlayer = await this.players.findSummaryByUserId(actor.userId);
    const isOwn = ownPlayer !== null && ownPlayer.id === view.playerId;
    const allowed =
      isOwn || this.rbac.can(actor, 'update', this.toRegistrationRef(view, actor, isOwn));
    if (!allowed) {
      throw new NotFoundError('Registration', registrationId);
    }

    if (view.isWithdrawn) {
      throw new BusinessRuleError(
        'REGISTRATION_WITHDRAWN',
        "Chiqarilgan ro'yxat uchun invoys yaratilmaydi",
        { registrationId },
      );
    }
    if (view.isConfirmed) {
      throw new ConflictError("Ro'yxat allaqachon tasdiqlangan — to'lov talab qilinmaydi", {
        registrationId,
      });
    }

    const fee = view.entryFeeAmount === null ? 0n : BigInt(view.entryFeeAmount);
    if (fee <= 0n) {
      throw new BusinessRuleError('NO_ENTRY_FEE', "Turnirda start puli yo'q — invoys kerak emas", {
        tournamentId: view.tournamentId,
      });
    }

    if (view.invoiceId !== null) {
      const existing = await this.repo.findInvoiceById(view.invoiceId);
      if (
        existing !== null &&
        (existing.status === 'CREATED' || existing.status === 'PENDING' || existing.status === 'PAID')
      ) {
        // To'lanmagan invoys bor — ikkinchi invoys ikki marta yechish
        // riski. To'langan bo'lsa — umuman kerak emas.
        throw new ConflictError("Bu ro'yxat uchun amaldagi invoys allaqachon bor", {
          registrationId,
          invoiceId: existing.id,
          status: existing.status,
        });
      }
      // FAILED/CANCELLED/EXPIRED/REFUNDED — yangi invoys ochish mumkin.
    }

    return await this.repo.createInvoice({
      userId: actor.userId,
      tournamentId: view.tournamentId,
      registrationId,
      subtotalTiyin: fee,
      // Soliq bu bosqichda 0 — stavka yuridik masala (docs/09 §9),
      // ustun schema'da bor, qiymat yurist tasdig'idan keyin.
      taxTiyin: 0n,
      totalTiyin: fee,
      currency: view.entryFeeCurrency,
      actorUserId: actor.userId,
    });
  }

  /** O'z invoyslari — cursor pagination (docs/04-api-spec.md §3). */
  async listInvoices(
    actor: Actor,
    query: { first?: number | undefined; after?: string | undefined },
  ): Promise<Page<InvoiceRow>> {
    const pageSize = Math.min(Math.max(query.first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;
    const rows = await this.repo.listInvoicesForUser(actor.userId, pageSize, afterId);
    return toPage(rows, pageSize);
  }

  // --- To'lov --------------------------------------------------------------------

  /**
   * To'lov boshlash — Idempotency-Key MAJBURIY (docs/04 §5, controller
   * header yo'qligida 400 beradi).
   *
   * Semantika (docs/09 §3.2):
   *  - bir xil kalit + bir xil (invoiceId, provider) → MAVJUD to'lov
   *    qaytadi, yangi qator YARATILMAYDI (replay);
   *  - bir xil kalit + boshqa mazmun → 422 IDEMPOTENCY_KEY_REUSE;
   *  - parallel poyga DB darajasida hal: Payment.idempotencyKey @unique.
   */
  async initiatePayment(
    actor: Actor,
    invoiceId: string,
    provider: InitiatableProvider,
    idempotencyKey: string,
  ): Promise<InitiatedPayment> {
    const invoice = await this.repo.findInvoiceById(invoiceId);
    if (invoice === null) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const isOwn = invoice.userId === actor.userId;
    const allowed = isOwn || this.rbac.can(actor, 'create', { type: 'Payment' });
    if (!allowed) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    // Idempotency BIRINCHI (ruxsatdan keyin): docs/04 §5 — bir xil kalit
    // replay'da SAQLANGAN natijani qaytaradi, keyingi holat (invoys
    // to'landi, provayder sozlanmadi) bunga TA'SIR QILMAYDI; boshqa
    // mazmun esa har doim 422 IDEMPOTENCY_KEY_REUSE.
    const existing = await this.repo.findPaymentByIdempotencyKey(idempotencyKey);
    if (existing !== null) {
      return this.replayOrConflict(existing, invoiceId, provider);
    }

    // ── Kuzatuvchanlik (docs/15 §3.3 TO'LOV) ──────────────────────────────
    // Urinish FAQAT shu yerda sanaladi — replay (yuqoridagi shox) yangi
    // urinish emas, aks holda §6.4 failure-rate maxraji shishadi. Yorliq
    // — provayder KODI; invoys/foydalanuvchi/karta hech qachon (§3.3).
    const providerLabel = paymentProviderLabel(provider);
    this.metrics.incPaymentAttempt({ provider: providerLabel });

    if (invoice.status !== 'CREATED' && invoice.status !== 'PENDING') {
      this.failPayment(providerLabel, 'INVOICE_NOT_OPEN');
      throw new ConflictError("Invoys to'lovga ochiq emas", {
        invoiceId,
        status: invoice.status,
      });
    }

    const adapter = this.registry.get(provider);
    if (!adapter.configured) {
      this.failPayment(providerLabel, 'PROVIDER_NOT_CONFIGURED');
      // Yetim CREATED Payment qatorlari qolmasin — sozlanmagan provayder
      // to'lov boshlashdan OLDIN rad etiladi (docs/09 §1.4: sandbox
      // hisob ma'lumotlari provayderdan olinadi, to'qilmaydi).
      throw new BusinessRuleError(
        'PROVIDER_NOT_CONFIGURED',
        `${provider} provayderi hali sozlanmagan — sandbox/merchant hisob ma'lumotlari kutilmoqda`,
        { provider },
      );
    }

    const created = await this.repo.createPaymentIdempotent({
      invoiceId,
      provider,
      amountTiyin: BigInt(invoice.totalAmount),
      currency: invoice.currency,
      idempotencyKey,
      actorUserId: actor.userId,
    });
    if (!created.created) {
      // Parallel so'rov yutdi (P2002) — replay/konflikt baholanadi.
      return this.replayOrConflict(created.payment, invoiceId, provider);
    }

    const checkout = await this.timedProviderCall(providerLabel, 'checkout', () =>
      adapter.createCheckout({
        paymentId: created.payment.id,
        invoiceId,
        invoiceNumber: invoice.number,
        amountTiyin: BigInt(invoice.totalAmount),
        currency: invoice.currency,
        description: `Invoys ${invoice.number}`,
      }),
    );
    await this.repo.setProviderCheckout(created.payment.id, checkout.providerRef);

    return {
      ...created.payment,
      providerTransactionId: checkout.providerRef,
      checkoutUrl: checkout.checkoutUrl,
    };
  }

  /**
   * MANUAL to'lovni tasdiqlash — naqd pul kassada qabul qilingach.
   * Ruxsat: Payment 'update' (amalda SUPER_ADMIN — klass izohi).
   * IDEMPOTENT: allaqachon PAID → no-op (takror ledger yozuvi YO'Q).
   */
  async confirmManualPayment(actor: Actor, paymentId: string, reason: string): Promise<PaymentRow> {
    const trimmedReason = reason.trim();
    if (trimmedReason === '') {
      throw new BusinessRuleError(
        'CONFIRM_REASON_REQUIRED',
        "Naqd to'lov tasdig'i uchun sabab majburiy (audit)",
        {},
      );
    }

    const payment = await this.repo.findPaymentById(paymentId);
    if (payment === null) {
      throw new NotFoundError('Payment', paymentId);
    }
    if (!this.rbac.can(actor, 'update', { type: 'Payment' })) {
      throw new NotFoundError('Payment', paymentId);
    }

    if (payment.provider !== 'MANUAL') {
      throw new BusinessRuleError(
        'MANUAL_CONFIRM_ONLY',
        "Qo'lda tasdiq faqat MANUAL provayder to'lovi uchun — onlayn to'lov webhook orqali tasdiqlanadi",
        { paymentId, provider: payment.provider },
      );
    }

    // DR cash.manual / CR liability.organizer_payable (docs/09 §6.2).
    const entries = buildEntryFeePaymentEntries('MANUAL', BigInt(payment.amount));
    // Urinish bu yerda SANALMAYDI — u initiatePayment'da sanalgan
    // (MANUAL ham invoys → initiate → confirm yo'lidan o'tadi).
    const result = await this.timedProviderCall(
      paymentProviderLabel('MANUAL'),
      'confirm',
      () =>
        this.repo.applyPaymentSuccess({
          paymentId,
          actorUserId: actor.userId,
          entries,
          reason: trimmedReason,
        }),
    );
    return result.payment;
  }

  /**
   * Webhook — provayder chaqiradi.
   *
   * Auth guard YO'Q (@Public) va rate limit YO'Q (docs/10-security.md
   * §7.1 jadvali: webhook — limit yo'q; provayder retry'ini bloklash =
   * to'lov yo'qotish). Haqiqiylik IMZO bilan ta'minlanadi — adapter
   * verifyWebhook noto'g'ri imzoda throw qiladi, yon ta'sirsiz.
   *
   * Idempotentlik: providerTransactionId → mavjud PAID to'lov = no-op
   * (applyPaymentSuccess ichidagi CAS); webhook 5x = bitta Payment,
   * bitta ledger to'plami (docs/14 Faza 4 DoD).
   */
  async webhook(
    providerCode: PaymentProviderValue,
    rawBody: unknown,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<{ received: true; duplicate: boolean }> {
    const adapter = this.registry.get(providerCode);
    const providerLabel = paymentProviderLabel(providerCode);

    // 1. Imzo/normalizatsiya. Stub adapterlar shu yerda
    //    PROVIDER_NOT_CONFIGURED tashlaydi (422, yon ta'sirsiz).
    const event = await this.timedProviderCall(providerLabel, 'webhook', () =>
      adapter.verifyWebhook({ rawBody, headers }),
    );

    // 2. To'lovni topish: avval provayder tranzaksiya ID, keyin
    //    merchant param orqali qaytgan Farzin Payment ID.
    let payment = await this.repo.findPaymentByProviderTx(
      providerCode,
      event.providerTransactionId,
    );
    if (payment === null && event.paymentId !== null) {
      payment = await this.repo.findPaymentById(event.paymentId);
    }
    if (payment === null) {
      // Provayder pul olgan-u, bizda yozuv yo'q bo'lishi mumkin emas —
      // bu reconciliation'ning 'missing_locally' holati (docs/09 §11.3).
      throw new NotFoundError('Payment');
    }

    if (event.status === 'PAID') {
      if (BigInt(payment.amount) !== event.amountTiyin || payment.currency !== event.currency) {
        // amount_mismatch — yuqori jiddiylik (docs/09 §11.3); avtomatik
        // "tuzatish" YO'Q, xato qaytariladi va odam ko'radi.
        this.failPayment(providerLabel, 'AMOUNT_MISMATCH');
        throw new BusinessRuleError('AMOUNT_MISMATCH', "Webhook summasi to'lov bilan mos emas", {
          paymentId: payment.id,
          expected: payment.amount,
          received: event.amountTiyin.toString(),
        });
      }

      const entries = buildEntryFeePaymentEntries(providerCode, BigInt(payment.amount));
      const result = await this.repo.applyPaymentSuccess({
        paymentId: payment.id,
        actorUserId: null, // tizim harakati — webhook
        entries,
        providerTransactionId: event.providerTransactionId,
        ...(event.raw !== undefined && { providerPayload: event.raw }),
      });
      return { received: true, duplicate: !result.applied };
    }

    // FAILED/CANCELLED — terminal muvaffaqiyatsizlik; TTL/expire oqimi
    // keyinroq (docs/09 §5.1 TTL job). Hozircha holat faqat PAID uchun
    // o'zgartiriladi — boshqa hodisa qabul qilinadi-yu, e'tiborsiz
    // qoldirilmaydi: log darajasida provayder payload saqlash real
    // adapter bilan birga keladi (TODO(billing)).
    return { received: true, duplicate: false };
  }

  /**
   * Refund — sabab MAJBURIY, ledger'da teskari yozuv, audit + outbox.
   * Ruxsat: Payment 'update' (amalda SUPER_ADMIN — klass izohi).
   * IDEMPOTENT: allaqachon REFUNDED → no-op.
   */
  async refund(actor: Actor, paymentId: string, reason: string): Promise<PaymentRow> {
    const trimmedReason = reason.trim();
    if (trimmedReason === '') {
      throw new BusinessRuleError('REFUND_REASON_REQUIRED', 'Refund uchun sabab majburiy', {});
    }

    const payment = await this.repo.findPaymentById(paymentId);
    if (payment === null) {
      throw new NotFoundError('Payment', paymentId);
    }
    if (!this.rbac.can(actor, 'update', { type: 'Payment' })) {
      throw new NotFoundError('Payment', paymentId);
    }

    if (payment.status === 'REFUNDED') {
      return payment; // idempotent no-op
    }
    assertRefundPath(payment.status); // faqat PAID dan (422 aks holda)

    // Provayder tomonida refund. MANUAL — darhol qabul; Click/Payme
    // stub'lari PROVIDER_NOT_CONFIGURED tashlaydi (hisob ma'lumotlari
    // kelguncha onlayn refund yopiq).
    const adapter = this.registry.get(payment.provider);
    const providerLabel = paymentProviderLabel(payment.provider);
    const providerResult = await this.timedProviderCall(providerLabel, 'refund', () =>
      adapter.refund({
        paymentId: payment.id,
        providerTransactionId: payment.providerTransactionId,
        amountTiyin: BigInt(payment.amount),
        currency: payment.currency,
        reason: trimmedReason,
      }),
    );
    if (!providerResult.accepted) {
      this.failPayment(providerLabel, 'REFUND_REJECTED');
      throw new BusinessRuleError('REFUND_REJECTED', 'Provayder refund so\'rovini rad etdi', {
        paymentId,
      });
    }

    // Asl to'plamning TESKARISI — asl yozuvlar joyida qoladi
    // (docs/09 §8.2 immutability).
    const entries = reverseLedgerEntries(
      buildEntryFeePaymentEntries(payment.provider, BigInt(payment.amount)),
    );
    const result = await this.repo.applyRefund({
      paymentId,
      actorUserId: actor.userId,
      reason: trimmedReason,
      entries,
    });
    return result.payment;
  }

  // --- Reconciliation -------------------------------------------------------------

  /**
   * Ledger yaxlitligi hisoboti (docs/09 §11.4): hisob kesimida
   * debit/kredit va UMUMIY nomutanosiblik — HAR DOIM 0 bo'lishi shart.
   * Bu qiymat `farzin_ledger_imbalance_tiyin` metrikasining manbai
   * (docs/15-observability.md §3.3, docs/14 Faza 4 DoD).
   *
   * Ruxsat: Payment 'read' GLOBAL scope bilan — scope'siz ref faqat
   * SUPER_ADMIN'dan o'tadi (scoped R grantlar own/hierarchy talab
   * qiladi). Moliyaviy jamlama — admin ma'lumoti.
   */
  async reconciliationReport(actor: Actor): Promise<ReconciliationReport> {
    if (!this.rbac.can(actor, 'read', { type: 'Payment' })) {
      throw new NotFoundError('Payment');
    }

    const sums = await this.repo.ledgerBalances();
    let totalDebit = 0n;
    let totalCredit = 0n;
    const accounts = sums.map((s) => {
      totalDebit += s.debitTiyin;
      totalCredit += s.creditTiyin;
      return {
        account: s.account,
        debitTiyin: s.debitTiyin.toString(),
        creditTiyin: s.creditTiyin.toString(),
        balanceTiyin: (s.debitTiyin - s.creditTiyin).toString(),
      };
    });

    const imbalance = totalDebit - totalCredit;
    this.metrics.setLedgerImbalance(Number(imbalance));
    return {
      accounts,
      imbalanceTiyin: imbalance.toString(),
      balanced: imbalance === 0n,
      generatedAt: new Date(),
    };
  }

  /**
   * `farzin_ledger_imbalance_tiyin` — REJALI tekshiruv.
   *
   * NEGA ODAMGA TAYANMAYDI: yuqoridagi hisobot faqat kimdir endpointni
   * ochganda hisoblanadi. Alert esa (docs/15 §6.4 `FarzinLedgerImbalance`,
   * `for: 1m`) uzluksiz seriya talab qiladi — aks holda "pul yo'qoldi"
   * holati keyingi audit kunigacha ko'rinmaydi. 5 daqiqa — arzon
   * `GROUP BY account` SUM so'rovi uchun oqilona chastota.
   *
   * `Number()` konversiyasi: imbalans 0 bo'lishi SHART; nolga teng
   * bo'lmagan qiymat ham 2^53 tiyindan (≈ 90 mlrd so'm) kichik bo'ladi —
   * aniqlik yo'qolmaydi. Pul HISOBI baribir bigint'da (ADR-0006);
   * bu faqat ko'rsatkich.
   */
  @Interval(300_000)
  async refreshLedgerImbalanceMetric(): Promise<void> {
    try {
      const sums = await this.repo.ledgerBalances();
      let imbalance = 0n;
      for (const s of sums) {
        imbalance += s.debitTiyin - s.creditTiyin;
      }
      this.metrics.setLedgerImbalance(Number(imbalance));
    } catch (err) {
      this.logger.warn(`Ledger imbalance metrikasi yangilanmadi: ${String(err)}`);
    }
  }

  // --- Yordamchilar -----------------------------------------------------------

  /** Metrika yorlig'i tayyor holda — takroriy chaqiruvni qisqartiradi. */
  private failPayment(
    provider: ReturnType<typeof paymentProviderLabel>,
    reason: PaymentFailureReason,
  ): void {
    this.metrics.incPaymentFailure({ provider, reason });
  }

  /**
   * Provayder chaqiruvini o'lchash: davomiylik HAR IKKI holatda ham
   * yoziladi (docs/15 §3.1 RED — sekin XATO ham sekin), xato esa
   * `PROVIDER_ERROR` sifatida sanaladi. Xato TUTILMAYDI — u yuqoriga
   * ketadi; metrika oqimni o'zgartirmaydi.
   */
  private async timedProviderCall<T>(
    provider: ReturnType<typeof paymentProviderLabel>,
    operation: PaymentOperationLabel,
    call: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      return await call();
    } catch (err) {
      this.failPayment(provider, 'PROVIDER_ERROR');
      throw err;
    } finally {
      this.metrics.observePaymentDuration((Date.now() - startedAt) / 1000, {
        provider,
        operation,
      });
    }
  }

  /** Replay yoki 422 IDEMPOTENCY_KEY_REUSE (docs/04 §5). */
  private replayOrConflict(
    existing: PaymentRow,
    invoiceId: string,
    provider: PaymentProviderValue,
  ): InitiatedPayment {
    const outcome = evaluateIdempotentInitiate(
      { invoiceId: existing.invoiceId, provider: existing.provider },
      { invoiceId, provider },
    );
    if (outcome === 'CONFLICT') {
      throw new BusinessRuleError(
        'IDEMPOTENCY_KEY_REUSE',
        "Bu Idempotency-Key boshqa so'rov uchun ishlatilgan",
        { idempotencyKey: existing.idempotencyKey },
      );
    }
    // Replay: operatsiya QAYTA BAJARILMAYDI — mavjud to'lov qaytadi.
    // checkoutUrl saqlanmaydi (Payment jadvalida ustun yo'q — schema
    // haqiqat manbai); real provayderde replay'da URL qayta so'raladi
    // yoki TTL bilan keshda saqlanadi (TODO(billing) adapter bilan).
    return { ...existing, checkoutUrl: null };
  }

  /** RBAC scope ref — ro'yxat konteksti (exactOptionalPropertyTypes). */
  private toRegistrationRef(
    view: RegistrationBillingView,
    actor: Actor,
    isOwn: boolean,
  ): {
    type: 'Registration';
    ownerUserId?: string;
    clubId?: string;
    regionId?: string;
    federationId?: string;
    tournamentId: string;
  } {
    return {
      type: 'Registration',
      ...(isOwn && { ownerUserId: actor.userId }),
      ...(view.clubId !== null && { clubId: view.clubId }),
      ...(view.regionId !== null && { regionId: view.regionId }),
      ...(view.federationId !== null && { federationId: view.federationId }),
      tournamentId: view.tournamentId,
    };
  }
}
