/**
 * Rating moduli — umumiy literal tiplar va qator (row) shakllari.
 *
 * Qiymatlar `prisma/schema.prisma` dagi enum'lar bilan AYNAN mos.
 * Service/DTO qatlamida Prisma import taqiqlangani uchun
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`) enum'lar
 * string literal sifatida takrorlanadi — repository chegarasida tiplar
 * strukturaviy mos keladi (tournament.types.ts bilan bir xil uslub).
 *
 * @see docs/06-rating-system.md §5 — kategoriyalar
 */

export const PLAY_ENVIRONMENTS = ['OTB', 'ONLINE'] as const;
export type PlayEnvironment = (typeof PLAY_ENVIRONMENTS)[number];

export const TIME_CATEGORIES = ['CLASSICAL', 'RAPID', 'BLITZ', 'BULLET'] as const;
export type TimeCategory = (typeof TIME_CATEGORIES)[number];

/**
 * OTB_BULLET MAVJUD EMAS — jonli bullet turniri deyarli o'ynalmaydi va
 * uni ishonchli hakamlik qilish mumkin emas (docs/06-rating-system.md §5.1).
 * Qolgan 7 kombinatsiya — mustaqil reyting basseynlari.
 */
export function isValidRatingCombo(
  environment: PlayEnvironment,
  timeCategory: TimeCategory,
): boolean {
  return !(environment === 'OTB' && timeCategory === 'BULLET');
}

/** Glickman tavsiyasi: 0.3 ≤ τ ≤ 1.2 (docs/06-rating-system.md §2.13). */
export const TAU_MIN = 0.3;
export const TAU_MAX = 1.2;
/** Farzin boshlang'ich tanlovi — Glickman rasmiy misolidagi qiymat. */
export const TAU_DEFAULT = 0.5;

// --- Qator (row) shakllari — repository chiqishi -----------------------------
//     Decimal maydonlar repository chegarasida `number` ga o'giriladi
//     (Prisma Decimal .toNumber() — aniq, hujjatlangan konversiya).

export interface RatingPeriodRow {
  id: string;
  environment: PlayEnvironment;
  timeCategory: TimeCategory;
  startsAt: Date;
  endsAt: Date;
  /** Davr uchun muzlatilgan sistema konstantasi τ (docs/06 §8.1). */
  tau: number;
  computedAt: Date | null;
  playersAffected: number | null;
  gamesProcessed: number | null;
  /** Qayta hisoblash necha marta bo'lgan (docs/06 §9). */
  recomputeGeneration: number;
  createdAt: Date;
}

export interface PlayerRatingRow {
  id: string;
  playerId: string;
  environment: PlayEnvironment;
  timeCategory: TimeCategory;
  rating: number;
  deviation: number;
  volatility: number;
  gamesPlayed: number;
  isProvisional: boolean;
  peakRating: number | null;
  peakRatingAt: Date | null;
  lastPeriodId: string | null;
}

/** Ommaviy leaderboard qatori — o'yinchi nomi bilan (JOIN repository'da). */
export interface LeaderboardRow {
  /** PlayerRating.id — cursor uchun (UUID v7). */
  id: string;
  playerId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  rating: number;
  /** RD ochiq ko'rsatiladi — "reyting nuqta emas, taqsimot" (docs/14 Faza 3). */
  deviation: number;
  gamesPlayed: number;
}

/** Reyting tarixi qatori — "reytingim nega tushdi?" javobi (docs/06 §8.3). */
export interface RatingHistoryRow {
  id: string;
  playerId: string;
  periodId: string;
  environment: PlayEnvironment;
  timeCategory: TimeCategory;
  ratingBefore: number;
  deviationBefore: number;
  volatilityBefore: number;
  ratingAfter: number;
  deviationAfter: number;
  volatilityAfter: number;
  gamesInPeriod: number;
  /** [{ pairingId, opponentId, opponentRating, opponentRd, score }] */
  inputGames: unknown;
  createdAt: Date;
}
