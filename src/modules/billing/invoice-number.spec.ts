import {
  formatInvoiceNumber,
  INVOICE_NUMBER_PATTERN,
  nextInvoiceSequence,
  parseInvoiceSequence,
} from './invoice-number';

describe('invoice-number — FRZ-YYYY-NNNNNN', () => {
  it('formatlash: 6 xonaga to\'ldiriladi', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('FRZ-2026-000001');
    expect(formatInvoiceNumber(2026, 42)).toBe('FRZ-2026-000042');
    expect(formatInvoiceNumber(2026, 999_999)).toBe('FRZ-2026-999999');
  });

  it('format schema izohi bilan mos (Invoice.number)', () => {
    expect(INVOICE_NUMBER_PATTERN.test('FRZ-2026-000001')).toBe(true);
    expect(INVOICE_NUMBER_PATTERN.test('FRZ-26-000001')).toBe(false);
    expect(INVOICE_NUMBER_PATTERN.test('FRZ-2026-1')).toBe(false);
    expect(INVOICE_NUMBER_PATTERN.test('INV-2026-000001')).toBe(false);
  });

  it("noto'g'ri yil yoki tartib — RangeError (chegara himoyasi)", () => {
    expect(() => formatInvoiceNumber(1999, 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2026, 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2026, 1_000_000)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2026, 1.5)).toThrow(RangeError);
  });

  it('parse: raqamdan tartib', () => {
    expect(parseInvoiceSequence('FRZ-2026-000042')).toBe(42);
    expect(parseInvoiceSequence('buzuq')).toBeNull();
  });

  it("keyingi tartib: oxirgisidan +1; yo'q/buzuq → 1", () => {
    expect(nextInvoiceSequence(null)).toBe(1);
    expect(nextInvoiceSequence('FRZ-2026-000041')).toBe(42);
    expect(nextInvoiceSequence('buzuq-qiymat')).toBe(1);
  });

  it('format ↔ parse round-trip', () => {
    for (const seq of [1, 7, 100, 54_321, 999_999]) {
      expect(parseInvoiceSequence(formatInvoiceNumber(2026, seq))).toBe(seq);
    }
  });
});
