import { BusinessRuleError } from '../../core/errors/domain.error';
import type { PaymentStatusValue } from './billing.types';

/**
 * To'lov holat mashinasi — docs/09-payments-and-billing.md §5 jadvalining
 * `PaymentStatus` enum (schema, UPPERCASE) ustidagi transkripsiyasi.
 *
 * Hujjatdan BITTA ataylab chetlanish: CREATED → PAID ruxsat etilgan.
 * Sabab: MANUAL provayderde (naqd, hakam tasdig'i) checkout-redirect
 * bosqichi YO'Q — PENDING holati ma'nosiz. Onlayn provayderlar uchun
 * odatiy yo'l baribir CREATED → PENDING → PAID bo'lib qoladi.
 *
 * Terminal holatlardan chiqish YO'Q (docs/09 §5.2): qayta to'lov —
 * YANGI Payment, eskisi tirilmaydi.
 */
const TRANSITIONS: Readonly<Record<PaymentStatusValue, readonly PaymentStatusValue[]>> = {
  CREATED: ['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'],
  PENDING: ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  PAID: ['REFUND_REQUESTED'],
  REFUND_REQUESTED: ['REFUNDED', 'PAID'],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentStatusValue, to: PaymentStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Noqonuniy o'tish — 422, kod barqaror (docs/04-api-spec.md §2.5). */
export function assertPaymentTransition(from: PaymentStatusValue, to: PaymentStatusValue): void {
  if (!canTransitionPayment(from, to)) {
    throw new BusinessRuleError(
      'ILLEGAL_PAYMENT_TRANSITION',
      `To'lov holati ${from} dan ${to} ga o'ta olmaydi`,
      { from, to },
    );
  }
}

/**
 * Refund PAID holatidan REFUNDED ga ikki qadam orqali boradi
 * (PAID → REFUND_REQUESTED → REFUNDED). MANUAL kabi sinxron
 * provayderde ikkala qadam BITTA tranzaksiyada bajariladi — bu
 * yordamchi ikkala o'tish ham qonuniyligini tasdiqlaydi.
 */
export function assertRefundPath(from: PaymentStatusValue): void {
  assertPaymentTransition(from, 'REFUND_REQUESTED');
  assertPaymentTransition('REFUND_REQUESTED', 'REFUNDED');
}
