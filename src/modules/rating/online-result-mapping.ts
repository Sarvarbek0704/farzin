import type { ColorValue, OnlineGameStatusValue } from '../play/play.types';

/**
 * Onlayn o'yin yakuni → reyting natijasi — SOF mapping (I/O yo'q).
 *
 * docs/06-rating-system.md §5: ONLINE_* kategoriyalari onlayn o'yinlardan
 * to'ldiriladi. OTB'dagi result-mapping (pairing natijalari) bilan bir xil
 * falsafa: reytingga FAQAT taxtada "o'ynalgan" natija kiradi.
 *
 * Jadval (OnlineGameStatus → score):
 *
 *  | Status                              | Natija                          |
 *  |-------------------------------------|---------------------------------|
 *  | CHECKMATE, RESIGNATION, TIMEOUT,    | winnerColor bo'yicha 1/0        |
 *  | ABANDONED (g'olib BOR)              |                                 |
 *  | STALEMATE, DRAW_AGREED,             | 0.5/0.5                         |
 *  | THREEFOLD_REPETITION,               |                                 |
 *  | FIFTY_MOVE_RULE,                    |                                 |
 *  | INSUFFICIENT_MATERIAL,              |                                 |
 *  | TIMEOUT_VS_INSUFFICIENT_MATERIAL    | (FIDE 6.9 durangi ham durang)   |
 *  | PENDING, ACTIVE, ABORTED            | null — reytingga KIRMAYDI       |
 *  | ABANDONED (g'olib YO'Q)             | null — ikkala tomon ham ketgan, |
 *  |                                     | o'ynalgan natija yo'q (docs/07  |
 *  |                                     | §4 abandoned-durang chekkasi    |
 *  |                                     | reytingdan chiqariladi)         |
 *
 * ABANDONED reytingga KIRADI (docs/07 §4: "aborted reytingga ta'sir
 * qilmaydi, abandoned — ta'sir qiladi") — aks holda yutqazayotgan o'yinchi
 * kabelni sug'urib jazosiz qolar edi.
 */

/** G'olib mavjud bo'lganda winnerColor bo'yicha hal bo'ladigan statuslar. */
export const DECISIVE_ONLINE_STATUSES: readonly OnlineGameStatusValue[] = [
  'CHECKMATE',
  'RESIGNATION',
  'TIMEOUT',
  'ABANDONED',
];

/** Har doim 0.5/0.5 bo'ladigan statuslar. */
export const DRAW_ONLINE_STATUSES: readonly OnlineGameStatusValue[] = [
  'STALEMATE',
  'DRAW_AGREED',
  'THREEFOLD_REPETITION',
  'FIFTY_MOVE_RULE',
  'INSUFFICIENT_MATERIAL',
  'TIMEOUT_VS_INSUFFICIENT_MATERIAL',
];

/** Reyting so'rovi WHERE sharti uchun to'liq nomzodlar ro'yxati. */
export const RATED_ONLINE_STATUSES: readonly OnlineGameStatusValue[] = [
  ...DECISIVE_ONLINE_STATUSES,
  ...DRAW_ONLINE_STATUSES,
];

/**
 * Status + winnerColor → reyting natijasi. null = reytingga kirmaydi.
 * period-computation.RatedGame['result'] bilan bir xil uchlik.
 */
export function onlineRatedResult(
  status: OnlineGameStatusValue,
  winnerColor: ColorValue | null,
): 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | null {
  if (DRAW_ONLINE_STATUSES.includes(status)) {
    return 'DRAW';
  }
  if (DECISIVE_ONLINE_STATUSES.includes(status)) {
    if (winnerColor === 'WHITE') {
      return 'WHITE_WIN';
    }
    if (winnerColor === 'BLACK') {
      return 'BLACK_WIN';
    }
    // Hal qiluvchi status, lekin g'olib yo'q: ABANDONED (ikkalasi ketgan)
    // yoki ma'lumot anomaliyasi — reytingga kirmaydi.
    return null;
  }
  // PENDING | ACTIVE | ABORTED
  return null;
}
