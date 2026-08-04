import { Glicko2Service } from '../../core/rating/glicko2.service';
import {
  computePeriodResults,
  DEFAULT_PRE_PERIOD_STATE,
  groupGamesByPlayer,
  isEstablished,
  type PrePeriodState,
  type RatedGame,
  scoreFor,
} from './period-computation';
import { isValidRatingCombo } from './rating.types';

/**
 * Davr hisobining sof orkestratsiyasi testlari (docs/06-rating-system.md
 * §3 batch semantika, §4.2 provisional, §2.11 idle RD o'sishi, §9.3
 * idempotentlik/determinizm).
 *
 * Hisoblagich — REAL Glicko2Service (Glickman vektori bilan tasdiqlangan,
 * core/rating). Mock emas: orkestratsiya xatosi matematika bilan birga
 * ushlansin.
 */

const calculator = new Glicko2Service();

const A = '00000000-0000-7000-8000-00000000000a';
const B = '00000000-0000-7000-8000-00000000000b';
const C = '00000000-0000-7000-8000-00000000000c';
const D = '00000000-0000-7000-8000-00000000000d';
const E = '00000000-0000-7000-8000-00000000000e';

function state(partial: Partial<PrePeriodState> = {}): PrePeriodState {
  return { ...DEFAULT_PRE_PERIOD_STATE, ...partial };
}

function game(
  pairingId: string,
  white: string,
  black: string,
  result: RatedGame['result'],
): RatedGame {
  return { pairingId, whitePlayerId: white, blackPlayerId: black, result };
}

function resultOf(
  results: ReturnType<typeof computePeriodResults>,
  playerId: string,
): ReturnType<typeof computePeriodResults>[number] {
  const found = results.find((r) => r.playerId === playerId);
  if (found === undefined) {
    throw new Error(`natija topilmadi: ${playerId}`);
  }
  return found;
}

describe('scoreFor — natija → ochko xaritasi (result-mapping bilan mos)', () => {
  it.each([
    ['WHITE_WIN', 'WHITE', 1],
    ['WHITE_WIN', 'BLACK', 0],
    ['BLACK_WIN', 'WHITE', 0],
    ['BLACK_WIN', 'BLACK', 1],
    ['DRAW', 'WHITE', 0.5],
    ['DRAW', 'BLACK', 0.5],
  ] as const)('%s / %s → %d', (result, side, expected) => {
    expect(scoreFor(result, side)).toBe(expected);
  });
});

describe('isValidRatingCombo — OTB_BULLET mavjud emas (docs/06 §5.1)', () => {
  it('OTB + BULLET → false', () => {
    expect(isValidRatingCombo('OTB', 'BULLET')).toBe(false);
  });

  it("qolgan 7 kombinatsiya to'g'ri", () => {
    expect(isValidRatingCombo('OTB', 'CLASSICAL')).toBe(true);
    expect(isValidRatingCombo('OTB', 'RAPID')).toBe(true);
    expect(isValidRatingCombo('OTB', 'BLITZ')).toBe(true);
    expect(isValidRatingCombo('ONLINE', 'CLASSICAL')).toBe(true);
    expect(isValidRatingCombo('ONLINE', 'RAPID')).toBe(true);
    expect(isValidRatingCombo('ONLINE', 'BLITZ')).toBe(true);
    expect(isValidRatingCombo('ONLINE', 'BULLET')).toBe(true);
  });
});

describe('isEstablished — ikkala shart ham (docs/06 §4.2)', () => {
  it("8 o'yin VA RD ≤ 110 → established", () => {
    expect(isEstablished(8, 110)).toBe(true);
  });
  it("7 o'yin, RD past → hali emas", () => {
    expect(isEstablished(7, 50)).toBe(false);
  });
  it("ko'p o'yin, RD > 110 → hali emas", () => {
    expect(isEstablished(20, 111)).toBe(false);
  });
});

describe('groupGamesByPlayer', () => {
  it("har partiya ikki nuqtai nazar beradi va pairingId bo'yicha sortlanadi", () => {
    const grouped = groupGamesByPlayer([
      game('p2', A, B, 'DRAW'),
      game('p1', B, A, 'WHITE_WIN'),
    ]);
    const aGames = grouped.get(A);
    expect(aGames).toEqual([
      { pairingId: 'p1', opponentId: B, score: 0 },
      { pairingId: 'p2', opponentId: B, score: 0.5 },
    ]);
    const bGames = grouped.get(B);
    expect(bGames?.map((g) => g.score)).toEqual([1, 0.5]);
  });
});

describe('computePeriodResults — ko\'p o\'yinchili davr', () => {
  // Fixture: A yutdi B ni; C va D durrang; E o'ynamadi (idle).
  const games: RatedGame[] = [
    game('pair-1', A, B, 'WHITE_WIN'),
    game('pair-2', C, D, 'DRAW'),
  ];
  const states = new Map<string, PrePeriodState>([
    [A, state()],
    [B, state()],
    [C, state({ rating: 1700, deviation: 80, gamesPlayed: 20 })],
    [D, state({ rating: 1700, deviation: 80, gamesPlayed: 20 })],
    [E, state({ rating: 1600, deviation: 60, gamesPlayed: 30, isProvisional: false })],
  ]);
  const results = computePeriodResults(calculator, games, states);

  it("g'olib ko'tariladi, yutqazgan tushadi — teng startda simmetrik", () => {
    const a = resultOf(results, A);
    const b = resultOf(results, B);
    expect(a.after.rating).toBeGreaterThan(1500);
    expect(b.after.rating).toBeLessThan(1500);
    // Bir xil boshlang'ich holat → o'zgarishlar modul bo'yicha teng.
    expect(a.after.rating - 1500).toBeCloseTo(1500 - b.after.rating, 6);
    // O'yin o'ynash RD ni kamaytiradi (docs/06 §2, qadam 9).
    expect(a.after.deviation).toBeLessThan(350);
    expect(b.after.deviation).toBeLessThan(350);
    expect(a.gamesInPeriod).toBe(1);
    expect(a.gamesPlayedTotal).toBe(1);
  });

  it("teng kuchli raqiblar durrangi reytingni deyarli o'zgartirmaydi", () => {
    const c = resultOf(results, C);
    expect(Math.abs(c.after.rating - 1700)).toBeLessThan(1);
    expect(c.after.deviation).toBeLessThan(80);
  });

  it("idle o'yinchi: reyting o'zgarmaydi, RD o'sadi, volatility o'zgarmaydi", () => {
    const e = resultOf(results, E);
    expect(e.gamesInPeriod).toBe(0);
    expect(e.inputGames).toEqual([]);
    expect(e.after.rating).toBe(1600);
    expect(e.after.deviation).toBeGreaterThan(60);
    expect(e.after.volatility).toBe(0.06);
    // Established o'yinchi provisional'ga QAYTMAYDI (bir tomonlama o'tish).
    expect(e.isProvisional).toBe(false);
  });

  it("inputGames raqibning DAVR BOSHIDAGI snapshot'ini muzlatadi", () => {
    const a = resultOf(results, A);
    expect(a.inputGames).toEqual([
      {
        pairingId: 'pair-1',
        opponentId: B,
        opponentRating: 1500,
        opponentRd: 350,
        score: 1,
      },
    ]);
  });

  it("holati yo'q o'yinchi standart 1500/350/0.06 dan boshlaydi (docs/06 §4.1)", () => {
    const partial = computePeriodResults(calculator, [game('pair-x', A, B, 'DRAW')], new Map());
    expect(resultOf(partial, A).before).toEqual({
      rating: 1500,
      deviation: 350,
      volatility: 0.06,
    });
  });
});

describe('provisional → established o\'tish (docs/06 §4.2)', () => {
  it("8-o'yin + RD ≤ 110 → established bo'ladi", () => {
    const states = new Map<string, PrePeriodState>([
      [A, state({ rating: 1550, deviation: 60, gamesPlayed: 7, isProvisional: true })],
      [B, state({ rating: 1500, deviation: 50, gamesPlayed: 40, isProvisional: false })],
    ]);
    const results = computePeriodResults(
      calculator,
      [game('pair-1', A, B, 'WHITE_WIN')],
      states,
    );
    const a = resultOf(results, A);
    expect(a.gamesPlayedTotal).toBe(8);
    expect(a.after.deviation).toBeLessThanOrEqual(110);
    expect(a.isProvisional).toBe(false);
  });

  it("8 o'yin bor, lekin RD > 110 → provisional qoladi (ikkala shart ham kerak)", () => {
    const states = new Map<string, PrePeriodState>([
      [A, state({ deviation: 250, gamesPlayed: 10, isProvisional: true })],
      [B, state()],
    ]);
    const results = computePeriodResults(
      calculator,
      [game('pair-1', A, B, 'WHITE_WIN')],
      states,
    );
    const a = resultOf(results, A);
    expect(a.after.deviation).toBeGreaterThan(110);
    expect(a.isProvisional).toBe(true);
  });

  it("established o'yinchi RD 110 dan oshsa ham provisional'ga qaytmaydi", () => {
    const states = new Map<string, PrePeriodState>([
      [A, state({ rating: 1800, deviation: 109, gamesPlayed: 50, isProvisional: false })],
    ]);
    // O'ynamagan davr — RD 109 dan oshadi, lekin bayroq o'zgarmaydi.
    const results = computePeriodResults(calculator, [], states);
    const a = resultOf(results, A);
    expect(a.after.deviation).toBeGreaterThan(109);
    expect(a.isProvisional).toBe(false);
  });
});

describe('peak reyting (established bo\'lgandan keyin)', () => {
  it("established o'yinchi rekordni yangilasa peak o'zgaradi", () => {
    const states = new Map<string, PrePeriodState>([
      [
        A,
        state({
          rating: 1800,
          deviation: 50,
          gamesPlayed: 60,
          isProvisional: false,
          peakRating: 1805,
        }),
      ],
      [B, state({ rating: 1900, deviation: 50, gamesPlayed: 60, isProvisional: false })],
    ]);
    const results = computePeriodResults(
      calculator,
      [game('pair-1', A, B, 'WHITE_WIN')],
      states,
    );
    const a = resultOf(results, A);
    expect(a.after.rating).toBeGreaterThan(1805);
    expect(a.peakChanged).toBe(true);
    expect(a.peakRating).toBe(Math.round(a.after.rating));
  });

  it('reyting tushsa peak saqlanadi', () => {
    const states = new Map<string, PrePeriodState>([
      [
        A,
        state({
          rating: 1800,
          deviation: 50,
          gamesPlayed: 60,
          isProvisional: false,
          peakRating: 1805,
        }),
      ],
      [B, state({ rating: 1700, deviation: 50, gamesPlayed: 60, isProvisional: false })],
    ]);
    const results = computePeriodResults(
      calculator,
      [game('pair-1', B, A, 'WHITE_WIN')],
      states,
    );
    const a = resultOf(results, A);
    expect(a.after.rating).toBeLessThan(1800);
    expect(a.peakChanged).toBe(false);
    expect(a.peakRating).toBe(1805);
  });

  it("provisional o'yinchida peak yuritilmaydi", () => {
    const results = computePeriodResults(
      calculator,
      [game('pair-1', A, B, 'WHITE_WIN')],
      new Map([
        [A, state()],
        [B, state()],
      ]),
    );
    const a = resultOf(results, A);
    expect(a.isProvisional).toBe(true);
    expect(a.peakRating).toBeNull();
    expect(a.peakChanged).toBe(false);
  });
});

describe('idempotentlik va determinizm (docs/06 §9.3, §3.2)', () => {
  const games: RatedGame[] = [
    game('pair-1', A, B, 'WHITE_WIN'),
    game('pair-2', C, A, 'DRAW'),
    game('pair-3', B, C, 'BLACK_WIN'),
  ];
  const states = new Map<string, PrePeriodState>([
    [A, state({ rating: 1600, deviation: 120, gamesPlayed: 5 })],
    [B, state({ rating: 1450, deviation: 200, gamesPlayed: 2 })],
    [C, state({ rating: 1700, deviation: 70, gamesPlayed: 25, isProvisional: false })],
  ]);

  it("bir xil kirish ikki marta → AYNAN bir xil chiqish", () => {
    const first = computePeriodResults(calculator, games, states);
    const second = computePeriodResults(calculator, games, states);
    expect(second).toEqual(first);
  });

  it("o'yinlar tartibi natijaga ta'sir qilmaydi (batch semantika)", () => {
    const shuffled = [games[2]!, games[0]!, games[1]!];
    const original = computePeriodResults(calculator, games, states);
    const reordered = computePeriodResults(calculator, shuffled, states);
    expect(reordered).toEqual(original);
  });
});
