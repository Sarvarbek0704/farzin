import type {
  Glicko2Calculator,
  MatchOutcome,
  RatingSnapshot,
} from '../../core/rating/glicko2.types';

/**
 * Davr hisobining SOF orkestratsiyasi — Prisma yo'q, NestJS yo'q, I/O yo'q.
 *
 * Glicko-2 batch semantikasi (docs/06-rating-system.md §3): davrdagi BARCHA
 * o'yinchi bir vaqtda, davr BOSHIDAGI snapshot asosida hisoblanadi. Raqib
 * reytingi ham davr boshidagisi — davr oxiridagisi emas (§2, "Muhim" izohi).
 *
 * Determinizm (docs/06 §9.3): float qo'shish assotsiativ emas, shuning
 * uchun o'yinlar HAR DOIM pairingId bo'yicha, o'yinchilar playerId bo'yicha
 * sortlanadi — DB qaytarish tartibiga tayanmaymiz. Natijada bir xil kirish →
 * bit darajasida bir xil chiqish (idempotentlik shu yerdan boshlanadi).
 */

// --- Kirish tiplari -----------------------------------------------------------

/**
 * Reytingga kiradigan bitta partiya. FAQAT taxtada o'ynalgan hal qiluvchi
 * natijalar: WHITE_WIN | BLACK_WIN | DRAW (result-mapping.ts jadvalida
 * playedOverBoard=true bo'lgan yagona uchlik). Forfeit/bye/bekor qilingan
 * o'yin REYTINGGA KIRMAYDI — bu hard rule (docs/06 §11.4, FIDE ham
 * o'ynalmagan partiyani hisoblamaydi).
 */
export interface RatedGame {
  readonly pairingId: string;
  readonly whitePlayerId: string;
  readonly blackPlayerId: string;
  readonly result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW';
}

/** O'yinchining davr BOSHIDAGI to'liq holati. */
export interface PrePeriodState {
  readonly rating: number;
  readonly deviation: number;
  readonly volatility: number;
  /** Shu kategoriyada JAMI o'ynalgan reytingli o'yinlar (davrgacha). */
  readonly gamesPlayed: number;
  readonly isProvisional: boolean;
  readonly peakRating: number | null;
}

/** Yangi o'yinchi — Glicko-2 standart boshlang'ich (docs/06 §4.1). */
export const DEFAULT_PRE_PERIOD_STATE: PrePeriodState = Object.freeze({
  rating: 1500,
  deviation: 350,
  volatility: 0.06,
  gamesPlayed: 0,
  isProvisional: true,
  peakRating: null,
});

/** Established chegaralari — docs/06-rating-system.md §4.2. */
export const ESTABLISHED_MIN_GAMES = 8;
export const ESTABLISHED_MAX_RD = 110;

/** docs/06 §4.3 chegaralari — clamp'ga urilishni aniqlash uchun. */
const MIN_RATING = 100;
const MIN_VOLATILITY = 0.01;
const MAX_VOLATILITY = 0.1;

// --- Chiqish tiplari -----------------------------------------------------------

/** RatingHistory.inputGames JSON elementi (docs/06 §8.2 opponent_snapshot). */
export interface InputGameEntry {
  readonly pairingId: string;
  readonly opponentId: string;
  /** Raqibning davr BOSHIDAGI reytingi — muzlatilgan snapshot. */
  readonly opponentRating: number;
  readonly opponentRd: number;
  readonly score: 0 | 0.5 | 1;
}

export interface PlayerPeriodResult {
  readonly playerId: string;
  readonly before: RatingSnapshot;
  readonly after: RatingSnapshot;
  /** 0 = o'ynamagan (faqat RD o'sishi, docs/06 §2.11). */
  readonly gamesInPeriod: number;
  /** Davrdan KEYINGI jami o'yinlar soni. */
  readonly gamesPlayedTotal: number;
  /**
   * Davrdan keyingi provisional holat. BIR TOMONLAMA O'TISH: established
   * bo'lgan o'yinchi hech qachon provisional'ga QAYTMAYDI (docs/06 §4.2 —
   * qoida "qachon established bo'ladi" haqida; teskari yo'l yo'q).
   */
  readonly isProvisional: boolean;
  /** Yangi peak (butun son) yoki eski qiymat. */
  readonly peakRating: number | null;
  /** Peak yangilandi — repository peakRatingAt ni qo'ysin. */
  readonly peakChanged: boolean;
  readonly inputGames: readonly InputGameEntry[];
  /**
   * Clamp'ga urilish — bug alomati bo'lishi mumkin, service WARN bilan
   * loglaydi va kuzatadi (docs/06 §10.4). Bo'sh = toza hisob.
   */
  readonly clampWarnings: readonly string[];
}

// --- Sof funksiyalar ------------------------------------------------------------

/** Natija → ochko, tomon nuqtai nazaridan (result-mapping.ts jadvali bilan mos). */
export function scoreFor(result: RatedGame['result'], side: 'WHITE' | 'BLACK'): 0 | 0.5 | 1 {
  if (result === 'DRAW') {
    return 0.5;
  }
  const whiteWon = result === 'WHITE_WIN';
  return (side === 'WHITE') === whiteWon ? 1 : 0;
}

/** docs/06 §4.2: established = kamida 8 o'yin VA RD ≤ 110 — ikkalasi ham. */
export function isEstablished(gamesPlayed: number, deviation: number): boolean {
  return gamesPlayed >= ESTABLISHED_MIN_GAMES && deviation <= ESTABLISHED_MAX_RD;
}

interface PerPlayerGame {
  readonly pairingId: string;
  readonly opponentId: string;
  readonly score: 0 | 0.5 | 1;
}

/**
 * Partiyalarni o'yinchi nuqtai nazariga yoyish: har partiya ikki yozuv
 * (oq va qora uchun). Har o'yinchi ro'yxati pairingId bo'yicha sortlanadi —
 * yig'indi tartibi deterministik (docs/06 §9.3 #4).
 */
export function groupGamesByPlayer(
  games: readonly RatedGame[],
): Map<string, readonly PerPlayerGame[]> {
  const byPlayer = new Map<string, PerPlayerGame[]>();
  const push = (playerId: string, game: PerPlayerGame): void => {
    const list = byPlayer.get(playerId);
    if (list === undefined) {
      byPlayer.set(playerId, [game]);
    } else {
      list.push(game);
    }
  };

  for (const g of games) {
    push(g.whitePlayerId, {
      pairingId: g.pairingId,
      opponentId: g.blackPlayerId,
      score: scoreFor(g.result, 'WHITE'),
    });
    push(g.blackPlayerId, {
      pairingId: g.pairingId,
      opponentId: g.whitePlayerId,
      score: scoreFor(g.result, 'BLACK'),
    });
  }

  for (const list of byPlayer.values()) {
    list.sort((a, b) => (a.pairingId < b.pairingId ? -1 : a.pairingId > b.pairingId ? 1 : 0));
  }
  return byPlayer;
}

function toSnapshot(state: PrePeriodState): RatingSnapshot {
  return {
    rating: state.rating,
    deviation: state.deviation,
    volatility: state.volatility,
  };
}

function clampWarningsFor(
  playerId: string,
  after: RatingSnapshot,
  gamesInPeriod: number,
): string[] {
  const warnings: string[] = [];
  // σ clamp — HAR DOIM bug alomati (docs/06 §4.3): Illinois to'g'ri ishlasa
  // bu chegaraga yetmasligi kerak.
  if (after.volatility <= MIN_VOLATILITY || after.volatility >= MAX_VOLATILITY) {
    warnings.push(`volatility clamp: player=${playerId} sigma=${String(after.volatility)}`);
  }
  if (after.rating <= MIN_RATING) {
    warnings.push(`rating floor clamp: player=${playerId} rating=${String(after.rating)}`);
  }
  // RD=350 faqat O'YNAGAN o'yinchida g'alati — o'ynamaganda kutilgan holat
  // (docs/06 §3.4 yuqori chegara).
  if (gamesInPeriod > 0 && after.deviation >= 350) {
    warnings.push(`deviation ceiling clamp: player=${playerId} RD=${String(after.deviation)}`);
  }
  return warnings;
}

/**
 * Bitta davrning to'liq hisobi — `states` dagi HAR BIR o'yinchi uchun natija:
 *
 *  - o'yin o'ynaganlar → Glicko-2 to'liq qadamlar (raqib snapshot'i davr
 *    boshidan — `states` dan, u yo'q bo'lsa yangi o'yinchi default'i);
 *  - o'ynamaganlar → bo'sh outcomes bilan compute → faqat RD o'sadi.
 *
 * SOF va DETERMINISTIK: bir xil kirish ikki marta → chuqur teng chiqish.
 * Bu xususiyat idempotent recompute'ning matematik yarmi (docs/06 §9.3);
 * ikkinchi yarmi — repository'da absolyut qiymatli upsert.
 */
export function computePeriodResults(
  calculator: Glicko2Calculator,
  games: readonly RatedGame[],
  states: ReadonlyMap<string, PrePeriodState>,
): PlayerPeriodResult[] {
  const byPlayer = groupGamesByPlayer(games);

  // Hisoblanadigan to'plam: holati bor o'yinchilar ∪ o'yin o'ynaganlar.
  // O'yinchilar tartibi ham deterministik (playerId ASC).
  const playerIds = [...new Set([...states.keys(), ...byPlayer.keys()])].sort();

  const stateOf = (playerId: string): PrePeriodState =>
    states.get(playerId) ?? DEFAULT_PRE_PERIOD_STATE;

  return playerIds.map((playerId) => {
    const state = stateOf(playerId);
    const playerGames = byPlayer.get(playerId) ?? [];

    const inputGames: InputGameEntry[] = playerGames.map((g) => {
      const opponent = stateOf(g.opponentId);
      return {
        pairingId: g.pairingId,
        opponentId: g.opponentId,
        opponentRating: opponent.rating,
        opponentRd: opponent.deviation,
        score: g.score,
      };
    });

    const outcomes: MatchOutcome[] = inputGames.map((g) => ({
      opponent: {
        rating: g.opponentRating,
        deviation: g.opponentRd,
        // Raqib volatility'si hisobga KIRMAYDI (Glicko-2 faqat rⱼ, RDⱼ
        // ishlatadi) — snapshot tipi talab qilgani uchun o'z qiymati emas,
        // neytral default beriladi.
        volatility: 0.06,
      },
      score: g.score,
    }));

    const before = toSnapshot(state);
    const after = calculator.compute(before, outcomes);

    const gamesPlayedTotal = state.gamesPlayed + playerGames.length;
    // Bir tomonlama o'tish: provisional → established, hech qachon teskari.
    const provisionalAfter = state.isProvisional
      ? !isEstablished(gamesPlayedTotal, after.deviation)
      : false;

    // Peak faqat ESTABLISHED bo'lgandan keyin yuritiladi — provisional
    // 1500 atrofidagi shovqin "rekord" emas.
    const candidate = Math.round(after.rating);
    const peakChanged =
      !provisionalAfter && (state.peakRating === null || candidate > state.peakRating);
    const peakRating = peakChanged ? candidate : state.peakRating;

    return {
      playerId,
      before,
      after,
      gamesInPeriod: playerGames.length,
      gamesPlayedTotal,
      isProvisional: provisionalAfter,
      peakRating,
      peakChanged,
      inputGames,
      clampWarnings: clampWarningsFor(playerId, after, playerGames.length),
    };
  });
}
