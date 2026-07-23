import {
  DEFAULT_GLICKO2_CONFIG,
  GLICKO2_SCALE,
  Glicko2ConvergenceError,
  type Glicko2Calculator,
  type Glicko2Config,
  type MatchOutcome,
  type RatingSnapshot,
} from './glicko2.types';

/**
 * Glicko-2 hisoblagichi — Glickman (2012) rasmiy algoritmi.
 *
 * Sof funksiya: holat yo'q, yon ta'sir yo'q, determinizm kafolatlangan.
 * Framework bog'liqligi yo'q (ADR-0001, `core-must-stay-pure`).
 *
 * Matematika: docs/06-rating-system.md §2 (12 qadam), §7.3 (Illinois).
 * Chegaralar (clamping): docs/06-rating-system.md §4.3.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  TEST VEKTORI — Glickman (2012), "Example of the Glicko-2 system"
 *
 *   Input:  r=1500, RD=200, σ=0.06, τ=0.5
 *   O'yinlar: vs 1400/30 → 1;  vs 1550/100 → 0;  vs 1700/300 → 0
 *   Kutilgan: r' ≈ 1464.05,  RD' ≈ 151.52,  σ' ≈ 0.05999   (tolerantlik ±0.01)
 *
 *   Maqoladagi 1464.06 YAXLITLANGAN oraliq qiymatlardan kelib chiqadi —
 *   to'liq aniqlikda to'g'ri javob 1464.05. docs/06-rating-system.md §12.1
 * ───────────────────────────────────────────────────────────────────────────
 */

/** docs/06-rating-system.md §4.3 — har hisobdan keyin qo'llanadigan chegaralar. */
const MIN_RATING = 100;
const MIN_RD = 30;
const MAX_RD = 350;
const MIN_VOLATILITY = 0.01;
const MAX_VOLATILITY = 0.1;

/** Bracketing qidiruvida `k` uchun qattiq chegara — docs/06-rating-system.md §7.3. */
const MAX_BRACKET_STEPS = 100;

export class Glicko2Service implements Glicko2Calculator {
  constructor(private readonly config: Glicko2Config = DEFAULT_GLICKO2_CONFIG) {}

  compute(current: RatingSnapshot, outcomes: readonly MatchOutcome[]): RatingSnapshot {
    // Qadam 1 — Glicko-2 ichki shkalasiga o'tish.
    const mu = (current.rating - 1500) / GLICKO2_SCALE;
    const phi = current.deviation / GLICKO2_SCALE;
    const sigma = current.volatility;

    // O'yin o'ynalmagan davr: faqat RD o'sadi (350 dan oshmaydi).
    // Aynan shu xususiyat Elo'da yo'q. docs/06-rating-system.md §3.4
    if (outcomes.length === 0) {
      const phiStar = Math.sqrt(phi * phi + sigma * sigma);
      return this.clamp(current.rating, phiStar * GLICKO2_SCALE, sigma);
    }

    // Qadam 2-3 — g(φⱼ) va E(μ, μⱼ, φⱼ) har raqib uchun.
    const games = outcomes.map((o) => {
      const muJ = (o.opponent.rating - 1500) / GLICKO2_SCALE;
      const phiJ = o.opponent.deviation / GLICKO2_SCALE;
      const gJ = g(phiJ);
      const eJ = E(mu, muJ, gJ);
      return { gJ, eJ, score: o.score };
    });

    // Qadam 4 — v: natijalardan olinadigan ma'lumot miqdorining teskarisi.
    let vInv = 0;
    for (const { gJ, eJ } of games) {
      vInv += gJ * gJ * eJ * (1 - eJ);
    }
    const v = 1 / vInv;

    // Qadam 5-6 — Δ = v · Σ g(φⱼ)(sⱼ − Eⱼ)
    let outcomeSum = 0;
    for (const { gJ, eJ, score } of games) {
      outcomeSum += gJ * (score - eJ);
    }
    const delta = v * outcomeSum;

    // Qadam 7 — σ' (Illinois iteratsiyasi).
    const sigmaPrime = this.solveVolatility(delta, phi, v, sigma);

    // Qadam 8 — φ*: davr o'tgani uchun ishonchsizlik oshadi.
    const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

    // Qadam 9 — φ': yangi natijalar ishonchsizlikni kamaytiradi.
    const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

    // Qadam 10 — μ'.
    const muPrime = mu + phiPrime * phiPrime * outcomeSum;

    // Qadam 11-12 — asl shkalaga qaytish va chegaralash.
    return this.clamp(
      GLICKO2_SCALE * muPrime + 1500,
      GLICKO2_SCALE * phiPrime,
      sigmaPrime,
    );
  }

  /**
   * σ' uchun f(x) = 0 tenglamasini Illinois algoritmi bilan yechadi.
   *
   * x = ln(σ'²) almashtirish σ' > 0 ni avtomatik ta'minlaydi.
   * docs/06-rating-system.md §7.3 — qadamma-qadam aynan shu tartib.
   *
   * @throws {Glicko2ConvergenceError} iteratsiya chegarasi oshsa
   */
  private solveVolatility(delta: number, phi: number, v: number, sigma: number): number {
    const { tau, epsilon, maxIterations } = this.config;
    const deltaSq = delta * delta;
    const phiSq = phi * phi;
    const a = Math.log(sigma * sigma);

    const f = (x: number): number => {
      const ex = Math.exp(x);
      const denom = phiSq + v + ex;
      // Ayirmalar tartibi muhim: Δ² − φ² − v − eˣ. docs/06 §7.4 #5
      return (ex * (deltaSq - phiSq - v - ex)) / (2 * denom * denom) - (x - a) / (tau * tau);
    };

    // A. Boshlang'ich chegaralar — ildiz [A, B] orasiga olinadi.
    let A = a;
    let B: number;
    if (deltaSq > phiSq + v) {
      B = Math.log(deltaSq - phiSq - v);
    } else {
      let k = 1;
      while (f(a - k * tau) < 0) {
        k += 1;
        if (k > MAX_BRACKET_STEPS) {
          throw new Glicko2ConvergenceError(k);
        }
      }
      B = a - k * tau;
    }

    // B. Illinois iteratsiyasi.
    let fA = f(A);
    let fB = f(B);
    let iterations = 0;

    while (Math.abs(B - A) > epsilon) {
      iterations += 1;
      if (iterations > maxIterations) {
        throw new Glicko2ConvergenceError(iterations);
      }

      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);

      if (fC * fB <= 0) {
        A = B;
        fA = fB;
      } else {
        // Illinois tuzatishi: yopishib qolgan chegara og'irligi yarimlanadi.
        fA = fA / 2;
      }

      B = C;
      fB = fC;
    }

    // C. Natija A dan olinadi — rasmiy hujjatga sodiqlik. §7.3
    return Math.exp(A / 2);
  }

  /**
   * docs/06-rating-system.md §4.3 chegaralari.
   *
   * RD clamp'i kutilgan holat (yangi/nofaol o'yinchi). σ clamp'i esa
   * bug alomati — uni chaqiruvchi qatlam (rating moduli) WARN bilan
   * loglaydi; core sof bo'lgani uchun bu yerda log yo'q.
   */
  private clamp(rating: number, deviation: number, volatility: number): RatingSnapshot {
    return {
      rating: Math.max(MIN_RATING, rating),
      deviation: Math.min(MAX_RD, Math.max(MIN_RD, deviation)),
      volatility: Math.min(MAX_VOLATILITY, Math.max(MIN_VOLATILITY, volatility)),
    };
  }
}

/** Qadam 2 — g(φ): raqib RD si yuqori bo'lsa, natija og'irligi kamayadi. */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** Qadam 3 — E: kutilgan natija (logistik funksiya). */
function E(mu: number, muJ: number, gJ: number): number {
  return 1 / (1 + Math.exp(-gJ * (mu - muJ)));
}
