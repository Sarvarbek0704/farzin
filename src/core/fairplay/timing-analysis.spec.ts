import {
  analyzeTiming,
  clamp01,
  CV_REFERENCE,
  mean,
  OPENING_PLIES_EXCLUDED,
  PREMOVE_THRESHOLD_MS,
  standardDeviation,
  TIMING_MIN_SAMPLE,
  variance,
  type TimedPly,
} from './timing-analysis';

/**
 * Vaqt fingerprint — docs/08-fair-play.md §2.2.
 *
 * Qo'lda qurilgan seriyalar: bir tekis (bot-simon) → yuqori kuch;
 * inson-simon o'zgaruvchan → past kuch; qisqa seriya → null (shovqindan
 * signal chiqmaydi, §9.3).
 */
describe('core/fairplay/timing-analysis', () => {
  /** ply raqamlari debyutdan keyin boshlanadigan seriya quradi. */
  function series(times: readonly (number | null)[]): TimedPly[] {
    return times.map((t, i) => ({
      ply: OPENING_PLIES_EXCLUDED + 1 + i * 2, // bitta o'yinchining yarim-yurishlari
      thinkTimeMs: t,
    }));
  }

  it('bir tekis bot-simon seriya → yuqori kuch (past dispersiya = shubhali NAQSH, isbot emas)', () => {
    // Har yurish ~4s — "ko'chirish → o'qish → qaytarish" jarayoni (§2.2).
    const times = Array.from({ length: 30 }, (_, i) => 4_000 + (i % 3) * 50);
    const result = analyzeTiming(series(times));

    expect(result).not.toBeNull();
    expect(result!.sampleSize).toBe(30);
    expect(result!.coefficientOfVariation).toBeLessThan(0.05);
    expect(result!.strength).toBeGreaterThan(0.9);
  });

  it("inson-simon og'ir dumli seriya → past kuch", () => {
    // Oson yurishlar 2-5s, ba'zida 30-90s chuqur o'ylash (§2.2 tavsifi).
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      times.push(i % 5 === 0 ? 45_000 + i * 1_000 : 2_000 + (i % 7) * 700);
    }
    const result = analyzeTiming(series(times));

    expect(result).not.toBeNull();
    // CV katta — kuch 0 yoki juda past.
    expect(result!.coefficientOfVariation).toBeGreaterThan(CV_REFERENCE);
    expect(result!.strength).toBe(0);
  });

  it("qisqa seriya → null (§9.3 minimal namuna — shovqindan signal YO'Q)", () => {
    const times = Array.from({ length: TIMING_MIN_SAMPLE - 1 }, () => 5_000);
    expect(analyzeTiming(series(times))).toBeNull();
  });

  it("bo'sh kirish → null", () => {
    expect(analyzeTiming([])).toBeNull();
  });

  it('premove (<100ms) va null vaqtlar chiqariladi (§2.2 premove ≠ chit)', () => {
    const good = Array.from({ length: TIMING_MIN_SAMPLE }, () => 5_000);
    const withNoise: (number | null)[] = [...good, 0, 50, PREMOVE_THRESHOLD_MS - 1, null];
    const result = analyzeTiming(series(withNoise));

    expect(result).not.toBeNull();
    expect(result!.sampleSize).toBe(TIMING_MIN_SAMPLE);
    expect(result!.excludedCount).toBe(4);
  });

  it("faqat premove'lardan iborat seriya → null (0 ga bo'linish yo'q)", () => {
    const times = Array.from({ length: 40 }, () => 0);
    expect(analyzeTiming(series(times))).toBeNull();
  });

  it('debyut yarim-yurishlari chiqariladi (§2.1 nazariya ≠ chit; bookPlies ochiq parametr)', () => {
    // Hammasi debyut ichida — natija null bo'lishi kerak.
    const inBook: TimedPly[] = Array.from({ length: 40 }, (_, i) => ({
      ply: Math.min(i + 1, OPENING_PLIES_EXCLUDED),
      thinkTimeMs: 3_000,
    }));
    expect(analyzeTiming(inBook)).toBeNull();
  });

  it("kuch har doim 0..1 oralig'ida", () => {
    for (const spread of [0, 100, 1_000, 20_000, 200_000]) {
      const times = Array.from({ length: 30 }, (_, i) => 3_000 + (i % 2) * spread);
      const result = analyzeTiming(series(times));
      if (result !== null) {
        expect(result.strength).toBeGreaterThanOrEqual(0);
        expect(result.strength).toBeLessThanOrEqual(1);
      }
    }
  });

  describe('statistika yordamchilari', () => {
    it("mean/variance/stddev — qo'lda tekshirilgan qiymatlar", () => {
      expect(mean([2, 4, 6])).toBe(4);
      expect(variance([2, 4, 6])).toBeCloseTo(8 / 3, 10);
      expect(standardDeviation([5, 5, 5])).toBe(0);
      expect(mean([])).toBe(0);
      expect(variance([])).toBe(0);
    });

    it('clamp01 — chegara va NaN himoyasi', () => {
      expect(clamp01(-1)).toBe(0);
      expect(clamp01(2)).toBe(1);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(Number.NaN)).toBe(0);
    });
  });
});
