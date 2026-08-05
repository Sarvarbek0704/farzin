/**
 * Score bracket ketma-ketligi — FIDE C.04.3 (2026-02) Article 1.3, 1.9, 3.
 *
 * Jarayon (Article 1.9.2): eng yuqori scoregroup'dan boshlab, bracket
 * ketma-ket juftlashtiriladi; juftlashmay qolganlar (downfloater, 1.4.1)
 * keyingi bracketga MDP bo'lib tushadi.
 *
 * Har bracket ichida: nomzodlarni Article 3.6/3.7 tartibida sanash o'rniga
 * maksimal og'irlikdagi matching ishlatiladi (ADR-0007/0009) — og'irliklar
 * (bracket-weights.ts) kriteriylarni leksikografik kodlaydi, shuning uchun
 * matching optimumi = eng yaxshi nomzod (Article 3.8.1 semantikasi).
 *
 * TO'LIQLIK KAFOLATI ([C4], Article 2.2): oxirgi bracket yopilmasa, oxirgi
 * ikki scoregroup birlashtirilib qayta uriniladi; kaskad yuqoriga davom
 * etadi — eng yomon holatda BITTA global bracket qoladi, unda esa matching
 * (juftlik soni dominant og'irlik bilan) mavjud bo'lgan har qanday to'liq
 * juftlashtirishni topadi. Ya'ni: C1–C3 ni buzmaydigan to'liq juftlashtirish
 * MAVJUD bo'lsa, bu protsedura ALBATTA topadi; mavjud bo'lmasa —
 * PairingImpossibleError (Article 1.9.3 — hakam hal qiladi).
 *
 * PAB ([C5]/[C9]/[C2]): toq sonda oxirgi bracketga virtual "dummy" tugun
 * qo'shiladi; unga qirra faqat C2 bo'yicha haqli o'yinchilardan o'tkaziladi,
 * og'irlik C5 (ochko minimal) va C9 (o'ynalmaganlar minimal) ni kodlaydi.
 * Dummy bilan juftlashgan o'yinchi = PAB oluvchi. TB darajasida dummy
 * qirra bonus olmaydi, shuning uchun teng sharoitda PAB pastki (eng past
 * rankdagi) o'yinchiga tushadi — Article 3 dagi "oxirgi qolgan" semantikasi.
 */

import { PairingImpossibleError, type RoundId } from '../pairing.types';
import { maximumWeightMatching, type WeightedEdge } from './blossom';
import { colorPenaltiesFor, type BracketSlot, type WeightScheme } from './bracket-weights';
import { canMeet, type SwissPlayer } from './swiss-types';

export interface BracketsOutcome {
  /** Juftliklar [yuqori rank, quyi rank] tartibida. */
  readonly pairs: readonly (readonly [SwissPlayer, SwissPlayer])[];
  /** PAB oluvchi (toq sonda) yoki null. */
  readonly pab: SwissPlayer | null;
  /**
   * Nechta scoregroup birlashtirishga to'g'ri keldi (0 — sof FIDE ketma-ketligi).
   * Diagnostika uchun.
   */
  readonly mergeCount: number;
}

interface BracketResult {
  readonly pairs: readonly (readonly [SwissPlayer, SwissPlayer])[];
  readonly floaters: readonly SwissPlayer[];
  readonly pab: SwissPlayer | null;
}

/**
 * Barcha bracketlarni yuqoridan pastga juftlashtiradi.
 * @param players — aktiv o'yinchilar, Article 1.2 tartibida.
 * @throws {PairingImpossibleError} to'liq juftlashtirish mavjud bo'lmasa.
 */
export function pairAllBrackets(
  players: readonly SwissPlayer[],
  scheme: WeightScheme,
  needPab: boolean,
  roundId: RoundId,
): BracketsOutcome {
  let groups = groupByScore(players);
  let mergeCount = 0;

  for (;;) {
    const outcome = attempt(groups, scheme, needPab);
    if (outcome !== null) {
      return { pairs: outcome.pairs, pab: outcome.pab, mergeCount };
    }
    if (groups.length === 1) {
      // Global bracket ham yopilmadi → C1–C3 ostida to'liq juftlashtirish
      // umuman mavjud emas. KUTILGAN holat (masalan, N=4 va 5-tur).
      throw new PairingImpossibleError(
        roundId,
        `${String(players.length)} aktiv o'yinchini C1 (takror juftlik) va C3 ` +
          `(bir xil absolyut rang afzalligi) cheklovlarini buzmasdan to'liq ` +
          `juftlab bo'lmaydi${needPab ? " (yoki C2 bo'yicha PAB olishga haqli o'yinchi qolmadi)" : ''}. ` +
          'Hakam qo\'lda aralashishi kerak (FIDE C.04.3 Article 1.9.3).',
      );
    }
    // Oxirgi ikki scoregroup birlashtiriladi va qaytadan uriniladi.
    groups = mergeLastTwo(groups);
    mergeCount += 1;
  }
}

/** Ochko bo'yicha kamayuvchi guruhlar (kirish allaqachon saralangan). */
function groupByScore(players: readonly SwissPlayer[]): SwissPlayer[][] {
  const groups: SwissPlayer[][] = [];
  let current: SwissPlayer[] = [];
  let currentScore: number | null = null;
  for (const p of players) {
    if (currentScore === null || p.scoreX2 !== currentScore) {
      current = [];
      groups.push(current);
      currentScore = p.scoreX2;
    }
    current.push(p);
  }
  return groups;
}

function mergeLastTwo(groups: readonly SwissPlayer[][]): SwissPlayer[][] {
  const head = groups.slice(0, -2);
  const beforeLast = groups[groups.length - 2];
  const last = groups[groups.length - 1];
  if (beforeLast === undefined || last === undefined) {
    throw new Error('score-brackets ichki xato: birlashtirishga guruh yetmadi');
  }
  return [...head.map((g) => [...g]), [...beforeLast, ...last]];
}

/** Berilgan guruh tuzilishi bilan to'liq o'tishga urinish. */
function attempt(
  groups: readonly (readonly SwissPlayer[])[],
  scheme: WeightScheme,
  needPab: boolean,
): { pairs: (readonly [SwissPlayer, SwissPlayer])[]; pab: SwissPlayer | null } | null {
  let carried: readonly SwissPlayer[] = [];
  const pairs: (readonly [SwissPlayer, SwissPlayer])[] = [];
  let pab: SwissPlayer | null = null;

  for (let gi = 0; gi < groups.length; gi += 1) {
    const residents = groups[gi];
    if (residents === undefined) {
      throw new Error('score-brackets ichki xato: guruh topilmadi');
    }
    const isLast = gi === groups.length - 1;
    const bracketPlayers = [...carried, ...residents];
    const result = pairBracket(bracketPlayers, carried.length, scheme, isLast, isLast && needPab);
    if (result === null) {
      return null; // Faqat oxirgi bracket yiqilishi mumkin.
    }
    pairs.push(...result.pairs);
    carried = result.floaters;
    if (result.pab !== null) {
      pab = result.pab;
    }
  }
  return { pairs, pab };
}

/**
 * Bitta bracketni juftlashtirish.
 *
 * @param carriedCount — MDP lar soni (bracket boshida turadi).
 * @returns null — FAQAT isLast'da: bracket yopilmadi (kimdir juftliksiz
 *          qoldi yoki PAB beriladigan haqli o'yinchi topilmadi).
 */
function pairBracket(
  slots0: readonly SwissPlayer[],
  carriedCount: number,
  scheme: WeightScheme,
  isLast: boolean,
  withDummy: boolean,
): BracketResult | null {
  const size = slots0.length;
  if (size === 0) {
    return withDummy ? null : { pairs: [], floaters: [], pab: null };
  }

  const slots: BracketSlot[] = slots0.map((player, bsn) => ({
    player,
    bsn,
    carried: bsn < carriedCount,
  }));

  // Article 3.2: homogen bracketda S1 = birinchi MaxPairs o'yinchi;
  // heterogen bracketda S1 = pairable MDPlar. TB darajasi uchun chegara.
  const split =
    carriedCount > 0 ? Math.min(carriedCount, Math.floor(size / 2)) : Math.floor(size / 2);

  // "Perfect candidate" qisqa yo'li (Article 3.4.1): homogen, juft sonli,
  // to'g'ridan-to'g'ri S1[i]–S2[i] nomzodi hech qanday kriteriyni buzmasa —
  // u eng yaxshisi (barcha jarimalar 0, TB minimal), matching shart emas.
  // 1-turda katta bracketlar aynan shu yo'ldan o'tadi.
  if (!withDummy && carriedCount === 0 && size % 2 === 0 && allSameScore(slots0)) {
    const straight = tryStraightCandidate(slots0, scheme);
    if (straight !== null) {
      return { pairs: straight, floaters: [], pab: null };
    }
  }

  const vertexCount = size + (withDummy ? 1 : 0);
  const edges: WeightedEdge[] = [];
  for (let i = 0; i < size; i += 1) {
    const si = slots[i];
    if (si === undefined) {
      continue;
    }
    for (let j = i + 1; j < size; j += 1) {
      const sj = slots[j];
      if (sj === undefined) {
        continue;
      }
      if (canMeet(si.player, sj.player)) {
        edges.push({ u: i, v: j, weight: scheme.realEdgeWeight(si, sj, split) });
      }
    }
    if (withDummy && si.player.pabEligible) {
      edges.push({ u: i, v: size, weight: scheme.dummyEdgeWeight(si) });
    }
  }

  const mate = maximumWeightMatching(vertexCount, edges);

  const pairs: (readonly [SwissPlayer, SwissPlayer])[] = [];
  const floaters: SwissPlayer[] = [];
  let pab: SwissPlayer | null = null;
  for (let i = 0; i < size; i += 1) {
    const slot = slots[i];
    const m = mate[i];
    if (slot === undefined || m === undefined) {
      throw new Error('score-brackets ichki xato: matching natijasi to\'liq emas');
    }
    if (m === -1) {
      if (isLast) {
        return null; // [C4] buzildi — yuqoriroq birlashtirish kerak.
      }
      floaters.push(slot.player);
    } else if (withDummy && m === size) {
      pab = slot.player;
    } else if (m > i) {
      const other = slots[m];
      if (other === undefined) {
        throw new Error('score-brackets ichki xato: juftlik sheriги topilmadi');
      }
      pairs.push([slot.player, other.player]);
    }
  }
  if (withDummy && pab === null) {
    return null; // Toq son, lekin PABga haqli o'yinchi juftlanmadi.
  }
  return { pairs, floaters, pab };
}

function allSameScore(players: readonly SwissPlayer[]): boolean {
  const first = players[0];
  if (first === undefined) {
    return true;
  }
  return players.every((p) => p.scoreX2 === first.scoreX2);
}

/**
 * To'g'ridan-to'g'ri S1[i]–S2[i] nomzodi (Article 3.3.1) — barcha juftliklar
 * C1/C3 ga mos va C10–C13 jarimalari nol bo'lsa qaytariladi, aks holda null.
 */
function tryStraightCandidate(
  players: readonly SwissPlayer[],
  scheme: WeightScheme,
): (readonly [SwissPlayer, SwissPlayer])[] | null {
  const half = players.length / 2;
  const pairs: (readonly [SwissPlayer, SwissPlayer])[] = [];
  for (let i = 0; i < half; i += 1) {
    const hi = players[i];
    const lo = players[half + i];
    if (hi === undefined || lo === undefined) {
      return null;
    }
    if (!canMeet(hi, lo)) {
      return null;
    }
    const pens = colorPenaltiesFor(hi, lo, scheme.params.initialColor);
    if (pens.c10 + pens.c11 + pens.c12 + pens.c13 > 0) {
      return null;
    }
    pairs.push([hi, lo]);
  }
  return pairs;
}
