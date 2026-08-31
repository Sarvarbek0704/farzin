import {
  TieBreakDataError,
  type GameRecord,
  type PlayerTieBreakInput,
  type TieBreakKey,
  type TieBreakOptions,
  type TieBreakResult,
} from './tiebreak.types';

/**
 * Tie-break hisoblagichi — FIDE C.02 asosidagi formulalar.
 *
 * Sof funksiya: holat yo'q, yon ta'sir yo'q, determinizm kafolatlangan
 * (`Math.random`/`Date.now` yo'q, `Set`/`Map` iteratsiyasi faqat kirish
 * tartibida). Framework bog'liqligi yo'q (ADR-0001, `core-must-stay-pure`).
 *
 * Formulalar: docs/05-pairing-engine.md §7.1–§7.8.
 * Dizayn (rankPlayers, null → o'tkazib yuborish): §7.9.
 *
 * ARIFMETIKA (§7.9, AC-31): barcha ochko hisoblari YARIM OCHKO birligida
 * (butun son) bajariladi. Sonneborn-Berger ikki yarim-ochko ko'paytmasi
 * bo'lgani uchun ichkarida CHORAK ochko birligida (butun son) yuradi.
 * Faqat chiqishda (ko'rsatish qiymati) 2 yoki 4 ga bo'linadi — bu ham
 * aniq: .0 / .5 / .25 qiymatlar ikkilik sanoqda yo'qotishsiz ifodalanadi.
 *
 * UNPLAYED GAMES (§7.1, FIDE C.02): o'ynalmagan partiya (bye, forfeit)
 * uchun Buchholz'da VIRTUAL OPPONENT ishlatiladi — R-turda o'yinchining
 * o'sha paytdagi ochkosiga ega, natijasi teskari, qolgan turlarda durang
 * qiladigan faraziy raqib:
 *
 *   S(VO) = S(p, R gacha) + (1 − natija(R)) + 0.5 × (n − R)
 *
 * bu yerda `n` — turnirdagi turlar soni (kirishdagi eng uzun `games`
 * massivi uzunligi), `R` — o'ynalmagan tur raqami.
 */

/** Yakuniy, kafolatlangan tie-break — playerId (UUID v7). §6.1 izohi. */
function comparePlayerId(a: string, b: string): number {
  // localeCompare EMAS — ICU versiyasiga bog'liq (§6.3). Kod nuqtasi bo'yicha.
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Ochko (0.5 qadam) → yarim ochko birligi (butun son). AC-31. */
function toHalfPoints(points: number): number {
  const doubled = points * 2;
  const rounded = Math.round(doubled);
  if (doubled !== rounded) {
    throw new TieBreakDataError(`ochko 0.5 qadamda emas: ${String(points)}`);
  }
  return rounded;
}

/** Ichki kontekst — bir chaqiriq davomida bir marta quriladi. */
interface TieBreakContext {
  readonly players: readonly PlayerTieBreakInput[];
  /** playerId → yakuniy ochko (yarim ochko birligida). */
  readonly points2: ReadonlyMap<string, number>;
  readonly byId: ReadonlyMap<string, PlayerTieBreakInput>;
  /** Turnirdagi turlar soni `n` — virtual opponent va Koya chegarasi uchun. */
  readonly totalRounds: number;
}

/**
 * Bir kalit uchun ichki qiymatlar: playerId → butun son (ARO'da kasr
 * bo'lishi mumkin) yoki `null` — tie-break qo'llanilmadi (§7.5 DE).
 */
type InternalValues = ReadonlyMap<string, number | null>;

/**
 * Ichki birlikdan ko'rsatish qiymatiga bo'luvchi.
 * BH oilasi, DE, Cumulative, Koya — yarim ochko (÷2); SB — chorak (÷4);
 * ARO, WINS, BLACK_GAMES — birlik o'zi.
 */
const DISPLAY_DIVISOR: Readonly<Record<TieBreakKey, number>> = {
  BUCHHOLZ: 2,
  BUCHHOLZ_CUT1: 2,
  MEDIAN_BUCHHOLZ: 2,
  SONNEBORN_BERGER: 4,
  DIRECT_ENCOUNTER: 2,
  CUMULATIVE: 2,
  ARO: 1,
  KOYA: 2,
  WINS: 1,
  BLACK_GAMES: 1,
};

export class TieBreakCalculator {
  constructor(private readonly options: TieBreakOptions = {}) {}

  /**
   * FAQAT so'ralgan kalitlarni har bir o'yinchi uchun hisoblaydi.
   *
   * Natija `Standing.tieBreakValues` JSON'iga to'g'ridan-to'g'ri yoziladi.
   * Qo'llanilmagan tie-break (DE to'liq bo'lmagan mini-turnir, §7.5)
   * natijada KALITSIZ qoladi — `null` yozilmaydi.
   *
   * @throws {TieBreakDataError} kirish ma'lumoti ziddiyatli bo'lsa
   */
  compute(
    players: readonly PlayerTieBreakInput[],
    order: readonly TieBreakKey[],
  ): Map<string, TieBreakResult> {
    const ctx = buildContext(players);
    const result = new Map<string, TieBreakResult>();
    for (const p of players) {
      result.set(p.playerId, {});
    }

    for (const key of dedupe(order)) {
      const values = this.computeInternal(key, ctx);
      const divisor = DISPLAY_DIVISOR[key];
      for (const p of players) {
        const raw = values.get(p.playerId);
        if (raw !== null && raw !== undefined) {
          const record = result.get(p.playerId);
          if (record) {
            record[key] = raw / divisor;
          }
        }
      }
    }

    return result;
  }

  /**
   * Yakuniy jadval tartibi (§7.9 `rankPlayers` dizayni):
   *
   *  1. Ochko — kamayish tartibida.
   *  2. `order` dagi tie-break'lar leksikografik; barcha 10 kalit uchun
   *     yuqori qiymat = yuqori o'rin. Qo'llanilmagan qiymat (`null`, DE)
   *     → shu kalit O'TKAZIB YUBORILADI (§7.9).
   *  3. Oxirgi, kafolatlangan tie-break — `playerId` (UUID v7 o'sish
   *     tartibida). Bu total deterministik tartibni ta'minlaydi.
   *
   * @returns playerId'lar yakuniy tartibda (yuqori o'rin birinchi)
   * @throws {TieBreakDataError} kirish ma'lumoti ziddiyatli bo'lsa
   */
  rank(players: readonly PlayerTieBreakInput[], order: readonly TieBreakKey[]): readonly string[] {
    const ctx = buildContext(players);
    const keys = dedupe(order);
    const values = new Map<TieBreakKey, InternalValues>();
    for (const key of keys) {
      values.set(key, this.computeInternal(key, ctx));
    }

    return [...players]
      .sort((a, b) => {
        const pa = ctx.points2.get(a.playerId) ?? 0;
        const pb = ctx.points2.get(b.playerId) ?? 0;
        if (pa !== pb) {
          return pb - pa;
        }

        for (const key of keys) {
          const byPlayer = values.get(key);
          const va = byPlayer?.get(a.playerId) ?? null;
          const vb = byPlayer?.get(b.playerId) ?? null;
          if (va === null || vb === null) {
            continue; // §7.9: qo'llanilmagan tie-break o'tkazib yuboriladi
          }
          if (va !== vb) {
            return vb - va; // yuqori qiymat = yuqori o'rin
          }
        }

        return comparePlayerId(a.playerId, b.playerId);
      })
      .map((p) => p.playerId);
  }

  /** Bir kalit — barcha o'yinchilar. Qiymatlar ICHKI birlikda. */
  private computeInternal(key: TieBreakKey, ctx: TieBreakContext): InternalValues {
    switch (key) {
      case 'BUCHHOLZ':
        return mapPlayers(ctx, (p) => sum(buchholzContributions2(p, ctx)));
      case 'BUCHHOLZ_CUT1':
        return mapPlayers(ctx, (p) => buchholzCut(buchholzContributions2(p, ctx), 1, 0));
      case 'MEDIAN_BUCHHOLZ':
        return mapPlayers(ctx, (p) => buchholzCut(buchholzContributions2(p, ctx), 1, 1));
      case 'SONNEBORN_BERGER':
        return mapPlayers(ctx, (p) => sonnebornBerger4(p, ctx));
      case 'DIRECT_ENCOUNTER':
        return directEncounter2(ctx);
      case 'CUMULATIVE':
        return mapPlayers(ctx, (p) => cumulative2(p));
      case 'ARO':
        return mapPlayers(ctx, (p) => this.aro(p, ctx));
      case 'KOYA':
        return mapPlayers(ctx, (p) => koya2(p, ctx));
      case 'WINS':
        return mapPlayers(ctx, (p) => wins(p));
      case 'BLACK_GAMES':
        return mapPlayers(ctx, (p) => blackGames(p));
    }
  }

  /**
   * ARO — raqiblarning o'rtacha reytingi (§7.7). Faqat taxtada o'ynalgan
   * partiyalar. Reytingsiz raqib: `options.unratedRating` berilgan bo'lsa
   * o'sha qiymat, aks holda raqib hisobdan chiqariladi. Raqib qolmasa — 0.
   *
   * Yagona kasrli tie-break: reyting yig'indisi butun, bo'lish bir marta
   * oxirida — determinizm saqlanadi.
   */
  private aro(p: PlayerTieBreakInput, ctx: TieBreakContext): number {
    let ratingSum = 0;
    let count = 0;
    for (const game of p.games) {
      if (!game.playedOverBoard || game.opponentId === null) {
        continue;
      }
      const opponent = ctx.byId.get(game.opponentId);
      const rating = opponent?.rating ?? this.options.unratedRating;
      if (rating === undefined) {
        continue;
      }
      ratingSum += rating;
      count += 1;
    }
    return count === 0 ? 0 : ratingSum / count;
  }
}

// ─── Kontekst va yordamchilar ────────────────────────────────────────────────

function buildContext(players: readonly PlayerTieBreakInput[]): TieBreakContext {
  const byId = new Map<string, PlayerTieBreakInput>();
  const points2 = new Map<string, number>();
  let totalRounds = 0;

  for (const p of players) {
    if (byId.has(p.playerId)) {
      throw new TieBreakDataError(`dublikat o'yinchi: ${p.playerId}`);
    }
    byId.set(p.playerId, p);
    points2.set(p.playerId, toHalfPoints(p.points));
    if (p.games.length > totalRounds) {
      totalRounds = p.games.length;
    }
  }

  for (const p of players) {
    for (const game of p.games) {
      if (game.playedOverBoard && game.opponentId === null) {
        throw new TieBreakDataError(
          `${p.playerId}: taxtada o'ynalgan partiya raqibsiz bo'lishi mumkin emas`,
        );
      }
      if (game.opponentId !== null && !byId.has(game.opponentId)) {
        throw new TieBreakDataError(`${p.playerId}: noma'lum raqib ${game.opponentId}`);
      }
    }
  }

  return { players, points2, byId, totalRounds };
}

function mapPlayers(ctx: TieBreakContext, fn: (p: PlayerTieBreakInput) => number): InternalValues {
  const out = new Map<string, number | null>();
  for (const p of ctx.players) {
    out.set(p.playerId, fn(p));
  }
  return out;
}

function dedupe(order: readonly TieBreakKey[]): readonly TieBreakKey[] {
  const seen = new Set<TieBreakKey>();
  const out: TieBreakKey[] = [];
  for (const key of order) {
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}

/** Natija yarim ochko birligida: 1 → 2, 0.5 → 1, 0 → 0. Aniq (0.5 = 2⁻¹). */
function result2(game: GameRecord): number {
  return game.result * 2;
}

/** Raqibning yakuniy ochkosi (yarim ochkoda). Kontekst validatsiyadan o'tgan. */
function opponentPoints2(opponentId: string, ctx: TieBreakContext): number {
  return ctx.points2.get(opponentId) ?? 0;
}

// ─── §7.1 Buchholz ───────────────────────────────────────────────────────────

/**
 * Har tur uchun Buchholz hissasi (yarim ochkoda), tur tartibida:
 *
 *  - taxtada o'ynalgan partiya → raqibning yakuniy ochkosi `S(o)`;
 *  - o'ynalmagan (bye/forfeit, `playedOverBoard = false`) → VIRTUAL
 *    OPPONENT ochkosi (§7.1, FIDE C.02). Forfeit'da `opponentId` mavjud
 *    bo'lsa ham HAQIQIY raqib ochkosi OLINMAYDI — partiya o'ynalmagan.
 *
 * Virtual opponent (yarim ochko birligida):
 *   S₂(VO) = S₂(p, R gacha) + (2 − natija₂(R)) + (n − R)
 * `0.5 × (n − R)` yarim ochkoda aynan `n − R` bo'ladi — butun arifmetika.
 */
function buchholzContributions2(p: PlayerTieBreakInput, ctx: TieBreakContext): number[] {
  const contributions: number[] = [];
  let before2 = 0; // S₂(p, R gacha) — turgacha yig'ilgan ochko

  for (let i = 0; i < p.games.length; i++) {
    const game = p.games[i];
    if (!game) {
      continue;
    }
    const r2 = result2(game);
    if (game.playedOverBoard && game.opponentId !== null) {
      contributions.push(opponentPoints2(game.opponentId, ctx));
    } else {
      const round = i + 1;
      contributions.push(before2 + (2 - r2) + (ctx.totalRounds - round));
    }
    before2 += r2;
  }

  return contributions;
}

/**
 * §7.2 Cut-1 / §7.3 Median: eng past `cutLow` va eng yuqori `cutHigh`
 * hissa chiqariladi. Hissalar yetarli bo'lmasa — 0 (kesishdan keyin
 * hech narsa qolmaydi).
 */
function buchholzCut(contributions2: readonly number[], cutLow: number, cutHigh: number): number {
  if (contributions2.length <= cutLow + cutHigh) {
    return 0;
  }
  const sorted = [...contributions2].sort((a, b) => a - b);
  let total = 0;
  for (let i = cutLow; i < sorted.length - cutHigh; i++) {
    total += sorted[i] ?? 0;
  }
  return total;
}

// ─── §7.4 Sonneborn-Berger ───────────────────────────────────────────────────

/**
 * SB(p) = Σ S(o) × R(p, o) — faqat taxtada o'ynalgan partiyalar (§7.4
 * `Opp(p)` bo'yicha; o'ynalmagan turda raqib yo'q). Ikkala ko'paytuvchi
 * yarim ochkoda → natija CHORAK ochko birligida (butun son).
 */
function sonnebornBerger4(p: PlayerTieBreakInput, ctx: TieBreakContext): number {
  let total4 = 0;
  for (const game of p.games) {
    if (game.playedOverBoard && game.opponentId !== null) {
      total4 += opponentPoints2(game.opponentId, ctx) * result2(game);
    }
  }
  return total4;
}

// ─── §7.5 Direct encounter ───────────────────────────────────────────────────

/**
 * DE — ochkosi teng o'yinchilar orasidagi mini-turnir. Guruhdagi HAR BIR
 * juftlik kamida bir marta taxtada uchrashgan bo'lsagina qo'llanadi;
 * aks holda butun guruh uchun `null` (§7.5 — "to'liq emas → DE
 * qo'llanilmaydi"). Yolg'iz o'yinchi guruhida qiymat 0 (bo'sh yig'indi,
 * §7.5 dagi implementatsiya bilan mos).
 */
function directEncounter2(ctx: TieBreakContext): InternalValues {
  const groups = new Map<number, PlayerTieBreakInput[]>();
  for (const p of ctx.players) {
    const pts = ctx.points2.get(p.playerId) ?? 0;
    const group = groups.get(pts);
    if (group) {
      group.push(p);
    } else {
      groups.set(pts, [p]);
    }
  }

  const out = new Map<string, number | null>();
  for (const group of groups.values()) {
    const memberIds = new Set(group.map((p) => p.playerId));
    const scores = new Map<string, number>();
    let complete = true;

    for (const p of group) {
      const met = new Set<string>();
      let sum2 = 0;
      for (const game of p.games) {
        if (
          game.playedOverBoard &&
          game.opponentId !== null &&
          game.opponentId !== p.playerId &&
          memberIds.has(game.opponentId)
        ) {
          met.add(game.opponentId);
          sum2 += result2(game);
        }
      }
      if (met.size < memberIds.size - 1) {
        complete = false; // kimdir guruhdagi kimdir bilan o'ynamagan
        break;
      }
      scores.set(p.playerId, sum2);
    }

    for (const p of group) {
      out.set(p.playerId, complete ? (scores.get(p.playerId) ?? 0) : null);
    }
  }

  return out;
}

// ─── §7.6 Cumulative (Progressive) ───────────────────────────────────────────

/**
 * Cum(p) = Σ running_score(p, r) — har turdan keyingi joriy ochkolar
 * yig'indisi. Misol (§7.6): 1,1,0,1 → running 1,2,2,3 → Cum = 8.
 * Bye/forfeit natijasi ham joriy ochkoga kiradi — doc boshqacha
 * tuzatish belgilamagan.
 */
function cumulative2(p: PlayerTieBreakInput): number {
  let running2 = 0;
  let total2 = 0;
  for (const game of p.games) {
    running2 += result2(game);
    total2 += running2;
  }
  return total2;
}

// ─── §7.8 Koya ───────────────────────────────────────────────────────────────

/**
 * Koya(p) = Σ R(p, o), S(o) ≥ 0.5 × R_max bo'lgan raqiblarga qarshi.
 * `R_max` — maksimal mumkin ochko = turlar soni `n`. Yarim ochkoda
 * chegara: S₂(o) ≥ n. Faqat taxtada o'ynalgan partiyalar.
 */
function koya2(p: PlayerTieBreakInput, ctx: TieBreakContext): number {
  let total2 = 0;
  for (const game of p.games) {
    if (
      game.playedOverBoard &&
      game.opponentId !== null &&
      opponentPoints2(game.opponentId, ctx) >= ctx.totalRounds
    ) {
      total2 += result2(game);
    }
  }
  return total2;
}

// ─── WINS / BLACK_GAMES ──────────────────────────────────────────────────────

/**
 * WINS — g'alabalar soni (FIDE C.02 "Number of Games Won"): raqibga
 * qarshi olingan har qanday g'alaba, forfeit-win HAM kiradi. Raqibsiz
 * to'liq ochko (PAB bye) g'alaba EMAS — hisobga kirmaydi.
 */
function wins(p: PlayerTieBreakInput): number {
  let count = 0;
  for (const game of p.games) {
    if (game.result === 1 && game.opponentId !== null) {
      count += 1;
    }
  }
  return count;
}

/**
 * BLACK_GAMES — qora dona bilan TAXTADA o'ynalgan partiyalar soni
 * (FIDE C.02 "Number of games played with Black"; o'ynalmaganlari
 * hisobga kirmaydi).
 */
function blackGames(p: PlayerTieBreakInput): number {
  let count = 0;
  for (const game of p.games) {
    if (game.playedOverBoard && game.color === 'BLACK') {
      count += 1;
    }
  }
  return count;
}
