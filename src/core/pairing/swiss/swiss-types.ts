/**
 * Swiss (FIDE Dutch) ichki tiplari va o'yinchi holatini tayyorlash.
 *
 * Normativ manba: docs/references/fide-c0403-dutch-2026-02.md.
 * Bu modul `PlayerPairingState`ni bir marta boyitib (`SwissPlayer`),
 * qolgan barcha modullar uchun hisob-kitoblarni oldindan tayyorlaydi —
 * rang afzalligi (Article 1.7), topscorer belgisi (1.8), float tarixi
 * oxirgi ikki turi (C14–C17 uchun), PAB huquqi (C2).
 */

import {
  Color,
  ColorPreferenceStrength,
  FloatDirection,
  type ColorPreference,
  type PlayerPairingState,
} from '../pairing.types';
import { colorDifference, colorPreferenceOf, type ColorAllocationSide } from './colors';

/** Juftlashtirish uchun boyitilgan o'yinchi holati. */
export interface SwissPlayer {
  readonly state: PlayerPairingState;
  /** Article 1.2 tartibidagi o'rin (0-asosli; kichik = yuqori rank). */
  readonly rankIndex: number;
  /** Ochko ×2 — kasr arifmetikasiz aniq taqqoslash uchun. */
  readonly scoreX2: number;
  /** Article 1.6 — rang farqi (faqat taxtada o'ynalgan partiyalar). */
  readonly colorDiff: number;
  /** Article 1.7 — rang afzalligi. */
  readonly pref: ColorPreference;
  /**
   * Article 1.8 — topscorer: FAQAT oxirgi tur juftlashtirilayotganda,
   * mumkin bo'lgan maksimal ochkoning 50%+ iga ega o'yinchi.
   */
  readonly isTopscorer: boolean;
  /**
   * O'ynalmagan turlar soni (C9): o'tgan turlar minus taxtada o'ynalgan
   * partiyalar — bye, forfeit va kech qo'shilishdan oldingi turlar kiradi.
   */
  readonly unplayedCount: number;
  /** O'tgan turdagi float (C14, C15, C18, C19). */
  readonly floatPrev: FloatDirection;
  /** Ikki tur oldingi float (C16, C17, C20, C21). */
  readonly floatPrevPrev: FloatDirection;
  /** C2 — PAB olishga haqlimi (avval bye/o'ynamasdan g'alaba olmagan). */
  readonly pabEligible: boolean;
}

/**
 * Aktiv (juftlashtiriladigan) o'yinchilarni Article 1.2 tartibида boyitadi.
 * Kirish massivi ALLAQACHON (scoreX2 kamayish, pairingNumber o'sish)
 * tartibида saralangan bo'lishi shart — rankIndex shu tartibdan olinadi.
 */
export function prepareSwissPlayers(
  sortedActive: readonly PlayerPairingState[],
  roundNumber: number,
  totalRounds: number,
): SwissPlayer[] {
  const isLastRound = roundNumber === totalRounds;
  // Maksimal mumkin ochko (×2): har turda g'alaba = 2. 50% chegara = roundNumber-1.
  const topscorerThresholdX2 = roundNumber - 1;

  return sortedActive.map((state, rankIndex) => {
    const scoreX2 = Math.round(state.points * 2);
    const floatLen = state.floatHistory.length;
    return {
      state,
      rankIndex,
      scoreX2,
      colorDiff: colorDifference(state.colorHistory),
      pref: colorPreferenceOf(state.colorHistory),
      isTopscorer: isLastRound && scoreX2 > topscorerThresholdX2,
      unplayedCount: Math.max(0, roundNumber - 1 - state.colorHistory.length),
      floatPrev: state.floatHistory[floatLen - 1] ?? FloatDirection.None,
      floatPrevPrev: state.floatHistory[floatLen - 2] ?? FloatDirection.None,
      pabEligible: !state.hasReceivedBye,
    };
  });
}

/**
 * Absolyut mos kelish (qirra mavjudligi):
 *  C1 — avval o'ynagan bo'lsa uchrashmaydi (forfeit bilan "berilgan"
 *       juftlik ham kiradi — pairing-state.builder semantikasi);
 *  C3 — ikkala NON-topscorer bir xil ABSOLYUT rang afzalligi bilan
 *       uchrashmaydi (topscorer ishtirokida ruxsat — C10/C11 sifat
 *       kriteriylari bilan jarima olinadi).
 */
export function canMeet(a: SwissPlayer, b: SwissPlayer): boolean {
  if (a.state.opponentIds.has(b.state.playerId)) {
    return false;
  }
  if (
    !a.isTopscorer &&
    !b.isTopscorer &&
    a.pref.strength === ColorPreferenceStrength.Absolute &&
    b.pref.strength === ColorPreferenceStrength.Absolute &&
    a.pref.color === b.pref.color
  ) {
    return false;
  }
  return true;
}

/** Rang taqsimoti (Article 5.2) uchun ko'rinish. */
export function toAllocationSide(p: SwissPlayer): ColorAllocationSide {
  return {
    pref: p.pref,
    colorDiff: p.colorDiff,
    history: p.state.colorHistory,
    rankIndex: p.rankIndex,
    pairingNumber: p.state.pairingNumber,
  };
}

/** Rang berilgandan keyingi mutlaq chegara buzilishlari (C10/C11 hisobi). */
export interface ColorOutcomeFlags {
  /** |CD| yangi qiymati 2 dan oshadimi (C10 / Basic Rules 6-modda). */
  readonly exceedsColorDiff: boolean;
  /** Uch marta ketma-ket bir xil rangmi (C11 / Basic Rules 7-modda). */
  readonly threeInARow: boolean;
}

export function colorOutcomeFlags(p: SwissPlayer, received: Color): ColorOutcomeFlags {
  const newCd = p.colorDiff + (received === Color.White ? 1 : -1);
  const h = p.state.colorHistory;
  const n = h.length;
  const threeInARow = n >= 2 && h[n - 1] === received && h[n - 2] === received;
  return { exceedsColorDiff: Math.abs(newCd) > 2, threeInARow };
}
