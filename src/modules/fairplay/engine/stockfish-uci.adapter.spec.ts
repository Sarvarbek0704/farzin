import {
  parseBestMove,
  parseIdName,
  parseInfoLine,
  StockfishUciAdapter,
} from './stockfish-uci.adapter';

/**
 * UCI qator PARSERLARI — sof funksiyalar, real binary KERAK EMAS
 * (CI STOCKFISH_PATH'siz o'tadi). Real binary testi — faqat opt-in,
 * STOCKFISH_PATH berilgan lokal muhitda (pastda).
 */
describe('modules/fairplay/engine/stockfish-uci parserlar', () => {
  describe('parseInfoLine', () => {
    it("to'liq info qatori — depth, cp score, pv", () => {
      const line =
        'info depth 12 seldepth 18 multipv 1 score cp 34 nodes 123456 nps 1000000 time 120 pv e2e4 e7e5 g1f3';
      expect(parseInfoLine(line)).toEqual({
        depth: 12,
        score: { unit: 'cp', value: 34 },
        pvFirstMove: 'e2e4',
      });
    });

    it('manfiy cp va mate score', () => {
      expect(parseInfoLine('info depth 20 score cp -120 pv d7d5')).toEqual({
        depth: 20,
        score: { unit: 'cp', value: -120 },
        pvFirstMove: 'd7d5',
      });
      expect(parseInfoLine('info depth 15 score mate -3 pv h7h8q')).toEqual({
        depth: 15,
        score: { unit: 'mate', value: -3 },
        pvFirstMove: 'h7h8q',
      });
    });

    it("pv'siz score qatori — pvFirstMove null", () => {
      expect(parseInfoLine('info depth 5 score cp 10')).toEqual({
        depth: 5,
        score: { unit: 'cp', value: 10 },
        pvFirstMove: null,
      });
    });

    it("score'siz info (currmove, nodes) → null", () => {
      expect(parseInfoLine('info depth 12 currmove e2e4 currmovenumber 1')).toBeNull();
      expect(parseInfoLine('info nodes 500 nps 100000')).toBeNull();
    });

    it("info bo'lmagan qatorlar → null", () => {
      expect(parseInfoLine('bestmove e2e4')).toBeNull();
      expect(parseInfoLine('uciok')).toBeNull();
      expect(parseInfoLine('')).toBeNull();
    });

    it('buzilgan score → null (himoya)', () => {
      expect(parseInfoLine('info depth 12 score cp abc pv e2e4')).toBeNull();
    });
  });

  describe('parseBestMove', () => {
    it("ponder bilan va ponder'siz", () => {
      expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
      expect(parseBestMove('bestmove g8f6')).toBe('g8f6');
    });

    it('promotion yurishi', () => {
      expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q');
    });

    it('"(none)" (mat/patt) → null', () => {
      expect(parseBestMove('bestmove (none)')).toBeNull();
    });

    it("bestmove bo'lmagan qator → null", () => {
      expect(parseBestMove('info depth 1 score cp 0')).toBeNull();
      expect(parseBestMove('')).toBeNull();
    });
  });

  describe('parseIdName', () => {
    it('engine nomi olinadi', () => {
      expect(parseIdName('id name Stockfish 17')).toBe('Stockfish 17');
      expect(parseIdName('id name Stockfish 16.1 NNUE')).toBe('Stockfish 16.1 NNUE');
    });

    it('id author yoki boshqa qator → null', () => {
      expect(parseIdName('id author the Stockfish developers')).toBeNull();
      expect(parseIdName('uciok')).toBeNull();
    });
  });
});

/**
 * OPT-IN — real binary testi. FAQAT STOCKFISH_PATH berilgan muhitda
 * ishlaydi; CI'da avtomatik SKIP (docs/13-testing-strategy.md: tashqi
 * binary CI shartiga aylanmaydi).
 */
const stockfishPath = process.env.STOCKFISH_PATH;
const describeWithEngine =
  stockfishPath !== undefined && stockfishPath !== '' ? describe : describe.skip;

describeWithEngine('stockfish-uci.adapter (REAL binary — opt-in)', () => {
  let adapter: StockfishUciAdapter;

  beforeAll(() => {
    adapter = new StockfishUciAdapter(stockfishPath!);
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  it("boshlang'ich pozitsiyani baholaydi", async () => {
    const result = await adapter.analyzePosition(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      8,
    );
    expect(result.bestMoveUci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(result.evalCp ?? result.mate).not.toBeNull();
  }, 30_000);

  it('mat pozitsiyasida mate score qaytaradi', async () => {
    // Oq: Qh5-f7 mat (scholar's mate dan bir yurish oldin).
    const result = await adapter.analyzePosition(
      'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
      10,
    );
    expect(result.mate === 1 || (result.evalCp !== null && result.evalCp > 500)).toBe(true);
  }, 30_000);
});
