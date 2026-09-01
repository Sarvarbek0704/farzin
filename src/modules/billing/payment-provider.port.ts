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
   * Webhook'ning XOM baytlari — imzo AYNAN shular ustidan tekshiriladi
   * (docs/09 §10.2).
   *
   * ═══════════════════════════════════════════════════════════════════════
   *  NEGA PARSE QILINGAN OBYEKT YARAMAYDI
   *
   *  HMAC bayt oqimidan hisoblanadi. `JSON.parse` → `JSON.stringify`
   *  aylanishi baytlarni O'ZGARTIRADI: kalitlar tartibi, bo'shliqlar,
   *  Unicode escape va son formati (`1.0` → `1`) saqlanmaydi. Natijada
   *  to'g'ri imzo RAD ETILADI yoki — ancha yomoni — noto'g'ri imzo
   *  QABUL QILINADI, chunki taqqoslash boshqa ma'lumot ustida boradi.
   *  Bu to'lov yo'qotish yo'li.
   *
   *  Ilgari bu yerda parse qilingan JSON kelardi va `main.ts` da
   *  `rawBody: true` YO'Q edi (docs/AUDIT.md JIDDIY-9). Stub adapterlar
   *  baribir PROVIDER_NOT_CONFIGURED tashlagani uchun bu sezilmasdi —
   *  ya'ni xato real provayder ulangan KUNI chiqardi.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * `null` — xom body mavjud emas (masalan `Content-Type` JSON emas yoki
   * body bo'sh). Adapter bunday holatda imzoni tekshira olmaydi va rad
   * etishi SHART; "ehtimol to'g'ri" yo'li YO'Q.
   */
  readonly rawBody: Buffer | null;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /**
   * Parse qilingan body — imzo tekshirilgandan KEYIN maydonlarni o'qish
   * uchun qulaylik. Imzo uchun HECH QACHON ishlatilmaydi.
   */
  readonly parsedBody: unknown;
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
