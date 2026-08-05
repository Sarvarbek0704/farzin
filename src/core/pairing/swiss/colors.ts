/**
 * Rang mantiqi — FIDE C.04.3 (2026-02) Article 1.6, 1.7 va 5.
 *
 * Normativ manba: docs/references/fide-c0403-dutch-2026-02.md (verbatim).
 * Sof funksiyalar; kirish — faqat TAXTADA o'ynalgan partiyalar ranglari
 * (bye/forfeit rang tarixiga kirmaydi — pairing.types.ts `colorHistory`).
 */

import { Color, ColorPreferenceStrength, type ColorPreference } from '../pairing.types';

export function oppositeColor(color: Color): Color {
  return color === Color.White ? Color.Black : Color.White;
}

/** Article 1.6 — oq partiyalar soni minus qora partiyalar soni. */
export function colorDifference(history: readonly Color[]): number {
  let cd = 0;
  for (const c of history) {
    cd += c === Color.White ? 1 : -1;
  }
  return cd;
}

/**
 * Article 1.7 — rang afzalligi.
 *
 *  1.7.1 absolute: CD > +1 yoki CD < −1, YOKI oxirgi ikki o'ynalgan partiya
 *        bir xil rangda. Ikkala sabab ham mustaqil tekshiriladi.
 *  1.7.2 strong:   CD = +1 (qora) / CD = −1 (oq).
 *  1.7.3 mild:     CD = 0 — oxirgi o'ynalgan rangning teskarisi.
 *  1.7.4 none:     birorta partiya o'ynamagan.
 */
export function colorPreferenceOf(history: readonly Color[]): ColorPreference {
  const n = history.length;
  if (n === 0) {
    return { color: null, strength: ColorPreferenceStrength.None };
  }
  const cd = colorDifference(history);

  if (cd > 1) {
    return { color: Color.Black, strength: ColorPreferenceStrength.Absolute };
  }
  if (cd < -1) {
    return { color: Color.White, strength: ColorPreferenceStrength.Absolute };
  }

  const last = history[n - 1];
  if (last === undefined) {
    // n > 0 tekshirilgan; bu shunchaki tip himoyasi.
    return { color: null, strength: ColorPreferenceStrength.None };
  }
  if (n >= 2 && history[n - 2] === last) {
    return { color: oppositeColor(last), strength: ColorPreferenceStrength.Absolute };
  }

  if (cd === 1) {
    return { color: Color.Black, strength: ColorPreferenceStrength.Strong };
  }
  if (cd === -1) {
    return { color: Color.White, strength: ColorPreferenceStrength.Strong };
  }
  return { color: oppositeColor(last), strength: ColorPreferenceStrength.Mild };
}

/** Rang taqsimotiga kiradigan bir tomonning ko'rinishi. */
export interface ColorAllocationSide {
  /** Article 1.7 bo'yicha afzallik. */
  readonly pref: ColorPreference;
  /** Article 1.6 — rang farqi. */
  readonly colorDiff: number;
  /** Taxtada o'ynalgan ranglar, tur tartibida. */
  readonly history: readonly Color[];
  /** Article 1.2 tartibidagi o'rin (kichik = yuqori rank). */
  readonly rankIndex: number;
  /** TPN (Article 1.1) — bizda pairingNumber. */
  readonly pairingNumber: number;
}

export interface ColorAllocation {
  /** `true` — birinchi (a) tomon oq o'ynaydi. */
  readonly firstIsWhite: boolean;
  /** Qaysi qoida qo'llandi — explainability (docs/05 §6.4). */
  readonly rule: '5.2.1' | '5.2.2' | '5.2.3' | '5.2.4' | '5.2.5';
}

const STRENGTH_ORDER: Readonly<Record<ColorPreferenceStrength, number>> = {
  [ColorPreferenceStrength.Absolute]: 3,
  [ColorPreferenceStrength.Strong]: 2,
  [ColorPreferenceStrength.Mild]: 1,
  [ColorPreferenceStrength.None]: 0,
};

/**
 * Article 5.2 — juftlik ichida kim oq o'ynashini aniqlash (ustuvorlik
 * kamayish tartibida):
 *
 *  5.2.1 ikkala afzallikni qondirish (afzalliklar mos kelsa; 1.7.4 —
 *        o'ynamagan o'yinchining "afzalligi" — raqibnikini qondirish);
 *  5.2.2 kuchliroq afzallikni qondirish; ikkalasi absolute bo'lsa
 *        (topscorer holati) — kengroq |CD| ninkini;
 *  5.2.3 bir o'yinchi oq, ikkinchisi qora o'ynagan ENG OXIRGI holatga
 *        nisbatan ranglarni almashtirish;
 *  5.2.4 yuqori rankdagi (Article 1.2) o'yinchining afzalligi;
 *  5.2.5 yuqori rankdagi o'yinchining TPN'i toq bo'lsa — initial-colour,
 *        aks holda — teskarisi (Article 5.1: initial-colour qur'a bilan,
 *        engine'ga PairingRequest.initialColor sifatida kiradi).
 */
export function allocateColors(
  a: ColorAllocationSide,
  b: ColorAllocationSide,
  initialColor: Color,
): ColorAllocation {
  const prefA = a.pref.color;
  const prefB = b.pref.color;

  // 5.2.1 — mos (qarama-qarshi) afzalliklar yoki faqat bittasida afzallik.
  if (prefA !== null && prefB !== null && prefA !== prefB) {
    return { firstIsWhite: prefA === Color.White, rule: '5.2.1' };
  }
  if (prefA !== null && prefB === null) {
    return { firstIsWhite: prefA === Color.White, rule: '5.2.1' };
  }
  if (prefA === null && prefB !== null) {
    return { firstIsWhite: prefB === Color.Black, rule: '5.2.1' };
  }

  // Shu nuqtada: ikkalasi ham afzalliksiz, YOKI ikkalasi bir xil rangni istaydi.
  if (prefA !== null && prefB !== null) {
    // 5.2.2 — kuchliroq afzallik.
    const sa = STRENGTH_ORDER[a.pref.strength];
    const sb = STRENGTH_ORDER[b.pref.strength];
    if (sa !== sb) {
      const first = sa > sb;
      const winner = first ? prefA : prefB;
      const winnerWantsWhite = winner === Color.White;
      return { firstIsWhite: first ? winnerWantsWhite : !winnerWantsWhite, rule: '5.2.2' };
    }
    if (
      a.pref.strength === ColorPreferenceStrength.Absolute &&
      Math.abs(a.colorDiff) !== Math.abs(b.colorDiff)
    ) {
      // 5.2.2 (2-jumla) — ikkalasi absolute (topscorer): kengroq |CD| g'olib.
      const first = Math.abs(a.colorDiff) > Math.abs(b.colorDiff);
      const winner = first ? prefA : prefB;
      const winnerWantsWhite = winner === Color.White;
      return { firstIsWhite: first ? winnerWantsWhite : !winnerWantsWhite, rule: '5.2.2' };
    }
  }

  // 5.2.3 — ranglari farq qilgan eng oxirgi partiya juftiga nisbatan almashtirish.
  // Tarixlar har o'yinchining O'Z partiyalar ketma-ketligi bo'yicha oxiridan
  // solishtiriladi (bye tufayli uzunliklar farq qilishi mumkin).
  const minLen = Math.min(a.history.length, b.history.length);
  for (let back = 1; back <= minLen; back += 1) {
    const ca = a.history[a.history.length - back];
    const cb = b.history[b.history.length - back];
    if (ca !== undefined && cb !== undefined && ca !== cb) {
      // a o'shanda ca o'ynagan → endi teskarisini oladi.
      return { firstIsWhite: oppositeColor(ca) === Color.White, rule: '5.2.3' };
    }
  }

  // 5.2.4 — yuqori rankdagi o'yinchining afzalligi (afzallik bo'lsa).
  const firstHigher = a.rankIndex < b.rankIndex;
  const higher = firstHigher ? a : b;
  const higherPref = higher.pref.color;
  if (higherPref !== null) {
    const higherWantsWhite = higherPref === Color.White;
    return { firstIsWhite: firstHigher ? higherWantsWhite : !higherWantsWhite, rule: '5.2.4' };
  }

  // 5.2.5 — TPN toq bo'lsa initial-colour, aks holda teskarisi.
  const higherGets = higher.pairingNumber % 2 === 1 ? initialColor : oppositeColor(initialColor);
  const higherGetsWhite = higherGets === Color.White;
  return { firstIsWhite: firstHigher ? higherGetsWhite : !higherGetsWhite, rule: '5.2.5' };
}
