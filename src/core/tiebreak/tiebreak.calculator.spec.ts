import fc from 'fast-check';

import { TieBreakCalculator } from './tiebreak.calculator';
import {
  TIE_BREAK_KEYS,
  TieBreakDataError,
  type GameColor,
  type GameRecord,
  type GameScore,
  type PlayerTieBreakInput,
  type TieBreakKey,
} from './tiebreak.types';

/**
 * Tie-break hisoblagichi — testlar.
 *
 * Uch qatlam (docs/05-pairing-engine.md §8.1, §13.7):
 *  1. GOLDEN — qo'lda hisoblangan referens misollar, har kalit uchun (AC-29).
 *  2. EDGE   — bye/forfeit (virtual opponent, AC-30), DE qo'llanilmasligi,
 *              hamma teng, bo'sh tarix.
 *  3. PROPERTY — fast-check: rank() total deterministik tartib va
 *              kirish tartibidan mustaqil (permutation-invariant).
 */

function game(
  opponentId: string | null,
  color: GameColor | null,
  result: GameScore,
  playedOverBoard = true,
): GameRecord {
  return { opponentId, color, result, playedOverBoard };
}

function player(
  playerId: string,
  points: number,
  games: readonly GameRecord[],
  rating?: number,
): PlayerTieBreakInput {
  return rating === undefined
    ? { playerId, points, games }
    : { playerId, points, games, rating };
}

const calc = new TieBreakCalculator();

/**
 * GOLDEN A — 4 o'yinchi, 3 tur, to'liq round-robin (hammasi taxtada).
 *
 *   R1: A(oq) 1-0 B,   C(oq) 1-0 D
 *   R2: C(oq) 0-1 A,   B(oq) 1-0 D
 *   R3: D(oq) ½-½ A,   C(oq) ½-½ B
 *
 * Ochkolar: A=2.5, B=1.5, C=1.5, D=0.5.
 *
 * Qo'lda hisob (§7.1–§7.8):
 *   BH:   A = S(B)+S(C)+S(D) = 1.5+1.5+0.5 = 3.5
 *         B = 2.5+0.5+1.5 = 4.5;  C = 0.5+2.5+1.5 = 4.5;  D = 1.5+1.5+2.5 = 5.5
 *   Cut1: A = 3.5−0.5 = 3.0;  B = 4.5−0.5 = 4.0;  C = 4.0;  D = 5.5−1.5 = 4.0
 *   MBH:  A = 3.5−0.5−1.5 = 1.5;  B = 4.5−0.5−2.5 = 1.5;  C = 1.5;  D = 1.5
 *   SB:   A = 1×1.5 + 1×1.5 + 0.5×0.5 = 3.25
 *         B = 0×2.5 + 1×0.5 + 0.5×1.5 = 1.25;  C = 1.25;  D = 0.5×2.5 = 1.25
 *   DE:   guruhlar {A}, {B,C}, {D}. B–C R3 da o'ynagan (½) → B=0.5, C=0.5;
 *         yolg'iz guruhlarda 0.
 *   Cum:  A: 1,2,2.5 → 5.5;  B: 0,1,1.5 → 2.5;  C: 1,1,1.5 → 3.5;  D: 0,0,0.5 → 0.5
 *   ARO (reytinglar A=2000, B=1800, C=1600, D=1400):
 *         A = (1800+1600+1400)/3 = 1600;  B = (2000+1400+1600)/3 = 5000/3
 *         C = (1400+2000+1800)/3 = 5200/3;  D = (1600+1800+2000)/3 = 1800
 *   Koya: R_max = 3 → chegara S(o) ≥ 1.5. A: vs B(1)+vs C(1) = 2
 *         B: vs A(0)+vs C(0.5) = 0.5;  C: 0.5;  D: vs A(0.5) = 0.5
 *   WINS: A=2, B=1, C=1, D=0
 *   BLACK_GAMES: A=2 (R2,R3), B=2 (R1,R3), C=0, D=2 (R1,R2)
 */
const goldenA: readonly PlayerTieBreakInput[] = [
  player(
    'A',
    2.5,
    [game('B', 'WHITE', 1), game('C', 'BLACK', 1), game('D', 'BLACK', 0.5)],
    2000,
  ),
  player(
    'B',
    1.5,
    [game('A', 'BLACK', 0), game('D', 'WHITE', 1), game('C', 'BLACK', 0.5)],
    1800,
  ),
  player(
    'C',
    1.5,
    [game('D', 'WHITE', 1), game('A', 'WHITE', 0), game('B', 'WHITE', 0.5)],
    1600,
  ),
  player(
    'D',
    0.5,
    [game('C', 'BLACK', 0), game('B', 'BLACK', 0), game('A', 'WHITE', 0.5)],
    1400,
  ),
];

describe('TieBreakCalculator', () => {
  describe('golden A — to‘liq round-robin, qo‘lda hisoblangan', () => {
    const all = calc.compute(goldenA, TIE_BREAK_KEYS);

    it('BUCHHOLZ (§7.1)', () => {
      expect(all.get('A')?.BUCHHOLZ).toBe(3.5);
      expect(all.get('B')?.BUCHHOLZ).toBe(4.5);
      expect(all.get('C')?.BUCHHOLZ).toBe(4.5);
      expect(all.get('D')?.BUCHHOLZ).toBe(5.5);
    });

    it('BUCHHOLZ_CUT1 (§7.2)', () => {
      expect(all.get('A')?.BUCHHOLZ_CUT1).toBe(3.0);
      expect(all.get('B')?.BUCHHOLZ_CUT1).toBe(4.0);
      expect(all.get('C')?.BUCHHOLZ_CUT1).toBe(4.0);
      expect(all.get('D')?.BUCHHOLZ_CUT1).toBe(4.0);
    });

    it('MEDIAN_BUCHHOLZ (§7.3)', () => {
      expect(all.get('A')?.MEDIAN_BUCHHOLZ).toBe(1.5);
      expect(all.get('B')?.MEDIAN_BUCHHOLZ).toBe(1.5);
      expect(all.get('C')?.MEDIAN_BUCHHOLZ).toBe(1.5);
      expect(all.get('D')?.MEDIAN_BUCHHOLZ).toBe(1.5);
    });

    it('SONNEBORN_BERGER (§7.4)', () => {
      expect(all.get('A')?.SONNEBORN_BERGER).toBe(3.25);
      expect(all.get('B')?.SONNEBORN_BERGER).toBe(1.25);
      expect(all.get('C')?.SONNEBORN_BERGER).toBe(1.25);
      expect(all.get('D')?.SONNEBORN_BERGER).toBe(1.25);
    });

    it('DIRECT_ENCOUNTER (§7.5) — {B,C} mini-turniri to‘liq', () => {
      expect(all.get('A')?.DIRECT_ENCOUNTER).toBe(0);
      expect(all.get('B')?.DIRECT_ENCOUNTER).toBe(0.5);
      expect(all.get('C')?.DIRECT_ENCOUNTER).toBe(0.5);
      expect(all.get('D')?.DIRECT_ENCOUNTER).toBe(0);
    });

    it('CUMULATIVE (§7.6)', () => {
      expect(all.get('A')?.CUMULATIVE).toBe(5.5);
      expect(all.get('B')?.CUMULATIVE).toBe(2.5);
      expect(all.get('C')?.CUMULATIVE).toBe(3.5);
      expect(all.get('D')?.CUMULATIVE).toBe(0.5);
    });

    it('ARO (§7.7)', () => {
      expect(all.get('A')?.ARO).toBe(1600);
      expect(all.get('B')?.ARO).toBeCloseTo(5000 / 3, 10);
      expect(all.get('C')?.ARO).toBeCloseTo(5200 / 3, 10);
      expect(all.get('D')?.ARO).toBe(1800);
    });

    it('KOYA (§7.8) — chegara S(o) ≥ 1.5', () => {
      expect(all.get('A')?.KOYA).toBe(2);
      expect(all.get('B')?.KOYA).toBe(0.5);
      expect(all.get('C')?.KOYA).toBe(0.5);
      expect(all.get('D')?.KOYA).toBe(0.5);
    });

    it('WINS', () => {
      expect(all.get('A')?.WINS).toBe(2);
      expect(all.get('B')?.WINS).toBe(1);
      expect(all.get('C')?.WINS).toBe(1);
      expect(all.get('D')?.WINS).toBe(0);
    });

    it('BLACK_GAMES', () => {
      expect(all.get('A')?.BLACK_GAMES).toBe(2);
      expect(all.get('B')?.BLACK_GAMES).toBe(2);
      expect(all.get('C')?.BLACK_GAMES).toBe(0);
      expect(all.get('D')?.BLACK_GAMES).toBe(2);
    });

    it('faqat so‘ralgan kalitlarni hisoblaydi', () => {
      const partial = calc.compute(goldenA, ['BUCHHOLZ', 'WINS']);
      expect(Object.keys(partial.get('A') ?? {}).sort()).toEqual(['BUCHHOLZ', 'WINS']);
    });

    it('dublikat kalitlar tartibda zararsiz', () => {
      const dup = calc.compute(goldenA, ['BUCHHOLZ', 'BUCHHOLZ']);
      expect(dup.get('D')?.BUCHHOLZ).toBe(5.5);
    });
  });

  /**
   * GOLDEN B — bye'lar bilan virtual opponent (§7.1, FIDE C.02, AC-30).
   *
   *   R1: E 1-0 F,  G 1-0 H
   *   R2: E — PAB bye (1 ochko);  F 1-0 G;  H — zero-point bye (0 ochko)
   *   R3: E ½-½ G;  F 1-0 H
   *
   * Ochkolar: E=2.5, F=2, G=1.5, H=0.  n=3.
   *
   * Virtual opponent: S(VO) = S(oldin) + (1 − natija) + 0.5 × (n − R):
   *   E (R2, natija 1, oldin 1):  VO = 1 + 0 + 0.5 = 1.5
   *   H (R2, natija 0, oldin 0):  VO = 0 + 1 + 0.5 = 1.5
   *
   *   BH(E) = S(F) + VO + S(G) = 2 + 1.5 + 1.5 = 5.0
   *   BH(F) = 2.5 + 1.5 + 0 = 4.0
   *   BH(G) = 0 + 2 + 2.5 = 4.5
   *   BH(H) = 1.5 + VO + 2 = 1.5 + 1.5 + 2 = 5.0
   */
  describe('golden B — bye va virtual opponent (§7.1)', () => {
    const goldenB: readonly PlayerTieBreakInput[] = [
      player('E', 2.5, [game('F', 'WHITE', 1), game(null, null, 1, false), game('G', 'WHITE', 0.5)]),
      player('F', 2, [game('E', 'BLACK', 0), game('G', 'WHITE', 1), game('H', 'WHITE', 1)]),
      player('G', 1.5, [game('H', 'WHITE', 1), game('F', 'BLACK', 0), game('E', 'BLACK', 0.5)]),
      player('H', 0, [game('G', 'BLACK', 0), game(null, null, 0, false), game('F', 'BLACK', 0)]),
    ];

    it('Buchholz bye o‘rniga virtual opponent ochkosini oladi', () => {
      const res = calc.compute(goldenB, ['BUCHHOLZ']);
      expect(res.get('E')?.BUCHHOLZ).toBe(5.0);
      expect(res.get('F')?.BUCHHOLZ).toBe(4.0);
      expect(res.get('G')?.BUCHHOLZ).toBe(4.5);
      expect(res.get('H')?.BUCHHOLZ).toBe(5.0);
    });

    it('CUMULATIVE bye ochkosini joriy ochkoga kiritadi (§7.6)', () => {
      const res = calc.compute(goldenB, ['CUMULATIVE']);
      // E: running 1, 2, 2.5 → 5.5
      expect(res.get('E')?.CUMULATIVE).toBe(5.5);
    });

    it('WINS raqibsiz to‘liq ochkoni (PAB) g‘alaba deb sanamaydi', () => {
      const res = calc.compute(goldenB, ['WINS']);
      expect(res.get('E')?.WINS).toBe(1); // faqat R1 (PAB emas)
      expect(res.get('F')?.WINS).toBe(2);
    });

    it('BLACK_GAMES faqat taxtada o‘ynalganlarni sanaydi', () => {
      const res = calc.compute(goldenB, ['BLACK_GAMES']);
      expect(res.get('H')?.BLACK_GAMES).toBe(2); // R2 bye kirmaydi
    });
  });

  /**
   * GOLDEN C — forfeit (§7.1): raqib MAVJUD, lekin partiya o'ynalmagan.
   * Buchholz haqiqiy raqib ochkosini EMAS, virtual opponent'ni oladi.
   *
   *   R1: P 1-0 Q (taxtada);  R2: P forfeit-g'alaba (Q kelmadi).
   *   Ochkolar: P=2, Q=0.  n=2.
   *
   *   BH(P) = S(Q) + VO(R2: oldin 1, natija 1) = 0 + (1 + 0 + 0) = 1.0
   *           (naiv S(Q)=0 qo'shilsa 0 bo'lardi — farq testda ushlanadi)
   *   BH(Q) = S(P) + VO(R2: oldin 0, natija 0) = 2 + (0 + 1 + 0) = 3.0
   */
  describe('golden C — forfeit va virtual opponent (§7.1)', () => {
    const goldenC: readonly PlayerTieBreakInput[] = [
      player('P', 2, [game('Q', 'WHITE', 1), game('Q', null, 1, false)]),
      player('Q', 0, [game('P', 'BLACK', 0), game('P', null, 0, false)]),
    ];

    it('forfeit turida haqiqiy raqib ochkosi olinmaydi', () => {
      const res = calc.compute(goldenC, ['BUCHHOLZ']);
      expect(res.get('P')?.BUCHHOLZ).toBe(1.0);
      expect(res.get('Q')?.BUCHHOLZ).toBe(3.0);
    });

    it('forfeit-g‘alaba WINS ga kiradi (raqib mavjud)', () => {
      const res = calc.compute(goldenC, ['WINS']);
      expect(res.get('P')?.WINS).toBe(2);
    });

    it('SB faqat taxtada o‘ynalgan partiyalardan (§7.4)', () => {
      const res = calc.compute(goldenC, ['SONNEBORN_BERGER']);
      expect(res.get('P')?.SONNEBORN_BERGER).toBe(0); // 1 × S(Q)=0
      expect(res.get('Q')?.SONNEBORN_BERGER).toBe(0);
    });
  });

  describe('DIRECT_ENCOUNTER qo‘llanilmasligi (§7.5)', () => {
    /**
     * 4 o'yinchi, 2 tur, hammasi 1.0 ochkoda, lekin X–Z va Y–W o'ynamagan:
     *   R1: X 1-0 Y;  Z 1-0 W.   R2: W 1-0 X;  Y 1-0 Z.
     * Mini-turnir to'liq emas → DE guruh uchun null → kalit YO'Q.
     */
    const tied: readonly PlayerTieBreakInput[] = [
      player('X', 1, [game('Y', 'WHITE', 1), game('W', 'BLACK', 0)]),
      player('Y', 1, [game('X', 'BLACK', 0), game('Z', 'WHITE', 1)]),
      player('Z', 1, [game('W', 'WHITE', 1), game('Y', 'BLACK', 0)]),
      player('W', 1, [game('Z', 'BLACK', 0), game('X', 'WHITE', 1)]),
    ];

    it('to‘liq bo‘lmagan mini-turnirda kalit natijaga yozilmaydi', () => {
      const res = calc.compute(tied, ['DIRECT_ENCOUNTER']);
      for (const id of ['X', 'Y', 'Z', 'W']) {
        expect(res.get(id)).toEqual({});
      }
    });

    it('rank() qo‘llanilmagan DE ni o‘tkazib yuboradi → playerId (§7.9)', () => {
      expect(calc.rank(tied, ['DIRECT_ENCOUNTER'])).toEqual(['W', 'X', 'Y', 'Z']);
    });
  });

  describe('hammasi teng — barcha partiyalar durang', () => {
    /** To'liq RR, 3 tur, hamma 1.5 ochko. Barcha tie-break teng. */
    const allDraw: readonly PlayerTieBreakInput[] = [
      player('I', 1.5, [game('J', 'WHITE', 0.5), game('K', 'BLACK', 0.5), game('L', 'WHITE', 0.5)]),
      player('J', 1.5, [game('I', 'BLACK', 0.5), game('L', 'WHITE', 0.5), game('K', 'BLACK', 0.5)]),
      player('K', 1.5, [game('L', 'BLACK', 0.5), game('I', 'WHITE', 0.5), game('J', 'WHITE', 0.5)]),
      player('L', 1.5, [game('K', 'WHITE', 0.5), game('J', 'BLACK', 0.5), game('I', 'BLACK', 0.5)]),
    ];

    it('barcha qiymatlar teng — DE to‘liq guruhda 1.5', () => {
      const res = calc.compute(allDraw, TIE_BREAK_KEYS);
      for (const id of ['I', 'J', 'K', 'L']) {
        expect(res.get(id)?.BUCHHOLZ).toBe(4.5);
        expect(res.get(id)?.SONNEBORN_BERGER).toBe(2.25);
        expect(res.get(id)?.DIRECT_ENCOUNTER).toBe(1.5);
        expect(res.get(id)?.CUMULATIVE).toBe(3.0);
        expect(res.get(id)?.KOYA).toBe(1.5);
        expect(res.get(id)?.WINS).toBe(0);
      }
    });

    it('rank() playerId bilan total tartibga tushadi', () => {
      // BLACK_GAMES chiqarilgan: 4 o'yinchi × 3 turda qora sonlar teng
      // bo'lishi MATEMATIK imkonsiz (jami 6 qora / 4 o'yinchi).
      const order: readonly TieBreakKey[] = [
        'BUCHHOLZ',
        'SONNEBORN_BERGER',
        'DIRECT_ENCOUNTER',
        'CUMULATIVE',
        'KOYA',
        'WINS',
      ];
      expect(calc.rank(allDraw, order)).toEqual(['I', 'J', 'K', 'L']);
    });
  });

  describe('rank() (§7.9)', () => {
    it('avval ochko, keyin tie-break tartibi', () => {
      // SB: B=C=1.25 → playerId. Cum: C=3.5 > B=2.5 → C oldinda.
      expect(calc.rank(goldenA, ['SONNEBORN_BERGER'])).toEqual(['A', 'B', 'C', 'D']);
      expect(calc.rank(goldenA, ['CUMULATIVE'])).toEqual(['A', 'C', 'B', 'D']);
    });

    it('birinchi kalit teng bo‘lsa keyingisiga o‘tadi', () => {
      // BH: B=C=4.5 teng → Cum hal qiladi (C 3.5 > B 2.5).
      expect(calc.rank(goldenA, ['BUCHHOLZ', 'CUMULATIVE'])).toEqual(['A', 'C', 'B', 'D']);
    });

    it('bo‘sh order — ochko + playerId', () => {
      expect(calc.rank(goldenA, [])).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('chegara holatlari', () => {
    it('bo‘sh o‘yinchilar ro‘yxati', () => {
      expect(calc.compute([], TIE_BREAK_KEYS).size).toBe(0);
      expect(calc.rank([], TIE_BREAK_KEYS)).toEqual([]);
    });

    it('partiyasiz o‘yinchi — hamma qiymat 0 (Cut/Median ham)', () => {
      const res = calc.compute([player('S', 0, [])], TIE_BREAK_KEYS);
      expect(res.get('S')?.BUCHHOLZ).toBe(0);
      expect(res.get('S')?.BUCHHOLZ_CUT1).toBe(0);
      expect(res.get('S')?.MEDIAN_BUCHHOLZ).toBe(0);
      expect(res.get('S')?.ARO).toBe(0);
    });

    it('Cut-1 bitta, Median ikkita partiyada 0 ga tushadi', () => {
      const two: readonly PlayerTieBreakInput[] = [
        player('T', 1, [game('U', 'WHITE', 1)]),
        player('U', 0, [game('T', 'BLACK', 0)]),
      ];
      const res = calc.compute(two, ['BUCHHOLZ_CUT1', 'MEDIAN_BUCHHOLZ']);
      expect(res.get('T')?.BUCHHOLZ_CUT1).toBe(0);
      expect(res.get('T')?.MEDIAN_BUCHHOLZ).toBe(0);
    });

    it('ARO: reytingsiz raqib chiqariladi; unratedRating berilsa kiradi (§7.7)', () => {
      const players: readonly PlayerTieBreakInput[] = [
        player('V', 1.5, [game('R1', 'WHITE', 1), game('R2', 'BLACK', 0.5)], 1900),
        player('R1', 0, [game('V', 'BLACK', 0)], 1700),
        player('R2', 0.5, [game('V', 'WHITE', 0.5)]), // reytingsiz
      ];
      expect(calc.compute(players, ['ARO']).get('V')?.ARO).toBe(1700);

      const withDefault = new TieBreakCalculator({ unratedRating: 1000 });
      expect(withDefault.compute(players, ['ARO']).get('V')?.ARO).toBe(1350);
    });

    it('dublikat playerId — TieBreakDataError', () => {
      const dup = [player('Z1', 0, []), player('Z1', 0, [])];
      expect(() => calc.compute(dup, ['BUCHHOLZ'])).toThrow(TieBreakDataError);
    });

    it('noma’lum raqib — TieBreakDataError', () => {
      const bad = [player('Z2', 1, [game('GHOST', 'WHITE', 1)])];
      expect(() => calc.compute(bad, ['BUCHHOLZ'])).toThrow(TieBreakDataError);
    });

    it('taxtada o‘ynalgan, lekin raqibsiz partiya — TieBreakDataError', () => {
      const bad = [player('Z3', 1, [game(null, 'WHITE', 1, true)])];
      expect(() => calc.compute(bad, ['BUCHHOLZ'])).toThrow(TieBreakDataError);
    });
  });

  describe('determinizm', () => {
    it('bir xil kirish → bit-for-bit bir xil natija', () => {
      const first = calc.compute(goldenA, TIE_BREAK_KEYS);
      const second = calc.compute(goldenA, TIE_BREAK_KEYS);
      expect([...first.entries()]).toEqual([...second.entries()]);
      expect(calc.rank(goldenA, TIE_BREAK_KEYS)).toEqual(calc.rank(goldenA, TIE_BREAK_KEYS));
    });
  });

  // ─── PROPERTY (fast-check) — docs/05-pairing-engine.md §8.2 ────────────────

  describe('property: rank() total deterministik tartib', () => {
    /** Tasodifiy, lekin ICHKI ZIDDIYATSIZ turnir generatori. */
    const tournamentArb: fc.Arbitrary<PlayerTieBreakInput[]> = fc
      .record({
        n: fc.integer({ min: 2, max: 8 }),
        rounds: fc.integer({ min: 1, max: 5 }),
      })
      .chain(({ n, rounds }) => {
        const indices = Array.from({ length: n }, (_, i) => i);
        return fc
          .record({
            perms: fc.array(
              fc.shuffledSubarray(indices, { minLength: n, maxLength: n }),
              { minLength: rounds, maxLength: rounds },
            ),
            results: fc.array(
              fc.array(fc.constantFrom<GameScore>(0, 0.5, 1), {
                minLength: Math.floor(n / 2),
                maxLength: Math.floor(n / 2),
              }),
              { minLength: rounds, maxLength: rounds },
            ),
            byeResults: fc.array(fc.constantFrom<GameScore>(0, 0.5, 1), {
              minLength: rounds,
              maxLength: rounds,
            }),
          })
          .map(({ perms, results, byeResults }) =>
            buildTournament(n, perms, results, byeResults),
          );
      });

    function buildTournament(
      n: number,
      perms: readonly (readonly number[])[],
      results: readonly (readonly GameScore[])[],
      byeResults: readonly GameScore[],
    ): PlayerTieBreakInput[] {
      const id = (i: number): string => `P${String(i).padStart(2, '0')}`;
      const games: GameRecord[][] = Array.from({ length: n }, () => []);

      perms.forEach((perm, r) => {
        for (let k = 0; k + 1 < perm.length; k += 2) {
          const white = perm[k]!;
          const black = perm[k + 1]!;
          const score = results[r]![k / 2] ?? 0.5;
          games[white]!.push(game(id(black), 'WHITE', score));
          games[black]!.push(game(id(white), 'BLACK', (1 - score) as GameScore));
        }
        if (perm.length % 2 === 1) {
          const bye = perm[perm.length - 1]!;
          games[bye]!.push(game(null, null, byeResults[r] ?? 0, false));
        }
      });

      return games.map((g, i) =>
        player(id(i), g.reduce((acc, x) => acc + x.result, 0), g, 1000 + i * 50),
      );
    }

    const orderArb: fc.Arbitrary<TieBreakKey[]> = fc.shuffledSubarray([...TIE_BREAK_KEYS], {
      minLength: 0,
      maxLength: TIE_BREAK_KEYS.length,
    });

    it('natija — kirish id’larining permutatsiyasi (total tartib)', () => {
      fc.assert(
        fc.property(tournamentArb, orderArb, (players, order) => {
          const ranked = calc.rank(players, order);
          const expected = players.map((p) => p.playerId).sort();
          expect([...ranked].sort()).toEqual(expected);
        }),
        { numRuns: 200 },
      );
    });

    it('kirish tartibidan mustaqil (permutation-invariant) va deterministik', () => {
      fc.assert(
        fc.property(
          tournamentArb.chain((players) =>
            fc.record({
              players: fc.constant(players),
              shuffled: fc.shuffledSubarray([...players], {
                minLength: players.length,
                maxLength: players.length,
              }),
            }),
          ),
          orderArb,
          ({ players, shuffled }, order) => {
            expect(calc.rank(shuffled, order)).toEqual(calc.rank(players, order));
            expect(calc.rank(players, order)).toEqual(calc.rank(players, order));
          },
        ),
        { numRuns: 200 },
      );
    });

    it('ochko tartibda kamaymaydi', () => {
      fc.assert(
        fc.property(tournamentArb, orderArb, (players, order) => {
          const byId = new Map(players.map((p) => [p.playerId, p.points]));
          const ranked = calc.rank(players, order);
          for (let i = 1; i < ranked.length; i++) {
            expect(byId.get(ranked[i - 1]!)!).toBeGreaterThanOrEqual(byId.get(ranked[i]!)!);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('compute() faqat so‘ralgan kalitlarni qaytaradi', () => {
      fc.assert(
        fc.property(tournamentArb, orderArb, (players, order) => {
          const res = calc.compute(players, order);
          const allowed = new Set<string>(order);
          for (const record of res.values()) {
            for (const key of Object.keys(record)) {
              expect(allowed.has(key)).toBe(true);
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
