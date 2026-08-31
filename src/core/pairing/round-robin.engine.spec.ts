import fc from 'fast-check';

import {
  ByeType,
  PairingImpossibleError,
  type PairingRequest,
  type PairingResult,
  type PlayerId,
  type PlayerPairingState,
  type RoundId,
} from './pairing.types';
import { RoundRobinEngine } from './round-robin.engine';

/**
 * Round-robin (Berger) testlari.
 *
 * 1. GOLDEN — FIDE Handbook C.04.1 Annex Berger jadvallari (N=4, 5, 6, 8).
 *    BU TESTLAR HECH QACHON O'ZGARTIRILMAYDI: yiqilsa — implementatsiya
 *    xato, test emas. docs/05-pairing-engine.md §1.2, AC-25.
 *
 * 2. PROPERTY — port kafolatlari (pairing.types.ts, docs/05 §7):
 *    determinizm, har o'yinchi bir marta, har juftlik bir marta (C1),
 *    double RR'da ranglar teskari (AC-26), rang balansi.
 */
describe('RoundRobinEngine', () => {
  const single = new RoundRobinEngine();
  const double = new RoundRobinEngine({ legs: 2 });

  const pid = (n: number): PlayerId => `player-${String(n)}` as PlayerId;
  const rid = (round: number): RoundId => `round-${String(round)}` as RoundId;

  const makePlayer = (
    pairingNumber: number,
    overrides: Partial<PlayerPairingState> = {},
  ): PlayerPairingState => ({
    playerId: pid(pairingNumber),
    pairingNumber,
    rating: 1500,
    points: 0,
    opponentIds: new Set<PlayerId>(),
    colorHistory: [],
    floatHistory: [],
    hasReceivedBye: false,
    isWithdrawn: false,
    joinedAtRound: 1,
    ...overrides,
  });

  const makePlayers = (n: number, withdrawn: readonly number[] = []): PlayerPairingState[] =>
    Array.from({ length: n }, (_, i) =>
      makePlayer(i + 1, { isWithdrawn: withdrawn.includes(i + 1) }),
    );

  /** Bir aylana uzunligi: juft N → N−1, toq N → N (fantom bilan). */
  const roundsPerLeg = (n: number): number => (n % 2 === 0 ? n - 1 : n);

  const makeRequest = (
    players: readonly PlayerPairingState[],
    roundNumber: number,
    legs: 1 | 2 = 1,
  ): PairingRequest => ({
    roundId: rid(roundNumber),
    roundNumber,
    totalRounds: legs * roundsPerLeg(players.length),
    players,
  });

  /** Juftliklarni [oq, qora] pairingNumber ko'rinishida tekshiradi. */
  const expectRound = (
    result: PairingResult,
    expected: readonly (readonly [number, number])[],
    byeOf?: number,
  ): void => {
    expect(result.pairings).toEqual(
      expected.map(([white, black], index) => ({
        boardNumber: index + 1,
        whitePlayerId: pid(white),
        blackPlayerId: pid(black),
      })),
    );
    if (byeOf === undefined) {
      expect(result.byes).toEqual([]);
    } else {
      expect(result.byes).toEqual([
        { playerId: pid(byeOf), type: ByeType.PairingAllocated, points: 1 },
      ]);
    }
  };

  describe('metadata', () => {
    it('system va version', () => {
      expect(single.system).toBe('ROUND_ROBIN');
      expect(double.system).toBe('DOUBLE_ROUND_ROBIN');
      expect(single.version).toBe('1.0.0');
    });

    it('engineVersion natijaga yoziladi (audit uchun majburiy)', async () => {
      const result = await single.pair(makeRequest(makePlayers(4), 1));
      expect(result.engineVersion).toBe('1.0.0');
    });
  });

  describe('GOLDEN: FIDE C.04.1 Berger jadvali, N=4 (3 tur)', () => {
    // FIDE: Rd1: 1-4, 2-3 | Rd2: 4-3, 1-2 | Rd3: 2-4, 3-1
    const table: readonly (readonly (readonly [number, number])[])[] = [
      [
        [1, 4],
        [2, 3],
      ],
      [
        [4, 3],
        [1, 2],
      ],
      [
        [2, 4],
        [3, 1],
      ],
    ];

    it.each([1, 2, 3])('tur %i FIDE jadvaliga bit-for-bit mos', async (round) => {
      const result = await single.pair(makeRequest(makePlayers(4), round));
      expectRound(result, table[round - 1]!);
    });
  });

  describe('GOLDEN: FIDE C.04.1 Berger jadvali, N=6 (5 tur)', () => {
    // FIDE: Rd1: 1-6, 2-5, 3-4 | Rd2: 6-4, 5-3, 1-2 | Rd3: 2-6, 3-1, 4-5
    //       Rd4: 6-5, 1-4, 2-3 | Rd5: 3-6, 4-2, 5-1
    const table: readonly (readonly (readonly [number, number])[])[] = [
      [
        [1, 6],
        [2, 5],
        [3, 4],
      ],
      [
        [6, 4],
        [5, 3],
        [1, 2],
      ],
      [
        [2, 6],
        [3, 1],
        [4, 5],
      ],
      [
        [6, 5],
        [1, 4],
        [2, 3],
      ],
      [
        [3, 6],
        [4, 2],
        [5, 1],
      ],
    ];

    it.each([1, 2, 3, 4, 5])('tur %i FIDE jadvaliga bit-for-bit mos', async (round) => {
      const result = await single.pair(makeRequest(makePlayers(6), round));
      expectRound(result, table[round - 1]!);
    });
  });

  describe("GOLDEN: N=5 — o'sha 5-6 jadvali, fantom 6-o'rindiqda (docs/05 §1.2)", () => {
    // Fantomga to'g'ri kelgan o'yinchi PAIRING_ALLOCATED bye (1 ochko) oladi.
    const table: readonly {
      pairings: readonly (readonly [number, number])[];
      bye: number;
    }[] = [
      {
        pairings: [
          [2, 5],
          [3, 4],
        ],
        bye: 1,
      },
      {
        pairings: [
          [5, 3],
          [1, 2],
        ],
        bye: 4,
      },
      {
        pairings: [
          [3, 1],
          [4, 5],
        ],
        bye: 2,
      },
      {
        pairings: [
          [1, 4],
          [2, 3],
        ],
        bye: 5,
      },
      {
        pairings: [
          [4, 2],
          [5, 1],
        ],
        bye: 3,
      },
    ];

    it.each([1, 2, 3, 4, 5])('tur %i: juftliklar va bye jadvalga mos', async (round) => {
      const result = await single.pair(makeRequest(makePlayers(5), round));
      const expected = table[round - 1]!;
      expectRound(result, expected.pairings, expected.bye);
    });
  });

  describe('GOLDEN: FIDE C.04.1 Berger jadvali, N=8 (1- va 7-tur)', () => {
    it('tur 1: 1-8, 2-7, 3-6, 4-5', async () => {
      const result = await single.pair(makeRequest(makePlayers(8), 1));
      expectRound(result, [
        [1, 8],
        [2, 7],
        [3, 6],
        [4, 5],
      ]);
    });

    it('tur 7: 4-8, 5-3, 6-2, 7-1', async () => {
      const result = await single.pair(makeRequest(makePlayers(8), 7));
      expectRound(result, [
        [4, 8],
        [5, 3],
        [6, 2],
        [7, 1],
      ]);
    });
  });

  describe('double round-robin (docs/05 §1.3, AC-26)', () => {
    it('birinchi aylana oddiy RR bilan bir xil', async () => {
      const players = makePlayers(4);
      for (let round = 1; round <= 3; round += 1) {
        const a = await single.pair(makeRequest(players, round));
        const b = await double.pair(makeRequest(players, round, 2));
        expect(b.pairings).toEqual(a.pairings);
        expect(b.byes).toEqual(a.byes);
      }
    });

    it("ikkinchi aylana: o'sha jadval, ranglar teskari (N=4, tur 4-6)", async () => {
      const players = makePlayers(4);
      const r4 = await double.pair(makeRequest(players, 4, 2));
      const r5 = await double.pair(makeRequest(players, 5, 2));
      const r6 = await double.pair(makeRequest(players, 6, 2));
      expectRound(r4, [
        [4, 1],
        [3, 2],
      ]);
      expectRound(r5, [
        [3, 4],
        [2, 1],
      ]);
      expectRound(r6, [
        [4, 2],
        [1, 3],
      ]);
    });

    it("toq N: ikkinchi aylanada ham bye o'sha tartibda aylanadi", async () => {
      const players = makePlayers(5);
      // Tur 6 = ikkinchi aylananing 1-turi → bye yana 1-o'yinchiga.
      const result = await double.pair(makeRequest(players, 6, 2));
      expectRound(
        result,
        [
          [5, 2],
          [4, 3],
        ],
        1,
      );
    });
  });

  describe("chiqib ketgan o'yinchi (header'dagi qaror #1)", () => {
    it('raqibi PAIRING_ALLOCATED bye oladi, stollar qayta raqamlanadi', async () => {
      // N=4, tur 1 jadvali: 1-4, 2-3. 4-o'yinchi chiqib ketgan →
      // 1-o'yinchi bye, 2-3 yagona stol (board 1).
      const result = await single.pair(makeRequest(makePlayers(4, [4]), 1));
      expectRound(result, [[2, 3]], 1);
    });

    it("oq tomondagi o'yinchi chiqib ketsa — qora tomondagisi bye oladi", async () => {
      const result = await single.pair(makeRequest(makePlayers(4, [1]), 1));
      expectRound(result, [[2, 3]], 4);
    });

    it("stolning ikkala o'yinchisi ham chiqib ketgan — stol o'ynalmaydi, bye yo'q", async () => {
      const result = await single.pair(makeRequest(makePlayers(4, [2, 3]), 1));
      expectRound(result, [[1, 4]]);
    });

    it("chiqqan o'yinchi hech qachon juftlikda ham, bye'da ham chiqmaydi", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .integer({ min: 4, max: 10 })
            .chain((n) =>
              fc.tuple(
                fc.constant(n),
                fc.integer({ min: 1, max: roundsPerLeg(n) }),
                fc.uniqueArray(fc.integer({ min: 1, max: n }), { maxLength: n - 2 }),
              ),
            ),
          async ([n, round, withdrawn]) => {
            const result = await single.pair(makeRequest(makePlayers(n, withdrawn), round));
            const withdrawnIds = new Set(withdrawn.map(pid));
            const seen = new Set<PlayerId>();
            for (const pairing of result.pairings) {
              seen.add(pairing.whitePlayerId);
              seen.add(pairing.blackPlayerId);
            }
            for (const bye of result.byes) {
              seen.add(bye.playerId);
            }
            for (const id of withdrawnIds) {
              expect(seen.has(id)).toBe(false);
            }
            // Har bir aktiv o'yinchi baribir qatnashadi (port kafolati #4).
            expect(seen.size).toBe(n - withdrawn.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("kech qo'shilgan o'yinchi (header'dagi qaror #2)", () => {
    it("qo'shilgunicha juftlashtirilmaydi, qo'shilgach jadval o'rnini oladi", async () => {
      const players = [
        makePlayer(1),
        makePlayer(2),
        makePlayer(3),
        makePlayer(4, { joinedAtRound: 2 }),
      ];
      const round1 = await single.pair(makeRequest(players, 1));
      expectRound(round1, [[2, 3]], 1);

      const round2 = await single.pair(makeRequest(players, 2));
      expectRound(round2, [
        [4, 3],
        [1, 2],
      ]);
    });
  });

  describe('xato holatlar (PairingImpossibleError)', () => {
    it("2 tadan kam o'yinchi", () => {
      expect(() => single.pair(makeRequest(makePlayers(1), 1))).toThrow(PairingImpossibleError);
      expect(() => single.pair(makeRequest([], 1))).toThrow(PairingImpossibleError);
    });

    it("2 tadan kam AKTIV o'yinchi", () => {
      expect(() => single.pair(makeRequest(makePlayers(4, [2, 3, 4]), 1))).toThrow(
        PairingImpossibleError,
      );
    });

    it('roundNumber jadvaldan tashqarida', () => {
      const players = makePlayers(4);
      expect(() => single.pair(makeRequest(players, 0))).toThrow(PairingImpossibleError);
      expect(() => single.pair(makeRequest(players, 4))).toThrow(PairingImpossibleError);
      expect(() => single.pair(makeRequest(players, 1.5))).toThrow(PairingImpossibleError);
    });

    it('double RR: 2(N−1) tur bor, undan keyingisi — xato', async () => {
      const players = makePlayers(4);
      const round6 = await double.pair(makeRequest(players, 6, 2));
      expect(round6.pairings).toHaveLength(2);
      expect(() => double.pair(makeRequest(players, 7, 2))).toThrow(PairingImpossibleError);
    });

    it('takrorlangan pairingNumber — determinizm buziladi, xato', () => {
      const players = [makePlayer(1), makePlayer(2), makePlayer(2, { playerId: pid(99) })];
      expect(() => single.pair(makeRequest(players, 1))).toThrow(PairingImpossibleError);
    });
  });

  describe('property testlar (docs/05 §7 kafolatlari)', () => {
    const nAndRoundArb = (legs: 1 | 2) =>
      fc
        .integer({ min: 2, max: 12 })
        .chain((n) =>
          fc.tuple(fc.constant(n), fc.integer({ min: 1, max: legs * roundsPerLeg(n) })),
        );

    /** Butun bir tizim bo'yicha barcha turlarni o'ynaydi. */
    const playAll = async (
      engine: RoundRobinEngine,
      n: number,
      legs: 1 | 2,
    ): Promise<PairingResult[]> => {
      const players = makePlayers(n);
      const results: PairingResult[] = [];
      for (let round = 1; round <= legs * roundsPerLeg(n); round += 1) {
        results.push(await engine.pair(makeRequest(players, round, legs)));
      }
      return results;
    };

    it("har bir o'yinchi har turda aynan bir marta: juftlik yoki bye", async () => {
      await fc.assert(
        fc.asyncProperty(nAndRoundArb(1), async ([n, round]) => {
          const result = await single.pair(makeRequest(makePlayers(n), round));
          const seen = new Map<PlayerId, number>();
          const bump = (id: PlayerId): void => {
            seen.set(id, (seen.get(id) ?? 0) + 1);
          };
          for (const pairing of result.pairings) {
            bump(pairing.whitePlayerId);
            bump(pairing.blackPlayerId);
          }
          for (const bye of result.byes) {
            bump(bye.playerId);
          }
          expect(seen.size).toBe(n);
          for (const count of seen.values()) {
            expect(count).toBe(1);
          }
          // Bye faqat toq N da, va faqat bitta.
          expect(result.byes).toHaveLength(n % 2);
          // Stollar 1..k ketma-ket raqamlangan.
          expect(result.pairings.map((p) => p.boardNumber)).toEqual(
            result.pairings.map((_, i) => i + 1),
          );
        }),
        { numRuns: 200 },
      );
    });

    it("to'liq aylanada har bir juftlik aynan BIR marta uchrashadi (FIDE C1)", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 12 }), async (n) => {
          const meetings = new Map<string, number>();
          for (const result of await playAll(single, n, 1)) {
            for (const pairing of result.pairings) {
              const key = [pairing.whitePlayerId, pairing.blackPlayerId].sort().join('|');
              meetings.set(key, (meetings.get(key) ?? 0) + 1);
            }
          }
          expect(meetings.size).toBe((n * (n - 1)) / 2);
          for (const count of meetings.values()) {
            expect(count).toBe(1);
          }
        }),
        { numRuns: 15 },
      );
    });

    it('double RR: har juftlik IKKI marta, ranglar teskari', async () => {
      // Har tartiblangan (oq, qora) juftlik aynan bir marta uchraydi —
      // bu "ikki marta, ranglar teskari"ning ekvivalenti.
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (n) => {
          const ordered = new Map<string, number>();
          for (const result of await playAll(double, n, 2)) {
            for (const pairing of result.pairings) {
              const key = `${pairing.whitePlayerId}>${pairing.blackPlayerId}`;
              ordered.set(key, (ordered.get(key) ?? 0) + 1);
            }
          }
          expect(ordered.size).toBe(n * (n - 1));
          for (const count of ordered.values()) {
            expect(count).toBe(1);
          }
        }),
        { numRuns: 10 },
      );
    });

    it("determinizm: bir xil input → bir xil output, kirish tartibi ta'sir qilmaydi", async () => {
      await fc.assert(
        fc.asyncProperty(nAndRoundArb(1), async ([n, round]) => {
          const players = makePlayers(n);
          const first = await single.pair(makeRequest(players, round));
          const second = await single.pair(makeRequest(players, round));
          expect(second).toEqual(first);

          // pairingNumber bo'yicha o'tirg'izish massiv tartibiga bog'liq emas.
          const reversed = [...players].reverse();
          const third = await single.pair(makeRequest(reversed, round));
          expect(third).toEqual(first);
        }),
        { numRuns: 200 },
      );
    });

    it("rang balansi: to'liq bir aylanada har o'yinchida |oq − qora| ≤ 1", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 13 }), async (n) => {
          const balance = new Map<PlayerId, number>();
          for (const result of await playAll(single, n, 1)) {
            for (const pairing of result.pairings) {
              balance.set(pairing.whitePlayerId, (balance.get(pairing.whitePlayerId) ?? 0) + 1);
              balance.set(pairing.blackPlayerId, (balance.get(pairing.blackPlayerId) ?? 0) - 1);
            }
          }
          for (const diff of balance.values()) {
            expect(Math.abs(diff)).toBeLessThanOrEqual(1);
          }
        }),
        { numRuns: 12 },
      );
    });
  });
});
