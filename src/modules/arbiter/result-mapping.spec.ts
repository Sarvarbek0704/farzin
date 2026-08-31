import { PAIRING_RESULTS, type PairingHistoryEntry } from './arbiter.types';
import { buildScoreViews, outcomeFor, sideOf, type SideOutcome } from './result-mapping';

/**
 * Natija → ochko xaritalash testlari.
 *
 * 1. EXHAUSTIVE — har `PairingResult` qiymati, ikkala tomon uchun
 *    kutilgan (score, playedOverBoard) juftligi qo'lda yozilgan jadval
 *    bilan solishtiriladi. Jadval docs/14-roadmap.md Faza 1 va FIDE C.02
 *    (virtual opponent — o'ynalmagan partiya) semantikasidan.
 * 2. buildScoreViews — kichik fixture: bye + forfeit + oddiy natijalar
 *    aralash 3 o'yinchili seksiya.
 */

describe('outcomeFor — exhaustive xaritalash', () => {
  // Har qiymat uchun [oq, qora] kutilgan yakun. null = hisobga kirmaydi.
  const EXPECTED: Record<string, [SideOutcome | null, SideOutcome | null]> = {
    WHITE_WIN: [
      { score: 1, playedOverBoard: true },
      { score: 0, playedOverBoard: true },
    ],
    BLACK_WIN: [
      { score: 0, playedOverBoard: true },
      { score: 1, playedOverBoard: true },
    ],
    DRAW: [
      { score: 0.5, playedOverBoard: true },
      { score: 0.5, playedOverBoard: true },
    ],
    WHITE_WIN_FORFEIT: [
      { score: 1, playedOverBoard: false },
      { score: 0, playedOverBoard: false },
    ],
    BLACK_WIN_FORFEIT: [
      { score: 0, playedOverBoard: false },
      { score: 1, playedOverBoard: false },
    ],
    DOUBLE_FORFEIT: [
      { score: 0, playedOverBoard: false },
      { score: 0, playedOverBoard: false },
    ],
    // Bye'da "oq" — bye olgan o'yinchi; "qora" tomon mavjud emas.
    BYE_FULL: [{ score: 1, playedOverBoard: false }, null],
    BYE_HALF: [{ score: 0.5, playedOverBoard: false }, null],
    BYE_ZERO: [{ score: 0, playedOverBoard: false }, null],
    UNPLAYED: [null, null],
  };

  it("jadval PAIRING_RESULTS ro'yxatini to'liq qamraydi", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PAIRING_RESULTS].sort());
  });

  for (const result of PAIRING_RESULTS) {
    const [white, black] = EXPECTED[result]!;

    it(`${result} — oq tomon`, () => {
      expect(outcomeFor(result, 'WHITE')).toEqual(white);
    });

    it(`${result} — qora tomon`, () => {
      expect(outcomeFor(result, 'BLACK')).toEqual(black);
    });
  }
});

describe('sideOf', () => {
  const entry: PairingHistoryEntry = {
    roundNumber: 1,
    whiteRegistrationId: 'A',
    blackRegistrationId: 'B',
    result: 'DRAW',
  };

  it('oq / qora / begona', () => {
    expect(sideOf(entry, 'A')).toBe('WHITE');
    expect(sideOf(entry, 'B')).toBe('BLACK');
    expect(sideOf(entry, 'C')).toBeNull();
  });

  it("bye juftligida qora tomon yo'q", () => {
    const bye: PairingHistoryEntry = {
      roundNumber: 2,
      whiteRegistrationId: 'A',
      blackRegistrationId: null,
      result: 'BYE_FULL',
    };
    expect(sideOf(bye, 'A')).toBe('WHITE');
    expect(sideOf(bye, 'B')).toBeNull();
  });
});

describe("buildScoreViews — 3 o'yinchili fixture", () => {
  /**
   * 3 o'yinchi (A, B, C), round-robin, 3 tur (har turda bitta bye):
   *   R1: A(oq) 1-0 B;         C — BYE_FULL
   *   R2: C(oq) 0-1 forfeit A; B — BYE_FULL  (BLACK_WIN_FORFEIT)
   *   R3: B(oq) ½-½ C;         A — BYE_FULL
   *
   * Kutilgan:
   *   A: 1 (g'alaba) + 1 (forfeit-g'alaba) + 1 (bye) = 3.0;  W3 D0 L0
   *   B: 0 + 1 (bye) + 0.5 = 1.5;                            W1 D1 L1
   *   C: 1 (bye) + 0 (forfeit) + 0.5 = 1.5;                  W1 D1 L1
   */
  const history: PairingHistoryEntry[] = [
    { roundNumber: 1, whiteRegistrationId: 'A', blackRegistrationId: 'B', result: 'WHITE_WIN' },
    { roundNumber: 1, whiteRegistrationId: 'C', blackRegistrationId: null, result: 'BYE_FULL' },
    {
      roundNumber: 2,
      whiteRegistrationId: 'C',
      blackRegistrationId: 'A',
      result: 'BLACK_WIN_FORFEIT',
    },
    { roundNumber: 2, whiteRegistrationId: 'B', blackRegistrationId: null, result: 'BYE_FULL' },
    { roundNumber: 3, whiteRegistrationId: 'B', blackRegistrationId: 'C', result: 'DRAW' },
    { roundNumber: 3, whiteRegistrationId: 'A', blackRegistrationId: null, result: 'BYE_FULL' },
  ];

  const views = buildScoreViews(['A', 'B', 'C'], history);
  const byId = new Map(views.map((v) => [v.registrationId, v]));

  it('ochkolar', () => {
    expect(byId.get('A')?.points).toBe(3);
    expect(byId.get('B')?.points).toBe(1.5);
    expect(byId.get('C')?.points).toBe(1.5);
  });

  it('W/D/L va gamesPlayed', () => {
    expect(byId.get('A')).toMatchObject({ wins: 3, draws: 0, losses: 0, gamesPlayed: 3 });
    expect(byId.get('B')).toMatchObject({ wins: 1, draws: 1, losses: 1, gamesPlayed: 3 });
    expect(byId.get('C')).toMatchObject({ wins: 1, draws: 1, losses: 1, gamesPlayed: 3 });
  });

  it("colorHistory — faqat taxtada o'ynalgan partiyalar", () => {
    // A: R1 oq (R2 forfeit va R3 bye kirmaydi)
    expect(byId.get('A')?.colorHistory).toEqual(['WHITE']);
    // B: R1 qora, R3 oq
    expect(byId.get('B')?.colorHistory).toEqual(['BLACK', 'WHITE']);
    // C: R3 qora (R1 bye, R2 forfeit kirmaydi)
    expect(byId.get('C')?.colorHistory).toEqual(['BLACK']);
  });

  it("games — GameRecord shakli (virtual opponent bayrog'i bilan)", () => {
    expect(byId.get('A')?.games).toEqual([
      { opponentId: 'B', color: 'WHITE', result: 1, playedOverBoard: true },
      // Forfeit: raqib bor, lekin taxtada o'ynalmagan → color null.
      { opponentId: 'C', color: null, result: 1, playedOverBoard: false },
      { opponentId: null, color: null, result: 1, playedOverBoard: false },
    ]);
  });

  it('UNPLAYED yozuv jadvalga kirmaydi', () => {
    const withUnplayed = buildScoreViews(
      ['A', 'B'],
      [
        {
          roundNumber: 1,
          whiteRegistrationId: 'A',
          blackRegistrationId: 'B',
          result: 'UNPLAYED',
        },
      ],
    );
    expect(withUnplayed[0]).toMatchObject({ points: 0, gamesPlayed: 0 });
    expect(withUnplayed[0]?.games).toEqual([]);
  });

  it('tur tartibi saqlanadi (kirish aralash berilsa ham)', () => {
    const shuffled = buildScoreViews(['B'], [...history].reverse());
    // B: R1 (0), R2 bye (1), R3 durang (0.5) — aynan shu tartibda.
    expect(shuffled[0]?.games.map((g) => g.result)).toEqual([0, 1, 0.5]);
  });
});
