/**
 * Notification moduli — PUBLIC tiplar.
 *
 * [CANON 5] #14 (docs/02-architecture.md §5 jadvali: "notification — SMS,
 * push, Telegram, email"), docs/01-product-spec.md §2.14.
 *
 * prisma/schema.prisma enum'lari bilan AYNAN mos literal union'lar
 * (billing.types.ts / play.types.ts pattern'i).
 */

// --- Schema enum'lari ---------------------------------------------------------

/** `NotificationChannel` enum (prisma/schema.prisma) bilan aynan mos. */
export const NOTIFICATION_CHANNELS = ['SMS', 'PUSH', 'TELEGRAM', 'EMAIL', 'IN_APP'] as const;

export type NotificationChannelValue = (typeof NOTIFICATION_CHANNELS)[number];

// --- Til (locale) ---------------------------------------------------------------

/**
 * Qo'llab-quvvatlanadigan tillar — User.locale sharhi bilan aynan mos
 * (prisma/schema.prisma: "uz-Latn | uz-Cyrl | ru | en").
 */
export const NOTIFICATION_LOCALES = ['uz-Latn', 'uz-Cyrl', 'ru', 'en'] as const;

export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

/** Default til — uz-Latn (docs/01-product-spec.md: asosiy auditoriya). */
export const DEFAULT_NOTIFICATION_LOCALE: NotificationLocale = 'uz-Latn';

// --- Shablon kalitlari ----------------------------------------------------------

/**
 * Notification.templateKey — "i18n kaliti, matn EMAS" (prisma/schema.prisma).
 * Ro'yxat qat'iy: yangi xabar turi shu ro'yxatga va templates.ts registry'ga
 * BIRGA qo'shiladi.
 */
export const TEMPLATE_KEYS = [
  'round.completed',
  'payment.completed',
  'refund.issued',
  'fairplay.case_opened',
  'game.finished',
  // --- Tranzaksion (auth) — transactional-mail.port.ts orqali ---------------
  //  Bu kalitlar `notifyUsers` yo'lidan O'TMAYDI: ular tasdiqlanmagan
  //  manzilga ketishi shart va Notification qatori yaratmaydi.
  'auth.verify_email',
  'auth.password_reset',
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

// --- Qator (row) shakllari ------------------------------------------------------

/** `notifications` jadvali qatori — repository qaytaradigan shakl. */
export interface NotificationRow {
  id: string;
  userId: string;
  channel: NotificationChannelValue;
  templateKey: string;
  /**
   * Shablon o'zgaruvchilari + MAJBURIY `eventId` maydoni — idempotentlik
   * kaliti (notification.repository.ts createBatchIdempotent izohi).
   */
  payload: Record<string, unknown>;
  sentAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

/**
 * Qabul qiluvchi — kanal tanlash uchun kerak bo'lgan minimal User kesimi.
 * EMAIL faqat `emailVerified` bo'lsa yuboriladi (docs/10-security.md:
 * tasdiqlanmagan manzilga yozmaymiz — spam/enumeration xavfi).
 */
export interface RecipientUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  /** User.locale — erkin string; templates.ts normalizeLocale bilan keltiradi. */
  locale: string;
}

/** API javobidagi ko'rinish — yetkazish ichki maydonlarisiz (failureReason). */
export interface NotificationView {
  id: string;
  channel: NotificationChannelValue;
  templateKey: string;
  payload: Record<string, unknown>;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

// --- Event konvertlari ----------------------------------------------------------

/**
 * OutboxPublisher emitAsync bilan yuboradigan konvert shakli
 * (src/shared/outbox/outbox.publisher.ts poll()).
 */
export interface OutboxEventEnvelope {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  /** JSON — tinglovchi defensiv parse qiladi (asRecord). */
  payload: unknown;
}
