import { evaluateIdempotentInitiate } from './idempotency';

/**
 * Idempotency-Key semantikasi (docs/04 §5, docs/09 §3.2):
 * bir xil kalit + bir xil mazmun → REPLAY; boshqa mazmun → CONFLICT
 * (422 IDEMPOTENCY_KEY_REUSE — service qatlamida).
 */
describe('evaluateIdempotentInitiate', () => {
  const existing = { invoiceId: 'inv-1', provider: 'MANUAL' };

  it('bir xil invoys + bir xil provayder → REPLAY', () => {
    expect(evaluateIdempotentInitiate(existing, { invoiceId: 'inv-1', provider: 'MANUAL' })).toBe(
      'REPLAY',
    );
  });

  it('boshqa provayder → CONFLICT', () => {
    expect(evaluateIdempotentInitiate(existing, { invoiceId: 'inv-1', provider: 'CLICK' })).toBe(
      'CONFLICT',
    );
  });

  it('boshqa invoys → CONFLICT', () => {
    expect(evaluateIdempotentInitiate(existing, { invoiceId: 'inv-2', provider: 'MANUAL' })).toBe(
      'CONFLICT',
    );
  });

  it('ikkalasi boshqa → CONFLICT', () => {
    expect(evaluateIdempotentInitiate(existing, { invoiceId: 'inv-2', provider: 'CLICK' })).toBe(
      'CONFLICT',
    );
  });
});
