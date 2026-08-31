import fc from 'fast-check';

import { BusinessRuleError } from '../errors/domain.error';
import {
  applyMove,
  createClock,
  isFlagged,
  remaining,
  type ClockConfig,
  type ClockState,
} from './chess-clock';

/**
 * Soat yadrosi testlari.
 *
 * 1. QO'LDA TEKSHIRILGAN VEKTORLAR — docs/07-realtime-and-clock.md §13.1
 *    misollari (Fischer 3+2, Bronstein 5|3) aynan takrorlanadi.
 * 2. PROPERTY (fast-check, glicko2.service.spec.ts uslubi) — invariantlar:
 *    - qolgan vaqt HECH QACHON manfiy emas;
 *    - determinizm (bir xil kirish → bir xil chiqish);
 *    - increment faqat TUGALLANGAN yurishdan keyin;
 *    - flag aynan `elapsed > remaining` chegarasida.
 */
describe('chess-clock (core)', () => {
  const FISCHER_3_2: ClockConfig = {
    clockType: 'FISCHER_INCREMENT',
    baseMs: 180_000,
    incrementMs: 2_000,
  };
  const BRONSTEIN_5_3: ClockConfig = {
    clockType: 'BRONSTEIN_DELAY',
    baseMs: 300_000,
    incrementMs: 3_000,
  };
  const SUDDEN_5_0: ClockConfig = { clockType: 'SUDDEN_DEATH', baseMs: 300_000, incrementMs: 0 };
  const SIMPLE_5_3: ClockConfig = {
    clockType: 'SIMPLE_DELAY',
    baseMs: 300_000,
    incrementMs: 3_000,
  };

  describe("qo'lda tekshirilgan vektorlar", () => {
    it('Fischer 3+2: 5s sarflab yurdi → 180000 − 5000 + 2000 = 177000 (docs/07 §13.1)', () => {
      const s0 = createClock(FISCHER_3_2, 'w', 0);
      const r = applyMove(FISCHER_3_2, s0, 5_000);
      expect(r.flagged).toBe(false);
      expect(r.state.whiteRemainingMs).toBe(177_000);
      expect(r.state.blackRemainingMs).toBe(180_000);
      expect(r.state.turn).toBe('b');
      expect(r.state.lastEventAtMs).toBe(5_000);
    });

    it("Bronstein 5|3: 1s sarfladi → faqat 1s qaytadi, vaqt O'ZGARMAYDI (docs/07 §13.1)", () => {
      const s0 = createClock(BRONSTEIN_5_3, 'w', 0);
      const r = applyMove(BRONSTEIN_5_3, s0, 1_000);
      expect(r.flagged).toBe(false);
      expect(r.state.whiteRemainingMs).toBe(300_000);
    });

    it('Bronstein 5|3: 10s sarfladi → refund faqat 3s: 300000 − 10000 + 3000 = 293000', () => {
      const s0 = createClock(BRONSTEIN_5_3, 'w', 0);
      const r = applyMove(BRONSTEIN_5_3, s0, 10_000);
      expect(r.flagged).toBe(false);
      expect(r.state.whiteRemainingMs).toBe(293_000);
    });

    it('Bronstein: vaqt hech qachon yurish boshidagi qiymatdan OSHMAYDI (docs/07 §3.1)', () => {
      let state = createClock(BRONSTEIN_5_3, 'w', 0);
      let now = 0;
      for (let i = 0; i < 20; i += 1) {
        now += 500; // har yurish delay'dan tez
        const r = applyMove(BRONSTEIN_5_3, state, now);
        expect(r.flagged).toBe(false);
        state = r.state;
        expect(state.whiteRemainingMs).toBeLessThanOrEqual(300_000);
        expect(state.blackRemainingMs).toBeLessThanOrEqual(300_000);
      }
    });

    it("Sudden death: increment YO'Q — 5s sarf → 295000", () => {
      const s0 = createClock(SUDDEN_5_0, 'w', 0);
      const r = applyMove(SUDDEN_5_0, s0, 5_000);
      expect(r.flagged).toBe(false);
      expect(r.state.whiteRemainingMs).toBe(295_000);
    });

    it('Simple delay Bronstein bilan matematik ekvivalent natija beradi (docs/07 §3.1)', () => {
      for (const spent of [0, 1_000, 3_000, 3_001, 10_000]) {
        const b = applyMove(BRONSTEIN_5_3, createClock(BRONSTEIN_5_3, 'w', 0), spent);
        const s = applyMove(SIMPLE_5_3, createClock(SIMPLE_5_3, 'w', 0), spent);
        expect(b.flagged).toBe(s.flagged);
        expect(b.state.whiteRemainingMs).toBe(s.state.whiteRemainingMs);
      }
    });

    it("MULTI_STAGE → NOT_IMPLEMENTED (docs/07 §3.2: stage konfiguratsiyasi schema'da yo'q)", () => {
      const cfg: ClockConfig = {
        clockType: 'MULTI_STAGE',
        baseMs: 90 * 60_000,
        incrementMs: 30_000,
      };
      expect(() => createClock(cfg, 'w', 0)).toThrow(BusinessRuleError);
      try {
        createClock(cfg, 'w', 0);
      } catch (e) {
        expect((e as BusinessRuleError).code).toBe('CLOCK_TYPE_NOT_IMPLEMENTED');
      }
    });
  });

  describe('flag chegarasi — aynan elapsed > remaining', () => {
    it('elapsed === remaining → flag EMAS, qolgan vaqt 0 (+increment)', () => {
      const s0 = createClock(FISCHER_3_2, 'w', 0);
      expect(isFlagged(FISCHER_3_2, s0, 180_000)).toBe(false);
      const r = applyMove(FISCHER_3_2, s0, 180_000);
      expect(r.flagged).toBe(false);
      expect(r.state.whiteRemainingMs).toBe(2_000); // 0 + Fischer increment
    });

    it('elapsed = remaining + 1 → FLAG, yuruvchi 0 ga clamp', () => {
      const s0 = createClock(FISCHER_3_2, 'w', 0);
      expect(isFlagged(FISCHER_3_2, s0, 180_001)).toBe(true);
      const r = applyMove(FISCHER_3_2, s0, 180_001);
      expect(r.flagged).toBe(true);
      expect(r.state.whiteRemainingMs).toBe(0);
      expect(r.state.turn).toBe('w'); // navbat almashmaydi — o'yin tugadi
    });

    it("Bronstein flag: delay chegarani SURADI — chargeable > remaining bo'lgandagina", () => {
      const s0 = createClock(BRONSTEIN_5_3, 'w', 0);
      // 300s baza + 3s delay: 303_000 da chargeable = 300_000 → flag emas
      expect(isFlagged(BRONSTEIN_5_3, s0, 303_000)).toBe(false);
      expect(isFlagged(BRONSTEIN_5_3, s0, 303_001)).toBe(true);
    });

    it('NTP orqaga sakrashi (nowMs < lastEventAtMs) → elapsed 0 ga clamp, vaqt olinmaydi', () => {
      const s0 = createClock(SUDDEN_5_0, 'w', 1_000_000);
      const r = applyMove(SUDDEN_5_0, s0, 999_000);
      expect(r.flagged).toBe(false);
      expect(r.state.whiteRemainingMs).toBe(300_000);
    });
  });

  describe("remaining — jonli ko'rinish", () => {
    it("navbati bo'lmagan tomon soati YURMAYDI", () => {
      const s0 = createClock(SUDDEN_5_0, 'w', 0);
      expect(remaining(SUDDEN_5_0, s0, 'b', 200_000)).toBe(300_000);
      expect(remaining(SUDDEN_5_0, s0, 'w', 200_000)).toBe(100_000);
    });

    it('simple delay: delay ichida displey qiymati kamayMAYDI', () => {
      const s0 = createClock(SIMPLE_5_3, 'w', 0);
      expect(remaining(SIMPLE_5_3, s0, 'w', 2_999)).toBe(300_000);
      expect(remaining(SIMPLE_5_3, s0, 'w', 4_000)).toBe(299_000);
    });

    it('0 dan pastga tushmaydi', () => {
      const s0 = createClock(SUDDEN_5_0, 'w', 0);
      expect(remaining(SUDDEN_5_0, s0, 'w', 999_999_999)).toBe(0);
    });
  });

  describe('property testlar (fast-check)', () => {
    const configArb: fc.Arbitrary<ClockConfig> = fc.record({
      clockType: fc.constantFrom<ClockConfig['clockType']>(
        'SUDDEN_DEATH',
        'FISCHER_INCREMENT',
        'BRONSTEIN_DELAY',
        'SIMPLE_DELAY',
      ),
      baseMs: fc.integer({ min: 1_000, max: 2 * 60 * 60_000 }),
      incrementMs: fc.integer({ min: 0, max: 60_000 }),
    });

    /** Yurishlar orasidagi o'ylash vaqtlari (ms). */
    const thinksArb = fc.array(fc.integer({ min: 0, max: 120_000 }), {
      minLength: 1,
      maxLength: 60,
    });

    it("qolgan vaqt HECH QACHON manfiy bo'lmaydi (clamp 0)", () => {
      fc.assert(
        fc.property(configArb, thinksArb, (cfg, thinks) => {
          let state: ClockState = createClock(cfg, 'w', 0);
          let now = 0;
          for (const t of thinks) {
            now += t;
            expect(remaining(cfg, state, 'w', now)).toBeGreaterThanOrEqual(0);
            expect(remaining(cfg, state, 'b', now)).toBeGreaterThanOrEqual(0);
            const r = applyMove(cfg, state, now);
            expect(r.state.whiteRemainingMs).toBeGreaterThanOrEqual(0);
            expect(r.state.blackRemainingMs).toBeGreaterThanOrEqual(0);
            if (r.flagged) {
              break;
            }
            state = r.state;
          }
        }),
        { numRuns: 300 },
      );
    });

    it('deterministik: bir xil kirish → bir xil chiqish', () => {
      fc.assert(
        fc.property(configArb, thinksArb, (cfg, thinks) => {
          const run = (): ClockState => {
            let state: ClockState = createClock(cfg, 'w', 0);
            let now = 0;
            for (const t of thinks) {
              now += t;
              const r = applyMove(cfg, state, now);
              if (r.flagged) {
                return r.state;
              }
              state = r.state;
            }
            return state;
          };
          expect(run()).toEqual(run());
        }),
        { numRuns: 200 },
      );
    });

    it("increment faqat TUGALLANGAN yurishdan keyin — flag bo'lgan yurishda increment yo'q", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000, max: 600_000 }),
          fc.integer({ min: 1, max: 60_000 }),
          (baseMs, incrementMs) => {
            const cfg: ClockConfig = { clockType: 'FISCHER_INCREMENT', baseMs, incrementMs };
            const s0 = createClock(cfg, 'w', 0);

            // Tugallangan yurish: increment qo'shiladi.
            const ok = applyMove(cfg, s0, baseMs);
            expect(ok.flagged).toBe(false);
            if (!ok.flagged) {
              expect(ok.state.whiteRemainingMs).toBe(incrementMs);
            }

            // Kechikkan yurish (flag): increment YO'Q, 0 ga clamp.
            const late = applyMove(cfg, s0, baseMs + 1);
            expect(late.flagged).toBe(true);
            expect(late.state.whiteRemainingMs).toBe(0);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('flag AYNAN elapsed > remaining chegarasida (SD/Fischer)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000, max: 600_000 }),
          fc.constantFrom<ClockConfig['clockType']>('SUDDEN_DEATH', 'FISCHER_INCREMENT'),
          (baseMs, clockType) => {
            const cfg: ClockConfig = { clockType, baseMs, incrementMs: 500 };
            const s0 = createClock(cfg, 'w', 0);
            expect(isFlagged(cfg, s0, baseMs)).toBe(false);
            expect(isFlagged(cfg, s0, baseMs + 1)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("navbat har tugallangan yurishda almashadi, boshqa tomon vaqti O'ZGARMAYDI", () => {
      fc.assert(
        fc.property(configArb, fc.integer({ min: 0, max: 1_000 }), (cfg, think) => {
          const s0 = createClock(cfg, 'w', 0);
          const r = applyMove(cfg, s0, think);
          expect(r.flagged).toBe(false);
          if (!r.flagged) {
            expect(r.state.turn).toBe('b');
            expect(r.state.blackRemainingMs).toBe(cfg.baseMs);
          }
        }),
        { numRuns: 200 },
      );
    });
  });
});
