import {
  ByeType,
  Color,
  FloatDirection,
  PairingImpossibleError,
  type PairingRequest,
  type PairingResult,
  type PlayerId,
  type PlayerPairingState,
  type RoundId,
} from './pairing.types';
import { SwissDutchEngine } from './swiss-dutch.engine';

/**
 * Swiss (FIDE Dutch) — GOLDEN testlar.
 *
 * Har bir ssenariy FIDE C.04.3 (2026-02) verbatim matni
 * (docs/references/fide-c0403-dutch-2026-02.md) bo'yicha QO'LDA, qoida-ma-qoida
 * hisoblangan; kutilgan juftliklar qattiq kodlangan. BU TESTLAR YIQILSA —
 * implementatsiya xato, test emas (birinchi navbatda izohdagi qo'lda hisobni
 * qайта tekshiring).
 *
 * Property-invariantlar alohida faylda: swiss-dutch.engine.property.spec.ts.
 */
describe('SwissDutchEngine', () => {
  const engine = new SwissDutchEngine();

  const pid = (n: number): PlayerId => `P${String(n)}` as PlayerId;
  const rid = (s: string): RoundId => s as RoundId;
  const W = Color.White;
  const B = Color.Black;
  const DOWN = FloatDirection.Down;
  const UP = FloatDirection.Up;
  const NONE = FloatDirection.None;

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

  const opp = (...nums: number[]): ReadonlySet<PlayerId> => new Set(nums.map(pid));

  const makeRequest = (
    players: readonly PlayerPairingState[],
    roundNumber: number,
    totalRounds: number,
    extra: Partial<PairingRequest> = {},
  ): PairingRequest => ({
    roundId: rid(`swiss-r${String(roundNumber)}`),
    roundNumber,
    totalRounds,
    players,
    ...extra,
  });

  /** Juftliklarni [oq, qora] TPN ko'rinishida taqqoslash uchun. */
  const boards = (result: PairingResult): (readonly [string, string])[] =>
    result.pairings.map((p) => [String(p.whitePlayerId), String(p.blackPlayerId)] as const);

  describe('metadata', () => {
    it('system va version', () => {
      expect(engine.system).toBe('SWISS_DUTCH');
      expect(engine.version).toBe('1.0.0');
    });

    it('engineVersion natijaga yoziladi (audit talabi)', async () => {
      const result = await engine.pair(makeRequest([makePlayer(1), makePlayer(2)], 1, 3));
      expect(result.engineVersion).toBe('1.0.0');
    });
  });

  describe("GOLDEN A — 1-tur, 8 o'yinchi (Article 3.2/3.3 + 5.2.5)", () => {
    /**
     * QO'LDA HISOB:
     *  - Hamma 0 ochko → bitta homogen bracket (Article 1.3).
     *  - MaxPairs = 4; S1 = {1,2,3,4}, S2 = {5,6,7,8} (Article 3.2.2/3.2.3).
     *  - Birinchi nomzod S1[i]–S2[i] (3.3.1): 1-5, 2-6, 3-7, 4-8. Tarix yo'q →
     *    barcha kriteriylar 0 → nomzod perfect (3.4.1) → qabul.
     *  - Ranglar: hech kimda afzallik yo'q (1.7.4) → 5.2.1–5.2.4 o'tmaydi →
     *    5.2.5: yuqori rankdagi TPN toq → initial-colour (bu testda oq).
     *      (1,5): TPN1 toq  → 1 oq;
     *      (2,6): TPN2 juft → 2 qora (6 oq);
     *      (3,7): TPN3 toq  → 3 oq;
     *      (4,8): TPN4 juft → 4 qora (8 oq).
     */
    it('standart yuqori yarim vs quyi yarim, ranglar navbatlashadi', async () => {
      const players = [8, 3, 1, 5, 2, 7, 4, 6].map((n) => makePlayer(n)); // ataylab aralash tartib
      const result = await engine.pair(makeRequest(players, 1, 7));

      expect(boards(result)).toEqual([
        ['P1', 'P5'],
        ['P6', 'P2'],
        ['P3', 'P7'],
        ['P8', 'P4'],
      ]);
      expect(result.byes).toEqual([]);
      expect(result.diagnostics?.scoreGroupCount).toBe(1);
      expect(result.diagnostics?.floatCount).toBe(0);
      expect(result.diagnostics?.relaxedCriteria).toEqual([]);
    });

    it('initialColor = BLACK bo\'lsa 5.2.5 ranglari teskari', async () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(i + 1));
      const result = await engine.pair(
        makeRequest(players, 1, 7, { initialColor: Color.Black }),
      );
      expect(boards(result)).toEqual([
        ['P5', 'P1'],
        ['P2', 'P6'],
        ['P7', 'P3'],
        ['P4', 'P8'],
      ]);
    });

    it("toq son (7): PAB eng past rankdagiga (C5 teng → eng katta TPN), qolgani S1–S2", async () => {
      /**
       * QO'LDA HISOB: 7 aktiv → dummy tugun oxirgi (yagona) bracketda.
       * C5 (ochko) va C9 (o'ynalmaganlar) hamma uchun teng → TB darajasi:
       * eng past o'rin (bsn 6 = P7) floatga/PABga qoladi (Article 3 dagi
       * "oxirgi qolgan" semantikasi). Qolgan 6 kishi: S1={1,2,3}, S2={4,5,6}
       * → 1-4, 2-5, 3-6; ranglar 5.2.5: 1 oq; 2 juft → 5 oq; 3 oq.
       */
      const players = Array.from({ length: 7 }, (_, i) => makePlayer(i + 1));
      const result = await engine.pair(makeRequest(players, 1, 5));
      expect(boards(result)).toEqual([
        ['P1', 'P4'],
        ['P5', 'P2'],
        ['P3', 'P6'],
      ]);
      expect(result.byes).toEqual([
        { playerId: pid(7), type: ByeType.PairingAllocated, points: 1 },
      ]);
    });

    it("1-tur, 20 o'yinchi: to'liq yuqori/quyi yarim naqshi", async () => {
      const players = Array.from({ length: 20 }, (_, i) => makePlayer(i + 1));
      const result = await engine.pair(makeRequest(players, 1, 9));
      const expected: (readonly [string, string])[] = [];
      for (let k = 1; k <= 10; k += 1) {
        expected.push(k % 2 === 1 ? [`P${String(k)}`, `P${String(k + 10)}`] : [`P${String(k + 10)}`, `P${String(k)}`]);
      }
      expect(boards(result)).toEqual(expected);
    });
  });

  describe("GOLDEN B — 6 o'yinchi, 2- va 3-turlar (C1 to'sig'i, MDP, C12)", () => {
    /**
     * 1-tur (Golden A bo'yicha): 1-4 (1 oq, 1-0), 5-2 (5 oq, 1-0), 3-6 (3 oq, ½-½).
     * 2-turdan oldingi holat:
     *   1: 1.0 [W]  | 5: 1.0 [W] | 3: 0.5 [W] | 6: 0.5 [B] | 2: 0 [B] | 4: 0 [B]
     *
     * QO'LDA HISOB (2-tur):
     *  Bracket 1.0 {1,5}: nomzod 1-5 (C1 ✓, ikkalasi strong qora — bu ABSOLUTE
     *  emas → C3 buzilmaydi). C6 (juftlik soni) C12 dan ustun → juftlik qoladi.
     *  Rang: teng kuch, bir xil istak → 5.2.3: tarixlar bir xil ([W] va [W]) →
     *  5.2.4: yuqori rank (1) qora oladi → 5 oq. C12 buzildi (diagnostika).
     *
     *  Bracket 0.5 {3,6}: 3-6 1-turda o'ynagan (C1!) → juftlik yo'q → ikkalasi
     *  downfloat (Article 1.9.2) → bracket 0 ga MDP bo'lib tushadi.
     *
     *  Bracket 0 {2,4} + MDP {3,6}: S1={3,6}, S2={2,4} (Article 3.2.2).
     *  Birinchi nomzod (4.2.2 leksikografik tartibda): 3-2, 6-4.
     *   - 3-2: C1 ✓; 3 strong qora, 2 strong oq → mos (C12=0);
     *   - 6-4: C1 ✓; 6 strong oq, 4 strong oq → bittasi buziladi (C12=1).
     *  Muqobil 3-4, 6-2 ham C12=1 (6/2 ikkalasi oq istaydi) → teng sifat →
     *  KETMA-KETLIKDA OLDINGI nomzod g'olib (3.8.1): {3-2, 6-4}.
     *  Ranglar: (3,2) → 5.2.1: 2 oq, 3 qora. (6,4) → teng kuch, tarixlar bir
     *  xil ([B],[B]) → 5.2.4: yuqori rank 6 oq oladi.
     *
     *  Taxtalar (yuqori rank bo'yicha): 5-1, 2-3, 6-4.
     */
    const round2Players = [
      makePlayer(1, { points: 1, opponentIds: opp(4), colorHistory: [W], floatHistory: [NONE] }),
      makePlayer(2, { points: 0, opponentIds: opp(5), colorHistory: [B], floatHistory: [NONE] }),
      makePlayer(3, { points: 0.5, opponentIds: opp(6), colorHistory: [W], floatHistory: [NONE] }),
      makePlayer(4, { points: 0, opponentIds: opp(1), colorHistory: [B], floatHistory: [NONE] }),
      makePlayer(5, { points: 1, opponentIds: opp(2), colorHistory: [W], floatHistory: [NONE] }),
      makePlayer(6, { points: 0.5, opponentIds: opp(3), colorHistory: [B], floatHistory: [NONE] }),
    ];

    it('2-tur: C1 to\'sig\'i butun bracketni pastga tushiradi', async () => {
      const result = await engine.pair(makeRequest(round2Players, 2, 5));
      expect(boards(result)).toEqual([
        ['P5', 'P1'],
        ['P2', 'P3'],
        ['P6', 'P4'],
      ]);
      expect(result.byes).toEqual([]);
      // C12: {1,5} va {6,4} juftliklarida afzallik qondirilmadi.
      expect(result.diagnostics?.relaxedCriteria).toContain('C12');
      expect(result.diagnostics?.scoreGroupCount).toBe(3);
      // 3 va 6 pastga juftlashdi (har biri down+up juftligi): floatCount = 4.
      expect(result.diagnostics?.floatCount).toBe(4);
    });

    /**
     * 2-tur natijalari: 5-1 ½-½, 2-3 0-1, 6-4 1-0.
     * 3-turdan oldingi holat:
     *   1: 1.5 [W,B] fl[N,N]   | 3: 1.5 [W,B] fl[N,D] (0.5 → 0 ga qarshi Down)
     *   5: 1.5 [W,W] fl[N,N]   | 6: 1.5 [B,W] fl[N,D]
     *   2: 0   [B,W] fl[N,U]   | 4: 0   [B,B] fl[N,U]
     *
     * QO'LDA HISOB (3-tur):
     *  Afzalliklar (1.7): 1 mild oq; 3 mild oq; 5 CD=+2 → ABSOLUTE qora
     *  (1.7.1); 6 mild qora; 2 mild qora; 4 CD=−2 → ABSOLUTE oq.
     *  Bracket 1.5 {1,3,5,6}: birinchi nomzod 1-5, 3-6 — IKKALASI C1 da yiqiladi
     *  (1-5 2-turda, 3-6 1-turda o'ynagan). Transpozitsiya (4.2): 1-6, 3-5:
     *   - 1-6: C1 ✓; mild oq vs mild qora → mos (C12=0);
     *   - 3-5: C1 ✓; mild oq vs absolute qora → mos (C12=0);
     *  → perfect nomzod (3.4.1) → qabul. Ranglar 5.2.1: 1 oq / 6 qora; 3 oq / 5 qora.
     *  Bracket 0 {2,4}: 2-4 C1 ✓; mild qora vs absolute oq → 5.2.1: 4 oq, 2 qora.
     *  Taxtalar: 1-6, 3-5, 4-2. Hech bir kriteriy buzilmaydi.
     */
    it('3-tur: absolyut rang afzalliklari (CD=±2) to\'g\'ri boshqariladi', async () => {
      const round3Players = [
        makePlayer(1, {
          points: 1.5,
          opponentIds: opp(4, 5),
          colorHistory: [W, B],
          floatHistory: [NONE, NONE],
        }),
        makePlayer(2, {
          points: 0,
          opponentIds: opp(5, 3),
          colorHistory: [B, W],
          floatHistory: [NONE, UP],
        }),
        makePlayer(3, {
          points: 1.5,
          opponentIds: opp(6, 2),
          colorHistory: [W, B],
          floatHistory: [NONE, DOWN],
        }),
        makePlayer(4, {
          points: 0,
          opponentIds: opp(1, 6),
          colorHistory: [B, B],
          floatHistory: [NONE, UP],
        }),
        makePlayer(5, {
          points: 1.5,
          opponentIds: opp(2, 1),
          colorHistory: [W, W],
          floatHistory: [NONE, NONE],
        }),
        makePlayer(6, {
          points: 1.5,
          opponentIds: opp(3, 4),
          colorHistory: [B, W],
          floatHistory: [NONE, DOWN],
        }),
      ];
      const result = await engine.pair(makeRequest(round3Players, 3, 5));
      expect(boards(result)).toEqual([
        ['P1', 'P6'],
        ['P3', 'P5'],
        ['P4', 'P2'],
      ]);
      expect(result.byes).toEqual([]);
      expect(result.diagnostics?.relaxedCriteria).toEqual([]);
    });
  });

  describe("GOLDEN C — 7 o'yinchi, 2-tur (C14 refloat, PAB tanlovi C5+C12)", () => {
    /**
     * 1-tur (7 o'yinchi golden'i bo'yicha): 1-4 (1-0), 5-2 (0-1), 3-6 (½-½),
     * PAB → 7 (1.4.3 bo'yicha 7 ga DOWNFLOAT yozildi).
     * 2-turdan oldingi holat:
     *   1: 1.0 [W]      | 2: 1.0 [B] | 7: 1.0 [] PAB oldi, fl[D]
     *   3: 0.5 [W]      | 6: 0.5 [B]
     *   4: 0   [B]      | 5: 0   [W]
     *
     * QO'LDA HISOB:
     *  Afzalliklar: 1 strong qora; 2 strong oq; 7 yo'q (1.7.4); 3 strong qora;
     *  6 strong oq; 4 strong oq; 5 strong qora.
     *
     *  Bracket 1.0 {1,2,7}: MaxPairs=1, S1={1}, S2={2,7}.
     *  Nomzod 1: 1-2, float 7 → C14 buziladi! (7 o'tgan turda downfloat —
     *  PAB, Article 1.4.3 — olgan, yana float qilyapti) → perfect emas.
     *  Transpozitsiya: 1-7, float 2 → C12=0 (7 da afzallik yo'q, 1 qora oladi),
     *  C14=0 → PERFECT → qabul (3.4.1). Rang 5.2.1(1.7.4): 1 qora, 7 oq.
     *
     *  Bracket 0.5 {3,6} + MDP {2}: S1={2}, S2={3,6}.
     *  Nomzod 2-3, float 6: C1 ✓; 2 oq / 3 qora → C12=0; 6 da avvalgi float
     *  yo'q → C14=0 → perfect → qabul. Rang 5.2.1: 2 oq, 3 qora.
     *
     *  Oxirgi bracket {4,5} + MDP {6} + PAB: S1={6}, S2={4,5}.
     *  Nomzod 6-4, PAB 5: C5 ✓ (5 ning ochkosi 0 — minimal), lekin 6 va 4
     *  ikkalasi strong OQ istaydi → C12=1 → perfect emas.
     *  Transpozitsiya: 6-5, PAB 4: 6 oq / 5 qora → C12=0; PAB 4: C2 ✓,
     *  C5 ✓ (ochko 0), C9 teng → PERFECT → qabul. Rang 5.2.1: 6 oq, 5 qora.
     *
     *  Taxtalar: 7-1, 2-3, 6-5; PAB → 4.
     */
    const roundId = rid('golden-c-r2');
    const players = [
      makePlayer(1, { points: 1, opponentIds: opp(4), colorHistory: [W], floatHistory: [NONE] }),
      makePlayer(2, { points: 1, opponentIds: opp(5), colorHistory: [B], floatHistory: [NONE] }),
      makePlayer(3, { points: 0.5, opponentIds: opp(6), colorHistory: [W], floatHistory: [NONE] }),
      makePlayer(4, { points: 0, opponentIds: opp(1), colorHistory: [B], floatHistory: [NONE] }),
      makePlayer(5, { points: 0, opponentIds: opp(2), colorHistory: [W], floatHistory: [NONE] }),
      makePlayer(6, { points: 0.5, opponentIds: opp(3), colorHistory: [B], floatHistory: [NONE] }),
      makePlayer(7, {
        points: 1,
        colorHistory: [],
        floatHistory: [DOWN],
        hasReceivedBye: true,
      }),
    ];

    it('C14 refloat taqiqlaydi, PAB C12 hisobga olib tanlanadi', async () => {
      const result = await engine.pair({
        roundId,
        roundNumber: 2,
        totalRounds: 5,
        players,
      });
      expect(boards(result)).toEqual([
        ['P7', 'P1'],
        ['P2', 'P3'],
        ['P6', 'P5'],
      ]);
      expect(result.byes).toEqual([
        { playerId: pid(4), type: ByeType.PairingAllocated, points: 1 },
      ]);
      const diag = result.diagnostics;
      expect(diag?.scoreGroupCount).toBe(3);
      // (2,3) va (6,5) — aralash ochkoli juftliklar (2×2 float) + PAB (1).
      expect(diag?.floatCount).toBe(5);
      expect(diag?.relaxedCriteria).toEqual([]);
    });

    it("kirish tartibi natijaga ta'sir qilmaydi (teskari tartib)", async () => {
      const forward = await engine.pair({ roundId, roundNumber: 2, totalRounds: 5, players });
      const reversed = await engine.pair({
        roundId,
        roundNumber: 2,
        totalRounds: 5,
        players: [...players].reverse(),
      });
      expect(reversed.pairings).toEqual(forward.pairings);
      expect(reversed.byes).toEqual(forward.byes);
    });

    it('determinizm: ikki chaqiruv bit-for-bit teng (durationMs dan tashqari)', async () => {
      const a = await engine.pair({ roundId, roundNumber: 2, totalRounds: 5, players });
      const b = await engine.pair({ roundId, roundNumber: 2, totalRounds: 5, players });
      expect(b.pairings).toEqual(a.pairings);
      expect(b.byes).toEqual(a.byes);
      expect(b.diagnostics?.scoreGroupCount).toBe(a.diagnostics?.scoreGroupCount);
      expect(b.diagnostics?.floatCount).toBe(a.diagnostics?.floatCount);
      expect(b.diagnostics?.relaxedCriteria).toEqual(a.diagnostics?.relaxedCriteria);
    });
  });

  describe('chegara holatlari va xatolar', () => {
    it("hamma hamma bilan o'ynagan → PairingImpossibleError (kutilgan holat, bug emas)", () => {
      const players = [
        makePlayer(1, { points: 3, opponentIds: opp(2, 3, 4), colorHistory: [W, B, W] }),
        makePlayer(2, { points: 2, opponentIds: opp(1, 3, 4), colorHistory: [B, W, B] }),
        makePlayer(3, { points: 1, opponentIds: opp(1, 2, 4), colorHistory: [W, B, W] }),
        makePlayer(4, { points: 0, opponentIds: opp(1, 2, 3), colorHistory: [B, W, B] }),
      ];
      expect(() => engine.pair(makeRequest(players, 4, 5))).toThrow(PairingImpossibleError);
    });

    it("yakka o'yinchi PAB ololmasa (C2) → PairingImpossibleError", () => {
      const players = [makePlayer(1, { points: 1, hasReceivedBye: true })];
      expect(() => engine.pair(makeRequest(players, 2, 3))).toThrow(PairingImpossibleError);
    });

    it('yakka haqli o\'yinchi → PAB oladi', async () => {
      const players = [makePlayer(1, { points: 0 })];
      const result = await engine.pair(makeRequest(players, 1, 3));
      expect(result.pairings).toEqual([]);
      expect(result.byes).toEqual([
        { playerId: pid(1), type: ByeType.PairingAllocated, points: 1 },
      ]);
    });

    it('takror pairingNumber → PairingImpossibleError', () => {
      const players = [makePlayer(1), makePlayer(2), makePlayer(2)];
      expect(() => engine.pair(makeRequest(players, 1, 3))).toThrow(PairingImpossibleError);
    });

    it('yaroqsiz roundNumber/totalRounds → PairingImpossibleError', () => {
      const players = [makePlayer(1), makePlayer(2)];
      expect(() => engine.pair(makeRequest(players, 0, 3))).toThrow(PairingImpossibleError);
      expect(() => engine.pair(makeRequest(players, 4, 3))).toThrow(PairingImpossibleError);
    });

    it("chiqib ketgan va hali qo'shilmagan o'yinchilar juftlashtirilmaydi", async () => {
      const players = [
        makePlayer(1),
        makePlayer(2),
        makePlayer(3),
        makePlayer(4),
        makePlayer(5, { joinedAtRound: 2 }), // 1-turda hali yo'q
        makePlayer(6, { isWithdrawn: true }),
      ];
      const result = await engine.pair(makeRequest(players, 1, 5));
      const involved = new Set<string>();
      for (const p of result.pairings) {
        involved.add(String(p.whitePlayerId));
        involved.add(String(p.blackPlayerId));
      }
      for (const bye of result.byes) {
        involved.add(String(bye.playerId));
      }
      expect(involved.has('P5')).toBe(false);
      expect(involved.has('P6')).toBe(false);
      expect(involved.size).toBe(4);
      expect(result.byes).toEqual([]); // 4 aktiv — juft son
    });
  });
});
