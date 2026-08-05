/**
 * Idempotency-Key semantikasi — SOF qism (unit testlanadi).
 *
 * docs/04-api-spec.md §5 va docs/09-payments-and-billing.md §3.2:
 *  - bir xil kalit + bir xil so'rov → saqlangan natija QAYTARILADI,
 *    operatsiya QAYTA BAJARILMAYDI (replay);
 *  - bir xil kalit + BOSHQA so'rov → 422 IDEMPOTENCY_KEY_REUSE.
 *
 * "So'rov mazmuni" bu oqimda ikkita maydon: invoiceId + provider —
 * `Payment` jadvalining o'zi saqlaydigan yagona kirish. Alohida
 * fingerprint ustuni yo'q (schema haqiqat manbai), shuning uchun
 * taqqoslash to'g'ridan-to'g'ri semantik maydonlar ustida.
 *
 * Concurrency darvozasi esa DB'da: `Payment.idempotencyKey @unique` —
 * parallel ikki so'rovdan bittasi INSERT'da yutadi, ikkinchisi P2002
 * oladi va shu funksiya orqali replay/konflikt deb baholanadi.
 */

export interface IdempotentInitiateRequest {
  readonly invoiceId: string;
  readonly provider: string;
}

export type IdempotencyOutcome = 'REPLAY' | 'CONFLICT';

export function evaluateIdempotentInitiate(
  existing: IdempotentInitiateRequest,
  incoming: IdempotentInitiateRequest,
): IdempotencyOutcome {
  return existing.invoiceId === incoming.invoiceId && existing.provider === incoming.provider
    ? 'REPLAY'
    : 'CONFLICT';
}
