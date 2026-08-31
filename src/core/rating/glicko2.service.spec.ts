import fc from 'fast-check';

import { Glicko2Service } from './glicko2.service';
import { DEFAULT_GLICKO2_CONFIG, type MatchOutcome, type RatingSnapshot } from './glicko2.types';

/**
 * Glicko-2 testlari.
 *
 * 1. GOLDEN — Glickman (2012) rasmiy test vektori. BU TEST HECH QACHON
 *    O'ZGARTIRILMAYDI: u yiqilsa — implementatsiya xato, test emas.
 *    docs/13-testing-strategy.md §6.2
 *
 * 2. PROPERTY — invariantlar (fast-check). docs/13-testing-strategy.md §5.3
 */
describe('Glicko2Service', () => {
  const service = new Glicko2Service();

  const snapshot = (rating: number, deviation: number, volatility = 0.06): RatingSnapshot => ({
    rating,
    deviation,
    volatility,
  });

  describe('Glickman rasmiy test vektori', () => {
    // Input: r=1500, RD=200, σ=0.06, τ=0.5
    // Kutilgan: r' ≈ 1464.05, RD' ≈ 151.52, σ' ≈ 0.05999 (tolerantlik ±0.01)
    //
    // ⚠️ Maqolada 1464.06 — YAXLITLANGAN oraliq qiymatlar natijasi.
    //    To'liq aniqlikda to'g'ri javob 1464.05. docs/06-rating-system.md §12.1
    const player = snapshot(1500, 200, 0.06);
    const outcomes: MatchOutcome[] = [
      { opponent: snapshot(1400, 30), score: 1 },
      { opponent: snapshot(1550, 100), score: 0 },
      { opponent: snapshot(1700, 300), score: 0 },
    ];

    it("r' ≈ 1464.05 (±0.01)", () => {
      const result = service.compute(player, outcomes);
      expect(Math.abs(result.rating - 1464.05)).toBeLessThanOrEqual(0.01);
    });

    it("RD' ≈ 151.52 (±0.01)", () => {
      const result = service.compute(player, outcomes);
      expect(Math.abs(result.deviation - 151.52)).toBeLessThanOrEqual(0.01);
    });

    it("σ' ≈ 0.05999 (±0.0001)", () => {
      const result = service.compute(player, outcomes);
      expect(Math.abs(result.volatility - 0.05999)).toBeLessThanOrEqual(0.0001);
    });
  });

  describe("o'ynalmagan davr", () => {
    it("RD o'sadi, reyting va volatility o'zgarmaydi", () => {
      const before = snapshot(1650, 80, 0.06);
      const after = service.compute(before, []);

      expect(after.rating).toBe(1650);
      expect(after.volatility).toBe(0.06);
      expect(after.deviation).toBeGreaterThan(80);
      // φ' = sqrt(φ² + σ²) — qo'lda hisoblangan qiymat bilan
      const expected = Math.sqrt(80 ** 2 + (0.06 * 173.7178) ** 2);
      expect(after.deviation).toBeCloseTo(expected, 6);
    });

    it('RD 350 dan oshmaydi (clamp) — docs/06 §3.4', () => {
      const before = snapshot(1500, 349.9, 0.1);
      const after = service.compute(before, []);
      expect(after.deviation).toBe(350);
    });
  });

  describe('chegaralar (docs/06-rating-system.md §4.3)', () => {
    it('RD hech qachon 30 dan past tushmaydi', () => {
      // Juda past RD li o'yinchi ko'p o'yin o'ynaganda
      const player = snapshot(2000, 31, 0.02);
      const outcomes: MatchOutcome[] = Array.from({ length: 20 }, () => ({
        opponent: snapshot(2000, 40),
        score: 0.5 as const,
      }));
      const result = service.compute(player, outcomes);
      expect(result.deviation).toBeGreaterThanOrEqual(30);
    });
  });

  describe('property testlar', () => {
    const ratingArb = fc.double({ min: 400, max: 2900, noNaN: true });
    const rdArb = fc.double({ min: 30, max: 350, noNaN: true });
    const volArb = fc.double({ min: 0.01, max: 0.1, noNaN: true });
    const scoreArb = fc.constantFrom<0 | 0.5 | 1>(0, 0.5, 1);

    const snapshotArb = fc.record({
      rating: ratingArb,
      deviation: rdArb,
      volatility: volArb,
    });

    const outcomesArb = fc.array(fc.record({ opponent: snapshotArb, score: scoreArb }), {
      minLength: 0,
      maxLength: 15,
    });

    it("natija har doim chekli va chegaralar ichida (NaN/Infinity yo'q)", () => {
      fc.assert(
        fc.property(snapshotArb, outcomesArb, (current, outcomes) => {
          const result = service.compute(current, outcomes);
          expect(Number.isFinite(result.rating)).toBe(true);
          expect(Number.isFinite(result.deviation)).toBe(true);
          expect(Number.isFinite(result.volatility)).toBe(true);
          expect(result.deviation).toBeGreaterThanOrEqual(30);
          expect(result.deviation).toBeLessThanOrEqual(350);
          expect(result.volatility).toBeGreaterThanOrEqual(0.01);
          expect(result.volatility).toBeLessThanOrEqual(0.1);
          expect(result.rating).toBeGreaterThanOrEqual(100);
        }),
        { numRuns: 500 },
      );
    });

    it('determinizm: bir xil input → bir xil output', () => {
      fc.assert(
        fc.property(snapshotArb, outcomesArb, (current, outcomes) => {
          const a = service.compute(current, outcomes);
          const b = service.compute(current, outcomes);
          expect(a).toEqual(b);
        }),
        { numRuns: 200 },
      );
    });

    it("monotonlik: g'alaba mag'lubiyatdan har doim yuqori reyting beradi", () => {
      fc.assert(
        fc.property(snapshotArb, snapshotArb, (current, opponent) => {
          const win = service.compute(current, [{ opponent, score: 1 }]);
          const loss = service.compute(current, [{ opponent, score: 0 }]);
          expect(win.rating).toBeGreaterThan(loss.rating);
        }),
        { numRuns: 300 },
      );
    });

    it("o'z darajasidagi raqiblar bilan o'ynash RD ni kamaytiradi", () => {
      // Diqqat: bu invariant FAQAT ma'lumotli o'yinlar uchun.
      // Juda kutilmagan natija (400 reytingli 2600 ni yutsa) volatility'ni
      // oshiradi va RD o'sishi MUMKIN — bu Glicko-2 ning to'g'ri
      // xatti-harakati, bug emas. Shuning uchun raqiblar o'yinchining
      // ±200 oralig'idan olinadi.
      fc.assert(
        fc.property(
          fc.double({ min: 800, max: 2400, noNaN: true }),
          fc.double({ min: 150, max: 350, noNaN: true }),
          fc.array(
            fc.record({
              ratingOffset: fc.double({ min: -200, max: 200, noNaN: true }),
              rd: fc.double({ min: 30, max: 120, noNaN: true }),
              score: scoreArb,
            }),
            { minLength: 3, maxLength: 10 },
          ),
          (rating, deviation, games) => {
            const before = { rating, deviation, volatility: 0.06 };
            const outcomes = games.map((game) => ({
              opponent: {
                rating: rating + game.ratingOffset,
                deviation: game.rd,
                volatility: 0.06,
              },
              score: game.score,
            }));
            const after = service.compute(before, outcomes);
            expect(after.deviation).toBeLessThan(deviation);
          },
        ),
        { numRuns: 300 },
      );
    });

    it("o'ynamagan davr: RD kamaymaydi", () => {
      fc.assert(
        fc.property(snapshotArb, (current) => {
          const after = service.compute(current, []);
          expect(after.deviation).toBeGreaterThanOrEqual(Math.min(current.deviation, 350));
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('konfiguratsiya', () => {
    it('default konfiguratsiya Glickman qiymatlari bilan', () => {
      expect(DEFAULT_GLICKO2_CONFIG.tau).toBe(0.5);
      expect(DEFAULT_GLICKO2_CONFIG.epsilon).toBe(0.000001);
      expect(DEFAULT_GLICKO2_CONFIG.defaultRating).toBe(1500);
      expect(DEFAULT_GLICKO2_CONFIG.defaultDeviation).toBe(350);
      expect(DEFAULT_GLICKO2_CONFIG.defaultVolatility).toBe(0.06);
    });
  });
});
