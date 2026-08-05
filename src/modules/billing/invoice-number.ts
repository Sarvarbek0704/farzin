/**
 * Invoys raqami — 'FRZ-YYYY-NNNNNN' (schema `Invoice.number` izohi).
 * Yil ichida ketma-ket, 6 xonaga to'ldiriladi.
 *
 * Generatsiya strategiyasi (billing.repository.ts):
 * tranzaksiya ichida SELECT max(number) + 1, so'ng INSERT; parallel
 * yaratishda ikkalasi bir raqamni olishi mumkin — unique constraint
 * yutqazganni P2002 bilan yiqitadi va repository QAYTA URINADI
 * (retry). Bu sof yordamchilar unit testda tekshiriladi.
 */

export const INVOICE_NUMBER_PATTERN = /^FRZ-(\d{4})-(\d{6})$/;

export function formatInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Invoys yili noto'g'ri: ${String(year)}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new RangeError(`Invoys tartib raqami noto'g'ri: ${String(sequence)}`);
  }
  return `FRZ-${String(year)}-${String(sequence).padStart(6, '0')}`;
}

/** 'FRZ-2026-000042' → 42. Noto'g'ri format → null (yiqilmaydi). */
export function parseInvoiceSequence(number: string): number | null {
  const match = INVOICE_NUMBER_PATTERN.exec(number);
  const sequencePart = match?.[2];
  if (sequencePart === undefined) {
    return null;
  }
  return Number.parseInt(sequencePart, 10);
}

/** Yilning oxirgi raqamidan keyingisi. Oxirgisi yo'q/buzuq → 1. */
export function nextInvoiceSequence(lastNumber: string | null): number {
  if (lastNumber === null) {
    return 1;
  }
  const last = parseInvoiceSequence(lastNumber);
  return last === null ? 1 : last + 1;
}
