/**
 * Billing — tiplar. `prisma/schema.prisma` (haqiqat manbai) enum'lari
 * bilan AYNAN mos literal union'lar + qator (row) shakllari.
 *
 * PUL: qator shakllarida miqdorlar STRING — JSON'da BigInt yo'q
 * (ADR-0006: JS Number 2^53 dan katta butun sonni yo'qotadi).
 * Ichki hisob-kitob esa HAR DOIM `bigint` tiyinda.
 *
 * @see docs/09-payments-and-billing.md
 */

/** `PaymentStatus` enum (schema) — docs/09 §5 holat mashinasi. */
export type PaymentStatusValue =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUND_REQUESTED'
  | 'REFUNDED';

/** `PaymentProvider` enum (schema). */
export type PaymentProviderValue = 'CLICK' | 'PAYME' | 'UZUM' | 'BANK_TRANSFER' | 'MANUAL';

/** `LedgerDirection` enum (schema). */
export type LedgerDirectionValue = 'DEBIT' | 'CREDIT';

/**
 * API orqali to'lov boshlash mumkin bo'lgan provayderlar (Faza 4).
 * UZUM — keyinroq; BANK_TRANSFER — B2G oqimi (docs/09 §7.2), invoys
 * orqali, checkout emas.
 */
export const INITIATABLE_PROVIDERS = ['CLICK', 'PAYME', 'MANUAL'] as const;
export type InitiatableProvider = (typeof INITIATABLE_PROVIDERS)[number];

// --- Qator shakllari ---------------------------------------------------------

export interface InvoiceRow {
  id: string;
  /** 'FRZ-YYYY-NNNNNN' — yil bo'yicha ketma-ket (invoice-number.ts). */
  number: string;
  userId: string | null;
  subscriptionId: string | null;
  tournamentId: string | null;
  /** TIYINDA, string ko'rinishida (ADR-0006). */
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  status: PaymentStatusValue;
  dueAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface PaymentRow {
  id: string;
  invoiceId: string;
  provider: PaymentProviderValue;
  status: PaymentStatusValue;
  /** TIYINDA, string ko'rinishida (ADR-0006). */
  amount: string;
  currency: string;
  providerTransactionId: string | null;
  idempotencyKey: string;
  failureReason: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
}

/** To'lov boshlash javobi — checkout URL alohida (Payment jadvalida yo'q). */
export interface InitiatedPayment extends PaymentRow {
  checkoutUrl: string | null;
}

/**
 * Ro'yxatning billing konteksti — invoys yaratish uchun kerak bo'lgan
 * minimal kesim (registration + turnir start puli + RBAC scope uchun
 * org identifikatorlari).
 */
export interface RegistrationBillingView {
  registrationId: string;
  playerId: string;
  isConfirmed: boolean;
  isWithdrawn: boolean;
  invoiceId: string | null;
  tournamentId: string;
  /** TIYINDA, string; null = bepul turnir. */
  entryFeeAmount: string | null;
  entryFeeCurrency: string;
  clubId: string | null;
  regionId: string | null;
  federationId: string | null;
}

/** Reconciliation hisoboti — hisob kesimida balans (docs/09 §11.4). */
export interface LedgerAccountBalance {
  account: string;
  /** TIYINDA, string. */
  debitTiyin: string;
  creditTiyin: string;
  /** debit − credit. */
  balanceTiyin: string;
}

export interface ReconciliationReport {
  accounts: LedgerAccountBalance[];
  /**
   * SUM(debit) − SUM(credit) BARCHA yozuvlar bo'yicha — HAR DOIM "0"
   * bo'lishi shart (farzin_ledger_imbalance_tiyin metrikasi manbai,
   * docs/14-roadmap.md Faza 4, docs/15-observability.md §6.4).
   */
  imbalanceTiyin: string;
  balanced: boolean;
  generatedAt: Date;
}
