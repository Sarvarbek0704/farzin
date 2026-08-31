import fc from 'fast-check';

import {
  aggregateSuspicion,
  SIGNAL_WEIGHTS,
  type SuspicionSignal,
  type SuspicionSignalKind,
} from './suspicion-aggregation';

/**
 * Signal jamlash — docs/08-fair-play.md §3.3 (Bosqich 2: sodda,
 * tushuntiriladigan skor). Property testlar: skor har doim 0..1,
 * kirishlarda monoton, RATING_JUMP hech qachon ta'sir qilmaydi (§2.3).
 */
describe('core/fairplay/suspicion-aggregation', () => {
  const KINDS: readonly SuspicionSignalKind[] = [
    'ENGINE_CORRELATION',
    'TIMING_ANOMALY',
    'RATING_JUMP',
    'BROWSER_FOCUS_LOSS',
    'DEVICE_FINGERPRINT',
    'MULTI_ACCOUNT',
    'MANUAL_REPORT',
  ];

  const signalArb = fc.record({
    kind: fc.constantFrom(...KINDS),
    strength: fc.double({ min: -0.5, max: 1.5, noNaN: true }),
  });

  it("bo'sh kirish → null (skor yo'q ≠ skor past)", () => {
    expect(aggregateSuspicion([])).toBeNull();
  });

  it('bitta kuchli TIMING_ANOMALY → skor aynan shu kuch (renormallashtirish)', () => {
    expect(aggregateSuspicion([{ kind: 'TIMING_ANOMALY', strength: 0.8 }])).toBeCloseTo(0.8, 10);
  });

  it('PROPERTY: skor har doim 0..1 yoki null', () => {
    fc.assert(
      fc.property(fc.array(signalArb, { maxLength: 20 }), (signals) => {
        const score = aggregateSuspicion(signals);
        return score === null || (score >= 0 && score <= 1);
      }),
    );
  });

  it('PROPERTY: monotonlik — signal kuchayishi skorni pasaytirmaydi', () => {
    fc.assert(
      fc.property(
        fc.array(signalArb, { minLength: 1, maxLength: 10 }),
        fc.nat({ max: 9 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (signals, indexSeed, bump) => {
          const i = indexSeed % signals.length;
          const base = signals[i]!;
          const bumped: SuspicionSignal[] = signals.map((s, j) =>
            j === i
              ? { kind: s.kind, strength: Math.min(1, Math.max(0, base.strength) + bump) }
              : s,
          );
          const before = aggregateSuspicion(signals) ?? 0;
          const after = aggregateSuspicion(bumped) ?? 0;
          // Kichik floating xatoga chidamli taqqoslash.
          return after >= before - 1e-12;
        },
      ),
    );
  });

  it("PROPERTY: RATING_JUMP skorni HECH QACHON o'zgartirmaydi (docs/08 §2.3 — kod darajasida)", () => {
    fc.assert(
      fc.property(
        fc.array(signalArb, { maxLength: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (signals, jumpStrength) => {
          const withoutJump = signals.filter((s) => s.kind !== 'RATING_JUMP');
          const withJump: SuspicionSignal[] = [
            ...withoutJump,
            { kind: 'RATING_JUMP', strength: jumpStrength },
          ];
          return aggregateSuspicion(withoutJump) === aggregateSuspicion(withJump);
        },
      ),
    );
  });

  it('faqat RATING_JUMP → null (ish ochish uchun asos EMAS, §2.3)', () => {
    expect(aggregateSuspicion([{ kind: 'RATING_JUMP', strength: 1 }])).toBeNull();
    expect(SIGNAL_WEIGHTS.RATING_JUMP).toBe(0);
  });

  it('bir xil turdagi bir nechta signal — eng kuchlisi olinadi', () => {
    const one = aggregateSuspicion([{ kind: 'TIMING_ANOMALY', strength: 0.9 }]);
    const many = aggregateSuspicion([
      { kind: 'TIMING_ANOMALY', strength: 0.2 },
      { kind: 'TIMING_ANOMALY', strength: 0.9 },
      { kind: 'TIMING_ANOMALY', strength: 0.5 },
    ]);
    expect(many).toBe(one);
  });

  it("kuch chegaradan tashqarida bo'lsa clamp qilinadi", () => {
    expect(aggregateSuspicion([{ kind: 'MANUAL_REPORT', strength: 7 }])).toBe(1);
    expect(aggregateSuspicion([{ kind: 'MANUAL_REPORT', strength: -3 }])).toBe(0);
  });
});
