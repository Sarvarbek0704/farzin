/**
 * Fairplay — ENGINE KORRELYATSIYA sof matematikasi (docs/08 §2.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU EHTIMOLLIK, ISBOT EMAS (CANON §7.5, docs/08 §0).
 *
 *  Kuchli o'yinchi TOZA o'ynab ham yuqori mos kelishi mumkin (GM tinch
 *  pozitsiyada 60–70% T1 — normal, docs/08 §2.1). Bu fayl faqat
 *  o'lchaydi; hech narsa hal qilmaydi va hal qila olmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uch o'lchov (docs/08 §2.1):
 *  1. T1 match rate — faqat "real tanlov bor" pozitsiyalarda.
 *  2. CPL taqsimoti — O'RTACHA EMAS, DISPERSIYA: engine yordamida og'ir
 *     dum (200+ cp xatolar) yo'qoladi — g'ayritabiiy PAST tarqoqlik
 *     o'rtachaning pastligidan kuchliroq signal.
 *  3. Murakkablik normallashuvi — hujjatning ANIQ qoidasi: axborotsiz
 *     pozitsiyalar CHIQARIB TASHLANADI (debyut — chaqiruvchida,
 *     hal bo'lgan |eval|>500cp — shu yerda). "Muqobillari deyarli teng"
 *     (<30cp) filtri MultiPV talab qiladi — hozirgi 1-PV tahlilida
 *     mavjud emas, OCHIQ deb hujjatlangan (§2.1 aniq formula
 *     kalibrlashda). Murakkablik proksisi ham (§2.1 3-band) MultiPV
 *     bilan keladi.
 *
 * Sof TypeScript — engine/process YO'Q (adapter alohida faylda).
 */

import { clamp01, mean, variance } from '../../../core/fairplay/timing-analysis';

/** Bitta yurish kuzatuvi — hamma baholar YURGAN TOMON nuqtai nazaridan (cp). */
export interface EngineMoveObservation {
  readonly playedUci: string;
  readonly bestMoveUci: string;
  /** Pozitsiya bahosi yurishdan OLDIN (eng yaxshi yo'l bahosi). */
  readonly evalBeforeCp: number;
  /** Baho o'ynalgan yurishdan KEYIN (o'sha tomon nuqtai nazarida). */
  readonly evalAfterCp: number;
}

export interface EngineCorrelationResult {
  /** Hisobga kirgan (filtrdan o'tgan) pozitsiyalar. */
  readonly sampleSize: number;
  /** Filtrlangan pozitsiyalar (hal bo'lgan — DECIDED). */
  readonly excludedCount: number;
  /** T1 mos kelish ulushi 0..1. */
  readonly topOneMatchRate: number;
  /** O'rtacha centipawn loss (hech qachon manfiy emas). */
  readonly avgCentipawnLoss: number;
  /** CPL standart og'ishi — PAST qiymat kuchli naqsh (§2.1 2-band). */
  readonly cplStdDev: number;
  /** Normallashtirilgan kuch 0..1 — faqat navbat tartiblagichi. */
  readonly strength: number;
}

/** Minimal baholanadigan yurish — docs/08 §9.3 jadvali (bitta o'yin: 20). */
export const ENGINE_MIN_SAMPLE = 20;

/** Hal bo'lgan pozitsiya chegarasi — docs/08 §2.1: |eval| > 500 cp chiqariladi. */
export const DECIDED_EVAL_CP = 500;

/** Mat bahosi cp shkalasiga proyeksiyasi (chegara qiymat, chaqiruvchi ishlatadi). */
export const MATE_CP = 10_000;

/**
 * T1 baseline — docs/08 §2.1: GM tinch pozitsiyalarda 60–70% T1 normal,
 * raqam TAXMINIY. 0.55 dan past T1 signal bermaydi; kalibrlashda (§9)
 * qayta ko'riladi.
 */
export const T1_BASELINE = 0.55;

/** CPL stddev shu qiymatdan yuqorida "dum bor" deb hisoblanadi (tanlangan, §9). */
export const CPL_STDDEV_REFERENCE_CP = 60;

/** ACPL shu qiymatdan past bo'lsa "juda aniq" komponenti to'la yonadi (tanlangan, §9). */
export const ACPL_REFERENCE_CP = 40;

/**
 * Yurishlar seriyasi → korrelyatsiya o'lchovlari.
 *
 * @param observations debyut yarim-yurishlari ALLAQACHON chiqarilgan
 *   bo'lishi kerak (chaqiruvchi — OPENING_PLIES_EXCLUDED).
 * @returns null — filtrdan keyin namuna < ENGINE_MIN_SAMPLE (§9.3:
 *   shovqindan signal chiqmaydi).
 */
export function engineCorrelation(
  observations: readonly EngineMoveObservation[],
): EngineCorrelationResult | null {
  const scored: { isTopOne: boolean; cpLoss: number }[] = [];
  let excludedCount = 0;

  for (const o of observations) {
    if (Math.abs(o.evalBeforeCp) > DECIDED_EVAL_CP) {
      excludedCount += 1; // DECIDED — texnika bilan yutiladigan pozitsiya (§2.1)
      continue;
    }
    scored.push({
      isTopOne: o.playedUci === o.bestMoveUci,
      // CPL hech qachon manfiy emas (docs/08 §8.3 MoveAnalysis.cpLoss).
      cpLoss: Math.max(0, o.evalBeforeCp - o.evalAfterCp),
    });
  }

  if (scored.length < ENGINE_MIN_SAMPLE) {
    return null;
  }

  const matches = scored.filter((s) => s.isTopOne).length;
  const topOneMatchRate = matches / scored.length;
  const losses = scored.map((s) => s.cpLoss);
  const avgCentipawnLoss = mean(losses);
  const cplStdDev = Math.sqrt(variance(losses, avgCentipawnLoss));

  // Kuch komponentlari — TANLANGAN kalibrlashgacha formulalar (§9):
  //  t1: baseline'dan yuqori qismi (kuchli o'yinchi FP'siga qarshi himoya —
  //      baseline'gacha bo'lgan mos kelish signal EMAS);
  //  acpl: juda past o'rtacha xato;
  //  flat: og'ir dumning yo'qolishi (dispersiya past) — §2.1 bo'yicha
  //        o'rtachadan kuchliroq belgi, shuning uchun eng katta vazn emas,
  //        lekin alohida komponent.
  const t1Component = clamp01((topOneMatchRate - T1_BASELINE) / (1 - T1_BASELINE));
  const acplComponent = clamp01(1 - avgCentipawnLoss / ACPL_REFERENCE_CP);
  const flatComponent = clamp01(1 - cplStdDev / CPL_STDDEV_REFERENCE_CP);
  const strength = clamp01(0.4 * t1Component + 0.3 * acplComponent + 0.3 * flatComponent);

  return {
    sampleSize: scored.length,
    excludedCount,
    topOneMatchRate,
    avgCentipawnLoss,
    cplStdDev,
    strength,
  };
}

// --- Kuzatuv qurish (sof) --------------------------------------------------------

/** `analysis.processor` ga kerak bo'lgan minimal yurish shakli. */
export interface AnalyzedMove {
  readonly ply: number;
  readonly uci: string;
}

/** `PositionAnalysis` ning shu yerga kerak bo'lgan qismi (port'ga bog'lanmaydi). */
export interface PositionEval {
  readonly bestMoveUci: string;
  readonly evalCp: number | null;
  readonly mate: number | null;
}

/** Mat bahosi cp shkalasiga: matni beruvchi tomon uchun +MATE_CP. */
export function evalToCp(p: PositionEval): number {
  if (p.evalCp !== null) {
    return p.evalCp;
  }
  if (p.mate !== null) {
    return p.mate > 0 ? MATE_CP : -MATE_CP;
  }
  return 0;
}

/**
 * Yurishlar + pozitsiya baholaridan korrelyatsiya KUZATUVLARINI yig'ish.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA ALOHIDA EKSPORT QILINADI
 *
 *  Bu mantiq ilgari `analysis.processor` ning private metodi edi. Kalibrlash
 *  vositasi (`src/tools/fairplay-calibration.ts`) o'lchov olayotganda
 *  AYNAN SHU yo'ldan o'tishi shart — aks holda o'lchov ishlab turgan
 *  detektorni emas, uning nusxasini o'lchagan bo'lardi va raqam yolg'on
 *  ishonch berardi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `evals[i]` — `i` ply'dan KEYINGI pozitsiya bahosi; `evals[0]` boshlang'ich
 *  pozitsiya. Baholanmagan pozitsiya `null` bo'lishi mumkin (engine xatosi).
 *
 *  Debyut chiqarib tashlanadi: nazariya bo'yicha yurish chit emas
 *  (docs/08 §2.1).
 */
export function buildObservations(
  moves: readonly AnalyzedMove[],
  isWhite: boolean,
  evals: readonly (PositionEval | null)[],
  openingPliesExcluded: number,
): EngineMoveObservation[] {
  const observations: EngineMoveObservation[] = [];
  for (const move of moves) {
    if ((move.ply % 2 === 1) !== isWhite) {
      continue;
    }
    if (move.ply <= openingPliesExcluded) {
      continue;
    }
    const before = evals[move.ply - 1];
    const after = evals[move.ply];
    if (before == null || after == null || before.bestMoveUci === '') {
      continue;
    }
    observations.push({
      playedUci: move.uci,
      bestMoveUci: before.bestMoveUci,
      evalBeforeCp: evalToCp(before),
      // Keyingi pozitsiya bahosi RAQIB nuqtai nazarida — teskarisi olinadi.
      evalAfterCp: -evalToCp(after),
    });
  }
  return observations;
}
