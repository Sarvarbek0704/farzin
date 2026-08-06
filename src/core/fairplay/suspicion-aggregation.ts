/**
 * Fair-play — signal kuchlarini JAMLASH (docs/08-fair-play.md §3.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU EHTIMOLLIK, ISBOT EMAS (CANON §7.5, docs/08 §0).
 *
 *  aggregateScore'ning YAGONA vazifasi — komissiya navbatini tartiblash
 *  (docs/08 §4.2 1-band: "Skorning yagona vazifasi — komissiyaning
 *  cheklangan vaqtini qayerga sarflashni aytish"). U hech qachon jazo
 *  chiqarmaydi va chiqara olmaydi — jazo yo'li faqat odam qarori.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Formula tanlovi: docs/08 §3.3 "Bosqich 2 — sodda, tushuntiriladigan
 * ustuvorlik skori" deydi, aniq formulani OCHIQ qoldiradi (§3.1 Regan
 * modeli — Bosqich 3, birlamchi manba o'qilgandan keyin). Tanlangan
 * yechim: har tur bo'yicha MAX, so'ng mavjud turlar bo'yicha vaznli
 * o'rtacha (vaznlar mavjudlar ustida qayta normallashtiriladi).
 * Sabablari:
 *  - tushuntiriladigan: "eng kuchli vaqt signali X, eng kuchli engine
 *    signali Y, vaznli o'rtacha Z" — komissiyaga aytib beriladi;
 *  - monoton: birorta signal kuchayishi skorni pasaytirmaydi
 *    (property test bilan qulflangan);
 *  - chegaralangan: har doim 0..1.
 *
 * Vaznlar docs/08 §2.5 jadvalidagi "Kuchi" ustunidan kelib chiqadi
 * (aniq raqamlar hujjatda YO'Q — tanlangan, kalibrlashda §9 qayta
 * ko'riladi). MUHIM ISTISNO: RATING_JUMP vazni ATAYLAB 0 — docs/08
 * §2.3: "reyting sakrashi hech qachon FairPlayCase ochish uchun asos
 * bo'lmaydi. Kod darajasida majburlanadi (§8.3)". Bizda aggregateScore
 * ish ochilishiga ta'sir qilgani uchun bu signal skordan butunlay
 * chiqarilgan — u faqat evidence sifatida komissiyaga ko'rinadi.
 *
 * Sof TypeScript — framework/IO yo'q.
 */

import { clamp01 } from './timing-analysis';

/** prisma FairPlaySignalType enum bilan AYNAN mos literal union. */
export type SuspicionSignalKind =
  | 'ENGINE_CORRELATION'
  | 'TIMING_ANOMALY'
  | 'RATING_JUMP'
  | 'BROWSER_FOCUS_LOSS'
  | 'DEVICE_FINGERPRINT'
  | 'MULTI_ACCOUNT'
  | 'MANUAL_REPORT';

export interface SuspicionSignal {
  readonly kind: SuspicionSignalKind;
  /** Normallashtirilgan kuch 0..1 (tashqarida clamp qilinadi). */
  readonly strength: number;
}

/**
 * Vaznlar — docs/08 §2.5 "Kuchi" ustuni asosida tanlangan (hujjat raqam
 * bermaydi). RATING_JUMP = 0 — §2.3 qat'iy qoidasi (tepadagi izoh).
 */
export const SIGNAL_WEIGHTS: Readonly<Record<SuspicionSignalKind, number>> = {
  ENGINE_CORRELATION: 0.35, // §2.5: Yuqori
  TIMING_ANOMALY: 0.3, // §2.5: O'rtacha–yuqori
  MANUAL_REPORT: 0.15, // odam shikoyati — komissiya e'tibori uchun
  BROWSER_FOCUS_LOSS: 0.05, // §2.5: Past, FP yuqori
  DEVICE_FINGERPRINT: 0.05, // §2.5: Past, FP yuqori
  MULTI_ACCOUNT: 0.1, // §2.4: o'rtacha xavf
  RATING_JUMP: 0, // §2.3: HECH QACHON ish ochish asosi emas
};

/**
 * Signal kuchlari → aggregateScore (0..1).
 *
 * @returns null — vaznli signal umuman yo'q (bo'sh kirish yoki faqat
 *   0-vaznli turlar). null = "skor yo'q", 0 = "skor bor va past" —
 *   bu farq muhim: skorsiz ish navbatda tartiblanmaydi.
 */
export function aggregateSuspicion(signals: readonly SuspicionSignal[]): number | null {
  // Har tur bo'yicha eng kuchli qiymat — bir xil turdagi bir necha o'yin
  // signalidan eng yomoni ustuvorlikni belgilaydi (monotonlik saqlanadi).
  const maxByKind = new Map<SuspicionSignalKind, number>();
  for (const s of signals) {
    const strength = clamp01(s.strength);
    const current = maxByKind.get(s.kind);
    if (current === undefined || strength > current) {
      maxByKind.set(s.kind, strength);
    }
  }

  let weightSum = 0;
  let weighted = 0;
  for (const [kind, strength] of maxByKind) {
    const weight = SIGNAL_WEIGHTS[kind];
    if (weight <= 0) {
      continue; // RATING_JUMP — §2.3
    }
    weightSum += weight;
    weighted += weight * strength;
  }

  if (weightSum === 0) {
    return null;
  }
  return clamp01(weighted / weightSum);
}
