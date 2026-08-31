import {
  buildPgn,
  gameEndFromPosition,
  hasMatingMaterial,
  halfmoveClock,
  isDeadPosition,
  perft,
  positionKey,
  sideToMove,
  validateMove,
  zobristHash,
  STARTING_FEN,
} from './rules';

/**
 * Qoidalar o'rami testlari — docs/07-realtime-and-clock.md §5, §6 va
 * §14.3/§14.4 acceptance bandlari bo'yicha ma'lum FEN fixture'lar.
 */
describe('core/chess rules', () => {
  describe('validateMove', () => {
    it("qonuniy yurish: SAN, fenAfter, hash qaytaradi (fool's mate 1-yurishi)", () => {
      const r = validateMove(STARTING_FEN, 'f2f3');
      expect(r.legal).toBe(true);
      if (r.legal) {
        expect(r.san).toBe('f3');
        expect(sideToMove(r.fenAfter)).toBe('b');
        expect(r.positionHash).toMatch(/^[0-9a-f]{16}$/);
        expect(r.irreversible).toBe(true); // piyoda yurishi
      }
    });

    it('noqonuniy yurish (a1→h8) → legal: false (docs/07 §14.1)', () => {
      expect(validateMove(STARTING_FEN, 'a1h8').legal).toBe(false);
    });

    it("buzuq UCI yoki buzuq FEN → legal: false, throw YO'Q", () => {
      expect(validateMove(STARTING_FEN, 'xyz').legal).toBe(false);
      expect(validateMove('not-a-fen', 'e2e4').legal).toBe(false);
    });

    it('promotion maydonisiz oxirgi gorizontalga piyoda → illegal (docs/07 §5.3)', () => {
      const fen = '8/4P3/8/8/8/8/2k5/K7 w - - 0 1';
      expect(validateMove(fen, 'e7e8').legal).toBe(false);
    });

    it('underpromotion (n) qabul qilinadi (docs/07 §14.3)', () => {
      const fen = '8/4P3/8/8/8/8/2k5/K7 w - - 0 1';
      const r = validateMove(fen, 'e7e8n');
      expect(r.legal).toBe(true);
      if (r.legal) {
        expect(r.san).toBe('e8=N');
      }
    });

    it("fool's mate ketma-ketligi: Qh4# → checkmate flag", () => {
      let fen = STARTING_FEN;
      for (const uci of ['f2f3', 'e7e5', 'g2g4']) {
        const r = validateMove(fen, uci);
        expect(r.legal).toBe(true);
        if (r.legal) {
          fen = r.fenAfter;
        }
      }
      const mate = validateMove(fen, 'd8h4');
      expect(mate.legal).toBe(true);
      if (mate.legal) {
        expect(mate.san).toBe('Qh4#');
        expect(mate.flags.checkmate).toBe(true);
        expect(mate.flags.check).toBe(true);
        expect(gameEndFromPosition(mate.fenAfter)).toBe('CHECKMATE');
      }
    });
  });

  describe('gameEndFromPosition', () => {
    it('stalemate: qora yura olmaydi, shoh ostida emas', () => {
      // Qora shoh h8 da qulflangan — navbat qorada, legal yurish yo'q.
      const fen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
      expect(gameEndFromPosition(fen)).toBe('STALEMATE');
    });

    it('K vs K → INSUFFICIENT_MATERIAL (avtomatik durang, FIDE 5.2.2)', () => {
      expect(gameEndFromPosition('8/8/8/4k3/8/4K3/8/8 w - - 0 1')).toBe('INSUFFICIENT_MATERIAL');
    });

    it('50-yurish: halfmove clock 100 ga yetdi → FIFTY_MOVE_RULE', () => {
      const fen = '7k/8/8/8/8/8/R7/K7 b - - 100 80';
      expect(halfmoveClock(fen)).toBe(100);
      expect(gameEndFromPosition(fen)).toBe('FIFTY_MOVE_RULE');
    });

    it('threefold shuffle: bir xil pozitsiya 3-marta → THREEFOLD_REPETITION', () => {
      // Ot chiqib-qaytadi: pozitsiya (FIDE 9.2 kaliti bilan) uch marta yuzaga
      // keladi. Boshlang'ich pozitsiya HAM hisobga kiradi (FIDE 9.2) —
      // shuning uchun `seen` unga oldindan ega.
      let fen = STARTING_FEN;
      const seen: string[] = [STARTING_FEN];
      const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
      let end: ReturnType<typeof gameEndFromPosition> = null;
      for (let round = 0; round < 3 && end === null; round += 1) {
        for (const uci of cycle) {
          const r = validateMove(fen, uci);
          expect(r.legal).toBe(true);
          if (r.legal) {
            end = gameEndFromPosition(r.fenAfter, seen);
            seen.push(r.fenAfter);
            fen = r.fenAfter;
            if (end !== null) {
              break;
            }
          }
        }
      }
      expect(end).toBe('THREEFOLD_REPETITION');
    });

    it('rokirovka huquqi farq qilsa — takrorlanish SANALMAYDI (FIDE 9.2, docs/07 §14.4)', () => {
      const withCastle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
      const noCastle = 'r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1';
      expect(positionKey(withCastle)).not.toBe(positionKey(noCastle));
      expect(zobristHash(withCastle)).not.toBe(zobristHash(noCastle));
    });
  });

  describe('isDeadPosition (FIDE 5.2.2 — docs/07 §6.5 jadvali)', () => {
    it.each([
      ['K vs K', '8/8/8/4k3/8/4K3/8/8 w - - 0 1', true],
      ['K+B vs K', '8/8/8/4k3/8/4KB2/8/8 w - - 0 1', true],
      ['K+N vs K', '8/8/8/7k/8/4KN2/8/8 w - - 0 1', true],
      // c1 (qora katak) va d8 (qora katak) — bir xil rang → durang
      ['K+B vs K+B bir xil rang', '3bk3/8/8/8/8/8/8/2B1K3 w - - 0 1', true],
      // c8 oq katak, c1 qora katak → turli rang → o'yin davom etadi
      ['K+B vs K+B turli rang', '2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1', false],
      ['K+N+N vs K — FIDE: dead EMAS', '8/8/8/7k/8/3KNN2/8/8 w - - 0 1', false],
      ['K+R vs K', '8/8/8/4k3/8/2KR4/8/8 w - - 0 1', false],
      ['piyoda bor', '8/8/8/4k3/8/3KP3/8/8 w - - 0 1', false],
    ])('%s → %s', (_name, fen, expected) => {
      expect(isDeadPosition(fen)).toBe(expected);
    });
  });

  describe('hasMatingMaterial (FIDE 6.9 — flag × material, docs/07 §3.5)', () => {
    it.each([
      ["yolg'iz shoh", '8/8/8/4k3/8/4K2Q/8/8 w - - 0 1', 'b' as const, false],
      ['farzin bor', '8/8/8/4k3/8/4K2Q/8/8 w - - 0 1', 'w' as const, true],
      ['K+N — mot qila olmaydi', '8/8/8/7k/8/4KN2/8/8 w - - 0 1', 'w' as const, false],
      ['K+B — mot qila olmaydi', '8/8/8/4k3/8/4KB2/8/8 w - - 0 1', 'w' as const, false],
      ['K+N+N — help-mate mumkin → HA', '8/8/8/7k/8/3KNN2/8/8 w - - 0 1', 'w' as const, true],
      ['K+R — HA', '8/8/8/4k3/8/2KR4/8/8 w - - 0 1', 'w' as const, true],
      ['K+piyoda — HA', '8/8/8/4k3/8/3KP3/8/8 w - - 0 1', 'w' as const, true],
    ])('%s → %s', (_name, fen, side, expected) => {
      expect(hasMatingMaterial(fen, side)).toBe(expected);
    });

    it('K+N vs K+R: flag tushgan oqqa qarshi qora (K+R) YUTADI (docs/07 §14.2)', () => {
      const fen = '8/8/8/3rk3/8/4KN2/8/8 w - - 0 1';
      expect(hasMatingMaterial(fen, 'b')).toBe(true);
      expect(hasMatingMaterial(fen, 'w')).toBe(false);
    });
  });

  describe('zobristHash (docs/07 §6.1)', () => {
    it('deterministik va 16 hex', () => {
      expect(zobristHash(STARTING_FEN)).toBe(zobristHash(STARTING_FEN));
      expect(zobristHash(STARTING_FEN)).toMatch(/^[0-9a-f]{16}$/);
    });

    it('navbat hash tarkibida — bir xil joylashuv, turli navbat → turli hash', () => {
      const w = '8/8/8/4k3/8/4K3/8/R7 w - - 0 1';
      const b = '8/8/8/4k3/8/4K3/8/R7 b - - 0 1';
      expect(zobristHash(w)).not.toBe(zobristHash(b));
    });

    it("halfmove/fullmove hash'ga KIRMAYDI (FIDE 9.2)", () => {
      const a = '8/8/8/4k3/8/4K3/8/R7 w - - 0 1';
      const b = '8/8/8/4k3/8/4K3/8/R7 w - - 42 99';
      expect(zobristHash(a)).toBe(zobristHash(b));
    });
  });

  describe("perft — move generation to'g'riligi (docs/07 §5.4, depth ≤ 3 har PR'da)", () => {
    const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    const POSITION_3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';

    it.each([
      [STARTING_FEN, 1, 20],
      [STARTING_FEN, 2, 400],
      [STARTING_FEN, 3, 8_902],
      [KIWIPETE, 1, 48],
      [KIWIPETE, 2, 2_039],
      [POSITION_3, 1, 14],
      [POSITION_3, 2, 191],
      [POSITION_3, 3, 2_812],
    ])('perft(%s, %i) === %i', (fen, depth, expected) => {
      expect(perft(fen, depth)).toBe(expected);
    });
  });

  describe('buildPgn', () => {
    it("fool's mate PGN", () => {
      expect(buildPgn(['f3', 'e5', 'g4', 'Qh4#'], '0-1')).toBe('1. f3 e5 2. g4 Qh4# 0-1');
    });

    it('toq sonli yarim-yurish', () => {
      expect(buildPgn(['e4'], '*')).toBe('1. e4 *');
    });
  });
});
