/**
 * Tournament moduli — umumiy literal tiplar.
 *
 * Qiymatlar `prisma/schema.prisma` dagi enum'lar bilan AYNAN mos.
 * Service/DTO qatlamida Prisma import taqiqlangani uchun
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`) enum'lar
 * string literal sifatida takrorlanadi — repository chegarasida tiplar
 * strukturaviy mos keladi.
 */

export const PAIRING_SYSTEMS = [
  'SWISS_DUTCH',
  'ROUND_ROBIN',
  'DOUBLE_ROUND_ROBIN',
  'KNOCKOUT',
  'SCHEVENINGEN',
  'TEAM_SWISS',
] as const;
export type PairingSystem = (typeof PAIRING_SYSTEMS)[number];

export const TIME_CATEGORIES = ['CLASSICAL', 'RAPID', 'BLITZ', 'BULLET'] as const;
export type TimeCategory = (typeof TIME_CATEGORIES)[number];

export const PLAY_ENVIRONMENTS = ['OTB', 'ONLINE'] as const;
export type PlayEnvironment = (typeof PLAY_ENVIRONMENTS)[number];

export const CLOCK_TYPES = [
  'SUDDEN_DEATH',
  'FISCHER_INCREMENT',
  'BRONSTEIN_DELAY',
  'SIMPLE_DELAY',
  'MULTI_STAGE',
] as const;
export type ClockType = (typeof CLOCK_TYPES)[number];

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

/** Tie-break identifikatorlari — docs/05-pairing-engine.md §6. */
export const TIE_BREAKS = [
  'BUCHHOLZ',
  'BUCHHOLZ_CUT1',
  'MEDIAN_BUCHHOLZ',
  'SONNEBORN_BERGER',
  'DIRECT_ENCOUNTER',
  'CUMULATIVE',
  'ARO',
  'KOYA',
  'WINS',
  'BLACK_GAMES',
] as const;
export type TieBreak = (typeof TIE_BREAKS)[number];
