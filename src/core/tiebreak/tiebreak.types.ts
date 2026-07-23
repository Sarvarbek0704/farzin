/**
 * Tie-break hisoblagichi — tiplar.
 *
 * Bu fayl sof TypeScript. NestJS, Prisma, HTTP — hech biri bilinmaydi
 * (ADR-0001, `core-must-stay-pure`). Sabab: tie-break formulalari FIDE
 * reglamentiga bog'liq, DB sxemasiga emas — ularni test qilish uchun
 * DB ko'tarish shart emas.
 *
 * Kalitlar `TournamentSection.tieBreakOrder` bilan bir xil
 * (prisma/schema.prisma), qiymatlar `Standing.tieBreakValues` ga yoziladi.
 *
 * @see docs/05-pairing-engine.md §7 (formulalar), §13.7 (AC-29..AC-31)
 */

/**
 * Qo'llab-quvvatlanadigan tie-break kalitlari.
 * `TournamentSection.tieBreakOrder` dagi qiymatlar bilan bir xil.
 *
 * @see docs/05-pairing-engine.md §7.1–§7.8
 */
export type TieBreakKey =
  | 'BUCHHOLZ'
  | 'BUCHHOLZ_CUT1'
  | 'MEDIAN_BUCHHOLZ'
  | 'SONNEBORN_BERGER'
  | 'DIRECT_ENCOUNTER'
  | 'CUMULATIVE'
  | 'ARO'
  | 'KOYA'
  | 'WINS'
  | 'BLACK_GAMES';

/** Barcha kalitlar — testlar va validatsiya uchun kanonik ro'yxat. */
export const TIE_BREAK_KEYS: readonly TieBreakKey[] = [
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
];

export type GameColor = 'WHITE' | 'BLACK';

/**
 * O'yinchining bir partiyadagi natijasi (ochko).
 *
 * DIQQAT: `0.5` bu yerda faqat KIRISH formati — ikkilik sanoqda aniq
 * ifodalanadi (2⁻¹), shuning uchun `result × 2` yo'qotishsiz butun songa
 * o'tadi. Hisoblagich ICHIDA barcha arifmetika yarim ochko birligida
 * (butun son) bajariladi. docs/05-pairing-engine.md §7.9, AC-31.
 */
export type GameScore = 0 | 0.5 | 1;

/**
 * Bir o'yinchining bir turdagi yozuvi. Massiv TUR TARTIBIDA bo'lishi shart —
 * virtual opponent formulasi (§7.1) turgacha yig'ilgan ochkoga tayanadi.
 */
export interface GameRecord {
  /** Raqib. `null` — bye yoki juftlanmagan tur (raqib yo'q). */
  readonly opponentId: string | null;

  /** O'yinchi o'ynagan rang. O'ynalmagan partiyada `null`. */
  readonly color: GameColor | null;

  /** Shu o'yinchining natijasi: g'alaba 1, durang 0.5, mag'lubiyat 0. */
  readonly result: GameScore;

  /**
   * Partiya taxtada o'ynalganmi?
   *
   * `false` — bye yoki forfeit. Buchholz uchun bunday turda raqib
   * o'rniga VIRTUAL OPPONENT olinadi (docs/05-pairing-engine.md §7.1,
   * FIDE C.02) — hatto `opponentId` mavjud bo'lsa ham (forfeit).
   */
  readonly playedOverBoard: boolean;
}

/**
 * Tie-break hisoblash uchun bir o'yinchining kirish ma'lumoti.
 * Prisma'dan mustaqil — chaqiruvchi qatlam (standings moduli) DB
 * yozuvlarini shu shaklga keltiradi.
 */
export interface PlayerTieBreakInput {
  readonly playerId: string;

  /** Yakuniy ochko (0.5 qadam bilan). Formulalardagi `S(p)`. */
  readonly points: number;

  /**
   * Muzlatilgan reyting (`Registration.ratingAtEntry`) — faqat ARO uchun.
   * Reytingsiz o'yinchida bo'lmaydi (§7.7).
   */
  readonly rating?: number;

  /** Partiyalar, tur tartibida. */
  readonly games: readonly GameRecord[];
}

/**
 * Bir o'yinchi uchun hisoblangan qiymatlar. Faqat so'ralgan kalitlar
 * kiradi; qo'llanilmagan tie-break (masalan DE, §7.5 `null` holati)
 * kalitsiz qoladi. `Standing.tieBreakValues` JSON shakli bilan mos.
 */
export type TieBreakResult = Partial<Record<TieBreakKey, number>>;

export interface TieBreakOptions {
  /**
   * Reytingsiz raqib uchun ARO'da ishlatiladigan qiymat — turnir
   * reglamentida belgilanadi (§7.7). Berilmasa, reytingsiz raqib
   * ARO yig'indisidan va bo'luvchidan CHIQARILADI.
   */
  readonly unratedRating?: number;
}

/**
 * Kirish ma'lumoti ziddiyatli: dublikat o'yinchi, noma'lum raqib yoki
 * `playedOverBoard = true` bilan raqibsiz partiya.
 *
 * Bu KUTILMAGAN holat — chaqiruvchi qatlamdagi bug alomati. Jimgina
 * "taxminiy" qiymat qaytarish o'rniga xato tashlanadi: tie-break
 * apellyatsiya predmeti, noto'g'ri jadval qimmatga tushadi.
 */
export class TieBreakDataError extends Error {
  readonly code = 'TIE_BREAK_DATA_INVALID';

  constructor(readonly reason: string) {
    super(`Tie-break kirish ma'lumoti yaroqsiz: ${reason}`);
    this.name = 'TieBreakDataError';
    Object.setPrototypeOf(this, TieBreakDataError.prototype);
  }
}
