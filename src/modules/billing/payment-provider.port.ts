import type { PaymentProviderValue } from './billing.types';

/**
 * To'lov provayderi PORTI — provayder-neytral interfeys.
 *
 * `billing.service` FAQAT shu portni biladi; konkret adapter'lar
 * (providers/*.provider.ts) DI ro'yxati orqali PAYMENT_PROVIDERS
 * token'iga yig'iladi (docs/09-payments-and-billing.md §2: strategiya
 * pattern + port/adapter; yangi provayder = 1 yangi fayl + DI'ga 1 qator).
 *
 * PUL: portda miqdor HAR DOIM `bigint` TIYINDA (ADR-0006). Provayderning
 * wire-formatiga (so'm, kasr, string) o'girish — FAQAT adapter ichida,
 * chegara qatlamida.
 */

/** Checkout so'rovi — provayderga kerak bo'lgan minimal kesim. */
export interface CheckoutInput {
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  /** TIYINDA (ADR-0006). */
  readonly amountTiyin: bigint;
  readonly currency: string;
  readonly description: string;
}

export interface CheckoutResult {
  /**
   * Provayder tomonidagi ma'lumotnoma — `Payment.providerTransactionId`
   * ga yoziladi (unique [provider, providerTransactionId] — webhook shu
   * orqali to'lovni topadi).
   */
  readonly providerRef: string;
  /** Hosted checkout URL. MANUAL'da yo'q (naqd — kassada). */
  readonly checkoutUrl: string | null;
}

export interface WebhookVerifyInput {
  /**
   * TODO(billing): real provayder ulanganda bu XOM baytlar (Buffer)
   * bo'lishi SHART — imzo xom body ustidan tekshiriladi, qayta
   * serializatsiya qilingan obyekt ustidan EMAS (docs/09 §10.2).
   * Hozircha express.json parse qilingan JSON keladi; stub adapterlar
   * baribir PROVIDER_NOT_CONFIGURED tashlaydi.
   */
  readonly rawBody: unknown;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/** Adapter webhook'ni tekshirib, provayder-neytral hodisaga keltiradi. */
export interface NormalizedWebhookEvent {
  /** Provayder tranzaksiya ID — idempotentlik langari (docs/09 §3.3). */
  readonly providerTransactionId: string;
  /** Farzin-tomonidagi Payment ID (merchant param orqali qaytsa). */
  readonly paymentId: string | null;
  readonly status: 'PAID' | 'FAILED' | 'CANCELLED';
  /** TIYINDA (ADR-0006). */
  readonly amountTiyin: bigint;
  readonly currency: string;
  /** Xom payload — nizo bo'lsa dalil (`Payment.providerPayload`). */
  readonly raw: unknown;
}

export interface RefundInput {
  readonly paymentId: string;
  readonly providerTransactionId: string | null;
  /** TIYINDA (ADR-0006). */
  readonly amountTiyin: bigint;
  readonly currency: string;
  readonly reason: string;
}

export interface ProviderRefundResult {
  readonly accepted: boolean;
  readonly providerRefundRef: string | null;
}

/**
 * PORT. Har adapter AYNAN shu interfeysni amalga oshiradi.
 * `billing` moduli hech qanday konkret adapter'ni service qatlamida
 * import qilmaydi — faqat modul faylida DI ro'yxati uchun.
 */
export interface PaymentProviderAdapter {
  readonly code: PaymentProviderValue;
  /**
   * false = sandbox/merchant sozlanmagan — to'lov boshlashdan OLDIN
   * PROVIDER_NOT_CONFIGURED bilan rad etiladi (yetim CREATED Payment
   * qatorlari qolib ketmasin).
   */
  readonly configured: boolean;

  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  /** Imzo tekshiruvi + normalizatsiya. Noto'g'ri imzo → throw. */
  verifyWebhook(input: WebhookVerifyInput): Promise<NormalizedWebhookEvent>;

  refund(input: RefundInput): Promise<ProviderRefundResult>;
}

/** DI token — modul faylida adapter'lar massivi shu token'ga bog'lanadi. */
export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
