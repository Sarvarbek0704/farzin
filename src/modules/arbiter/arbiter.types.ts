/**
 * Arbiter moduli — umumiy literal tiplar va sof funksiyalar kirish shakllari.
 *
 * Qiymatlar `prisma/schema.prisma` dagi `PairingResult` va `RoundStatus`
 * enum'lari bilan AYNAN mos. Service/DTO qatlamida Prisma import
 * taqiqlangani uchun (.dependency-cruiser.js `prisma-only-in-infrastructure`)
 * enum'lar string literal sifatida takrorlanadi — repository chegarasida
 * tiplar strukturaviy mos keladi (tournament.types.ts bilan bir xil uslub).
 *
 * @see docs/14-roadmap.md — Faza 1, "arbiter moduli"
 * @see docs/01-product-spec.md §4.1 — Round/Pairing/GameResult qatorlari
 */

/** `PairingResult` enum'ining to'liq ro'yxati (prisma/schema.prisma). */
export const PAIRING_RESULTS = [
  'WHITE_WIN',
  'BLACK_WIN',
  'DRAW',
  'WHITE_WIN_FORFEIT',
  'BLACK_WIN_FORFEIT',
  'DOUBLE_FORFEIT',
  'BYE_FULL',
  'BYE_HALF',
  'BYE_ZERO',
  'UNPLAYED',
] as const;
export type PairingResultValue = (typeof PAIRING_RESULTS)[number];

/**
 * Hakam KIRITA oladigan natijalar — UNPLAYED bundan mustasno: u "hali
 * o'ynalmagan" default holat, natija emas (docs/14-roadmap.md Faza 1:
 * "Natija kiritish: 1-0, 0-1, ½-½, forfeit, double forfeit; bye: full,
 * half, zero").
 */
export const ENTERABLE_RESULTS = [
  'WHITE_WIN',
  'BLACK_WIN',
  'DRAW',
  'WHITE_WIN_FORFEIT',
  'BLACK_WIN_FORFEIT',
  'DOUBLE_FORFEIT',
  'BYE_FULL',
  'BYE_HALF',
  'BYE_ZERO',
] as const;
export type EnterableResult = (typeof ENTERABLE_RESULTS)[number];

/** Faqat bye juftligiga (blackRegistrationId = NULL) qo'llanadigan natijalar. */
export const BYE_RESULTS = ['BYE_FULL', 'BYE_HALF', 'BYE_ZERO'] as const;
export type ByeResult = (typeof BYE_RESULTS)[number];

/** `RoundStatus` enum'i (prisma/schema.prisma). */
export const ROUND_STATUSES = [
  'PENDING',
  'PAIRING_IN_PROGRESS',
  'PAIRING_FAILED',
  'PAIRED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;
export type RoundStatusValue = (typeof ROUND_STATUSES)[number];

/**
 * Seksiya `tieBreakOrder` bo'sh bo'lganda ishlatiladigan default tartib —
 * docs/14-roadmap.md Faza 1: "Buchholz, Buchholz Cut-1, Sonneborn-Berger,
 * Direct Encounter, ko'proq g'alaba".
 */
export const DEFAULT_TIE_BREAK_ORDER = [
  'BUCHHOLZ',
  'BUCHHOLZ_CUT1',
  'SONNEBORN_BERGER',
  'DIRECT_ENCOUNTER',
  'WINS',
] as const;

/**
 * Bitta juftlikning tarixiy ko'rinishi — sof funksiyalar (result-mapping,
 * pairing-state.builder) kirishi. DB qatoridan service qatlamida shu
 * shaklga keltiriladi. `blackRegistrationId = null` — bye.
 */
export interface PairingHistoryEntry {
  readonly roundNumber: number;
  readonly whiteRegistrationId: string;
  readonly blackRegistrationId: string | null;
  readonly result: PairingResultValue;
}

/**
 * Juftlashtirishga kiradigan ishtirokchi — `Registration` qatorining
 * engine uchun kerakli qismi. `pairingNumber` allaqachon berilgan
 * bo'lishi shart (docs/05-pairing-engine.md §2 — turnir davomida
 * o'zgarmaydi).
 */
export interface ParticipantSeed {
  readonly registrationId: string;
  readonly pairingNumber: number;
  /** Muzlatilgan reyting (`Registration.ratingAtEntry`). */
  readonly ratingAtEntry: number | null;
  readonly isWithdrawn: boolean;
  readonly joinedAtRound: number | null;
}
