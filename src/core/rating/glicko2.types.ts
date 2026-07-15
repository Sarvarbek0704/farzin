/**
 * Glicko-2 reyting tizimi — tiplar.
 *
 * Sof TypeScript. Framework bog'liqligi yo'q (ADR-0001).
 *
 * @see docs/06-rating-system.md
 * @see docs/adr/0003-glicko2-over-elo.md
 */

/** Glicko-2 ning uchta parametri. Elo'da faqat birinchisi bor. */
export interface RatingSnapshot {
  /** Kuch bahosi. Boshlang'ich: 1500 */
  readonly rating: number;

  /**
   * Rating deviation — bahoning NOANIQLIGI.
   * Boshlang'ich: 350 (hech narsa bilmaymiz).
   * Kam o'ynagan yoki uzoq o'ynamagan → yuqori.
   */
  readonly deviation: number;

  /**
   * Volatility — natijalarning BEQARORLIGI.
   * Boshlang'ich: 0.06.
   * Kutilmagan natijalar ketma-ketligi → o'sadi → reyting tezroq moslashadi.
   */
  readonly volatility: number;
}

/** O'yin natijasi o'yinchi nuqtai nazaridan. */
export interface MatchOutcome {
  readonly opponent: RatingSnapshot;
  /** 1 = g'alaba, 0.5 = durang, 0 = mag'lubiyat */
  readonly score: 0 | 0.5 | 1;
}

export interface Glicko2Config {
  /**
   * Sistema konstantasi τ.
   *
   * Volatility o'zgarishini cheklaydi. Glickman tavsiyasi: 0.3–1.2.
   *  - Kichik τ → reyting barqaror, lekin sekin moslashadi
   *  - Katta τ  → tez moslashadi, lekin shovqinli
   *
   * ⚠️  Farzin uchun boshlang'ich: 0.5. Bu YAKUNIY EMAS —
   *     real ma'lumotda backtest bilan aniqlanishi kerak (Faza 3).
   */
  readonly tau: number;

  /** Volatility iteratsiyasining konvergensiya chegarasi. Glickman: 0.000001 */
  readonly epsilon: number;

  /** Iteratsiya cheklovi — cheksiz sikldan himoya. */
  readonly maxIterations: number;

  readonly defaultRating: number;
  readonly defaultDeviation: number;
  readonly defaultVolatility: number;
}

export const DEFAULT_GLICKO2_CONFIG: Glicko2Config = Object.freeze({
  tau: 0.5,
  epsilon: 0.000001,
  maxIterations: 100,
  defaultRating: 1500,
  defaultDeviation: 350,
  defaultVolatility: 0.06,
});

/** Glicko-2 shkalasiga o'tish koeffitsienti: 173.7178 */
export const GLICKO2_SCALE = 173.7178;

export class Glicko2ConvergenceError extends Error {
  constructor(iterations: number) {
    super(
      `Volatility iteratsiyasi ${String(iterations)} qadamda yaqinlashmadi. ` +
        "Bu implementatsiya xatosi yoki g'ayrioddiy input alomati.",
    );
    this.name = 'Glicko2ConvergenceError';
    Object.setPrototypeOf(this, Glicko2ConvergenceError.prototype);
  }
}

/**
 * Glicko-2 hisoblagichi — port.
 *
 * KAFOLATLAR:
 *  1. Sof funksiya — holat saqlamaydi, yon ta'siri yo'q
 *  2. Determinstik — bir xil input → bir xil output
 *  3. `deviation` hech qachon manfiy emas
 *  4. `volatility` oqilona chegarada qoladi
 *
 * Bular property-based test bilan tekshiriladi (docs/13-testing-strategy.md §5).
 */
export interface Glicko2Calculator {
  /**
   * Bir rating period uchun yangi reyting.
   *
   * @param current  Davr BOSHIDAGI holat
   * @param outcomes Davrdagi barcha o'yinlar. Bo'sh bo'lsa — faqat RD o'sadi
   * @throws {Glicko2ConvergenceError} volatility iteratsiyasi yaqinlashmasa
   */
  compute(current: RatingSnapshot, outcomes: readonly MatchOutcome[]): RatingSnapshot;
}
