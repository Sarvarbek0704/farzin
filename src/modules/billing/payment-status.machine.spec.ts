import { BusinessRuleError } from '../../core/errors/domain.error';
import type { PaymentStatusValue } from './billing.types';
import {
  assertPaymentTransition,
  assertRefundPath,
  canTransitionPayment,
} from './payment-status.machine';

/**
 * To'lov holat mashinasi — docs/09 §5 jadvali (UPPERCASE, schema enum).
 * Terminal holatdan chiqish YO'Q (docs/09 §5.2, acceptance §13).
 */
describe('payment-status.machine', () => {
  const TERMINAL: PaymentStatusValue[] = ['FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'];
  const ALL: PaymentStatusValue[] = [
    'CREATED',
    'PENDING',
    'PAID',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
    'REFUND_REQUESTED',
    'REFUNDED',
  ];

  it("docs/09 §5.1 jadvalidagi o'tishlar ruxsatli", () => {
    expect(canTransitionPayment('CREATED', 'PENDING')).toBe(true);
    expect(canTransitionPayment('CREATED', 'CANCELLED')).toBe(true);
    expect(canTransitionPayment('CREATED', 'EXPIRED')).toBe(true);
    expect(canTransitionPayment('PENDING', 'PAID')).toBe(true);
    expect(canTransitionPayment('PENDING', 'FAILED')).toBe(true);
    expect(canTransitionPayment('PAID', 'REFUND_REQUESTED')).toBe(true);
    expect(canTransitionPayment('REFUND_REQUESTED', 'REFUNDED')).toBe(true);
    expect(canTransitionPayment('REFUND_REQUESTED', 'PAID')).toBe(true);
  });

  it('MANUAL chetlanishi hujjatlangan: CREATED → PAID ruxsatli', () => {
    // Naqd oqimda checkout-redirect yo'q — PENDING bosqichi ma'nosiz
    // (payment-status.machine.ts izohi).
    expect(canTransitionPayment('CREATED', 'PAID')).toBe(true);
  });

  it('terminal holatdan chiqish IMKONSIZ (docs/09 §5.2)', () => {
    for (const from of TERMINAL) {
      for (const to of ALL) {
        expect(canTransitionPayment(from, to)).toBe(false);
      }
    }
  });

  it("noqonuniy o'tish ILLEGAL_PAYMENT_TRANSITION (422) tashlaydi", () => {
    expect(() => {
      assertPaymentTransition('REFUNDED', 'PAID');
    }).toThrow(BusinessRuleError);

    let caught: unknown;
    try {
      assertPaymentTransition('FAILED', 'PAID');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BusinessRuleError);
    expect((caught as BusinessRuleError).code).toBe('ILLEGAL_PAYMENT_TRANSITION');
    expect((caught as BusinessRuleError).httpStatus).toBe(422);
  });

  it("refund yo'li faqat PAID dan boshlanadi", () => {
    expect(() => {
      assertRefundPath('PAID');
    }).not.toThrow();
    for (const from of ['CREATED', 'PENDING', 'FAILED', 'REFUNDED'] as PaymentStatusValue[]) {
      expect(() => {
        assertRefundPath(from);
      }).toThrow(BusinessRuleError);
    }
  });
});
