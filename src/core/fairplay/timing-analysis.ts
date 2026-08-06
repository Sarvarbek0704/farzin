/**
 * Fair-play — VAQT FINGERPRINT tahlili (docs/08-fair-play.md §2.2).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU EHTIMOLLIK, ISBOT EMAS (CANON §7.5, docs/08 §0).
 *
 *  Bu fayldagi hech bir raqam "chit qildi" degani emas. Natija —
 *  "bu o'yinga odam qarasin" degan ustuvorlik xolos. Hech qanday
 *  iste'molchi bu qiymatdan avtomatik jazo chiqara olmaydi — jazo
 *  yo'li faqat komissiya qarori orqali (docs/08 §4.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nima o'lchanadi (docs/08 §2.2): inson o'ylash vaqti pozitsiyaga JAVOB
 * BERADI — oson yurish tez, murakkab yurish sekin. Engine ishlatuvchida
 * vaqt "ko'chirish → o'qish → qaytarish" jarayoniga ketadi va bu jarayon
 * murakkablikka bog'liq emas: (1) dispersiya pasayadi, (2) vaqtlar
 * bir tekis bo'lib qoladi. Shu fayl aynan shu ikkitasini o'lchaydi.
 *
 * Murakkablik ↔ vaqt korrelyatsiyasi (docs/08 §2.2 asosiy struktura)
 * engine bahosini talab qiladi — u engine-correlation qatlamida, bu
 * fayl faqat vaqt seriyasining O'ZI ustida ishlaydi.
 *
 * HALOL FP OGOHLANTIRISHLARI (docs/08 §2.2 "FP xavfi — o'rtacha, lekin
 * nozik"):
 *  - Bullet/blitz'da hamma tez o'ynaydi — signal asosan klassik va rapid
 *    uchun ishonchli. Bu filtr CHAQIRUVCHIDA (processor) — sof funksiya
 *    vaqt kategoriyasini bilmaydi.
 *  - Premove ~0 ms ko'rsatadi — bu chit emas, chiqariladi (§10
 *    acceptance: excludeReason PREMOVE).
 *  - Ba'zi o'yinchi tabiatan tez va tekis o'ynaydi — past dispersiya
 *    O'ZI aybdorlik emas, faqat "shubhali" ustuvorlik.
 *
 * Sof TypeScript — framework/IO yo'q (.dependency-cruiser core-must-stay-pure).
 */

/** Bitta yarim-yurishning vaqt ma'lumoti (Move.thinkTimeMs). */
export interface TimedPly {
  /** Yarim-yurish raqami (1-dan). */
  readonly ply: number;
  /** Sarflangan vaqt (ms). null = o'lchanmagan (masalan, erkin 1-yurish). */
  readonly thinkTimeMs: number | null;
}

export interface TimingAnalysis {
  /** Hisobga kirgan yurishlar soni (filtrlardan keyin). */
  readonly sampleSize: number;
  /** Filtrlangan (debyut / premove / o'lchanmagan) yurishlar soni. */
  readonly excludedCount: number;
  readonly meanMs: number;
  readonly varianceMs2: number;
  readonly stdDevMs: number;
  /**
   * Variatsiya koeffitsienti (stdDev/mean) — o'lchov birligidan mustaqil
   * "qanchalik tekis" ko'rsatkichi. PAST qiymat = bir tekis vaqtlar =
   * shubhali NAQSH (isbot emas! — tepadagi ogohlantirishlar).
   */
  readonly coefficientOfVariation: number;
  /**
   * Normallashtirilgan kuch 0..1. 1 = to'liq bir tekis (bot-simon),
   * 0 = inson-simon og'ir dumli taqsimot. TALQIN: bu "chit ehtimoli"
   * EMAS — faqat navbat tartiblagichi (docs/08 §3.3 Bosqich 2).
   */
  readonly strength: number;
}

/**
 * Minimal namuna (docs/08 §9.3 jadvali: bitta o'yin uchun 20).
 * Undan kam yurishdan xulosa chiqarish — shovqindan signal yasash.
 */
export const TIMING_MIN_SAMPLE = 20;

/**
 * Debyut yarim-yurishlari chiqariladi (docs/08 §2.1: yodlangan nazariya
 * chit emas; §8.3 AnalysisMeta.bookPlies). Hujjat aniq sonni OCHIQ
 * qoldirgan — 10 ply (har tomonga 5 yurish) tanlangan default,
 * kalibrlashda (§9) qayta ko'riladi.
 */
export const OPENING_PLIES_EXCLUDED = 10;

/**
 * Premove chegarasi (docs/08 §2.2: premove 0 ms ko'rsatadi). 100 ms dan
 * tez "yurish" fizik o'ylash emas — chiqariladi. Tanlangan default.
 */
export const PREMOVE_THRESHOLD_MS = 100;

/**
 * CV shu qiymatdan yuqori bo'lsa kuch 0 (inson-simon). Inson o'ylash
 * vaqti og'ir dumli — CV odatda ~1 atrofida yoki undan yuqori; bir tekis
 * "ko'chirish" jarayonida CV keskin past. 0.9 — tanlangan kalibrlashgacha
 * qiymat (docs/08 §9: haqiqiy chegara ma'lumot bilan belgilanadi).
 */
export const CV_REFERENCE = 0.9;

/**
 * O'yinchining vaqt seriyasidan fingerprint tahlili.
 *
 * @returns null — namuna yetarli emas (docs/08 §9.3: signal yozilsa ham
 *   HECH QANDAY iste'molchi ishlatmasligi kerak; biz umuman yozmaymiz —
 *   shovqindan signal chiqmaydi).
 */
export function analyzeTiming(moves: readonly TimedPly[]): TimingAnalysis | null {
  const usable: number[] = [];
  let excludedCount = 0;

  for (const m of moves) {
    if (
      m.ply <= OPENING_PLIES_EXCLUDED ||
      m.thinkTimeMs === null ||
      m.thinkTimeMs < PREMOVE_THRESHOLD_MS
    ) {
      excludedCount += 1;
      continue;
    }
    usable.push(m.thinkTimeMs);
  }

  if (usable.length < TIMING_MIN_SAMPLE) {
    return null; // §9.3 — kam namuna = statistik ma'nosiz, signal YO'Q
  }

  const meanMs = mean(usable);
  const varianceMs2 = variance(usable, meanMs);
  const stdDevMs = Math.sqrt(varianceMs2);
  // meanMs > 0 kafolatlangan (PREMOVE_THRESHOLD_MS filtri) — 0 ga bo'linmaydi.
  const cv = stdDevMs / meanMs;

  return {
    sampleSize: usable.length,
    excludedCount,
    meanMs,
    varianceMs2,
    stdDevMs,
    coefficientOfVariation: cv,
    strength: clamp01(1 - cv / CV_REFERENCE),
  };
}

// --- Sof statistika yordamchilari ---------------------------------------------

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

/** Populyatsion dispersiya (n bo'yicha) — namuna deskriptiv, inferensial emas. */
export function variance(values: readonly number[], knownMean?: number): number {
  if (values.length === 0) {
    return 0;
  }
  const m = knownMean ?? mean(values);
  let sum = 0;
  for (const v of values) {
    sum += (v - m) * (v - m);
  }
  return sum / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) {
    return 0;
  }
  return Math.min(1, Math.max(0, x));
}
