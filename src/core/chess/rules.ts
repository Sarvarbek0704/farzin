import { Chess } from 'chess.js';

/**
 * Shaxmat qoidalari — chess.js ustidan YUPQA o'ram.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BOG'LIQLIK QARORI: chess.js core/ ichida RUXSAT ETILGAN.
 *
 *  .dependency-cruiser.js `core-must-stay-pure` qoidasi @nestjs, @prisma,
 *  express, socket.io, bullmq, ioredis'ni taqiqlaydi — chess.js bu ro'yxatda
 *  YO'Q. U framework ham, infratuzilma ham emas: sof TypeScript'dagi domen
 *  kutubxonasi (legal move generation). docs/07 §5.1: "o'zimizning legal
 *  move generator'imizni yozish — 2–3 hafta ish + o'nlab edge case bug";
 *  server va client BIR XIL kutubxonani ishlatadi — desync yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Server-authoritative validatsiya (docs/07 §2, §5): client faqat NIYAT
 * yuboradi ({from, to, promotion?}); qonuniylik, SAN, FEN, o'yin oxiri —
 * hammasi shu yerda hisoblanadi.
 */

export type ChessSide = 'w' | 'b';

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** O'yinni tugatuvchi pozitsion holatlar (prisma OnlineGameStatus'ning kichik to'plami). */
export type PositionEnd =
  | 'CHECKMATE'
  | 'STALEMATE'
  | 'THREEFOLD_REPETITION'
  | 'FIFTY_MOVE_RULE'
  | 'INSUFFICIENT_MATERIAL';

export interface MoveFlags {
  readonly check: boolean;
  readonly checkmate: boolean;
  readonly stalemate: boolean;
  /** FIDE 5.2.2 dead position (docs/07 §6.5 isDeadPosition) — yurishdan KEYIN. */
  readonly insufficientMaterial: boolean;
  /** Halfmove clock ≥ 100 ply (50-yurish) — docs/07 §6.3. */
  readonly fiftyMove: boolean;
  readonly capture: boolean;
  readonly pawnMove: boolean;
}

export type ValidatedMove =
  | {
      readonly legal: true;
      readonly san: string;
      readonly uci: string;
      readonly fenAfter: string;
      /** Zobrist hash (16 hex) — threefold uchun DB indeksi (Move.positionHash). */
      readonly positionHash: string;
      /**
       * Capture yoki piyoda yurishi — undan keyin oldingi pozitsiyalar qayta
       * yuzaga kela olmaydi (repetition tarixi tozalanadi, docs/07 §6.2).
       */
      readonly irreversible: boolean;
      readonly flags: MoveFlags;
    }
  | { readonly legal: false };

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/**
 * UCI niyatini tekshirish va qo'llash.
 *
 * chess.js v1 noqonuniy yurishda throw qiladi — o'rab olamiz (docs/07 §5.2
 * 7-qadam). Promotion maydonisiz oxirgi gorizontalga piyoda ham throw —
 * bu docs/07 §5.3 talabiga aynan mos ("server promotion yo'qligini
 * illegal_move deb hisoblaydi"), chess.js 1.4 da tekshirilgan.
 */
export function validateMove(fen: string, uci: string): ValidatedMove {
  const parsed = UCI_RE.exec(uci);
  if (parsed === null) {
    return { legal: false };
  }
  const [, from, to, promotion] = parsed;
  if (from === undefined || to === undefined) {
    return { legal: false };
  }

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { legal: false };
  }

  try {
    const move = chess.move({
      from,
      to,
      ...(promotion !== undefined && { promotion }),
    });
    const fenAfter = chess.fen();
    return {
      legal: true,
      san: move.san,
      uci,
      fenAfter,
      positionHash: zobristHash(fenAfter),
      irreversible: move.isCapture() || move.piece === 'p',
      flags: {
        check: chess.inCheck(),
        checkmate: chess.isCheckmate(),
        stalemate: chess.isStalemate(),
        insufficientMaterial: isDeadPosition(fenAfter),
        fiftyMove: halfmoveClock(fenAfter) >= 100,
        capture: move.isCapture(),
        pawnMove: move.piece === 'p',
      },
    };
  } catch {
    return { legal: false };
  }
}

/** FEN'dan navbat kimda. */
export function sideToMove(fen: string): ChessSide {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** FEN 5-maydoni — halfmove clock (docs/07 §6.3). */
export function halfmoveClock(fen: string): number {
  const field = fen.split(' ')[4];
  const n = field === undefined ? 0 : Number(field);
  return Number.isFinite(n) ? n : 0;
}

/**
 * FIDE 9.2 pozitsiya kaliti — FEN'ning halfmove/fullmove'siz birinchi
 * 4 maydoni: joylashuv + navbat + rokirovka huquqi + en passant.
 * chess.js 1.4 fen() ep katakni faqat QONUNIY ep tutish mavjud bo'lganda
 * yozadi — bu FIDE 9.2 "en passant imkoniyati" semantikasiga aynan mos.
 */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * O'yin oxirini pozitsiyadan aniqlash.
 *
 * `priorFens` — shu o'yinda OLDIN yuzaga kelgan pozitsiyalar (fenAfter
 * qatorlari, boshlang'ich pozitsiya bilan birga bo'lishi shart emas —
 * chaqiruvchi kiritadi). Threefold hisobi FIDE 9.2 kaliti bo'yicha:
 * joriy pozitsiya + tarixdagi tengdoshlar ≥ 3 → THREEFOLD_REPETITION.
 *
 * DIQQAT (docs/07 §6.4 dan ONGLI SODDALASHTIRISH): FIDE bo'yicha threefold
 * va 50-yurish — TALAB (claim), 5x/75-yurish — avtomatik. Birinchi bo'lakda
 * claim oqimi yo'q: 3x va 100 ply chegaralari avtomatik durang sifatida
 * qo'llanadi (chess.js isThreefoldRepetition bilan bir xil semantika).
 * Claim tugmasi + claimableDraw payload'i — keyingi bosqich (§7.3).
 */
export function gameEndFromPosition(
  fen: string,
  priorFens: readonly string[] = [],
): PositionEnd | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return 'CHECKMATE';
  }
  if (chess.isStalemate()) {
    return 'STALEMATE';
  }
  if (isDeadPosition(fen)) {
    return 'INSUFFICIENT_MATERIAL';
  }
  if (halfmoveClock(fen) >= 100) {
    return 'FIFTY_MOVE_RULE';
  }
  const key = positionKey(fen);
  const repetitions = 1 + priorFens.filter((f) => positionKey(f) === key).length;
  if (repetitions >= 3) {
    return 'THREEFOLD_REPETITION';
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Material — FIDE 5.2.2 (dead position) va FIDE 6.9 (flag × material)
// ---------------------------------------------------------------------------

interface SidePieces {
  p: number;
  n: number;
  b: number;
  r: number;
  q: number;
  /** Fil turgan katak ranglari — K+B vs K+B bir xil rang tekshiruvi uchun. */
  bishopSquares: ('light' | 'dark')[];
}

function countPieces(fen: string): Record<ChessSide, SidePieces> {
  const chess = new Chess(fen);
  const out: Record<ChessSide, SidePieces> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, bishopSquares: [] },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, bishopSquares: [] },
  };
  chess.board().forEach((row, rankIdx) => {
    row.forEach((square, fileIdx) => {
      if (square === null || square.type === 'k') {
        return;
      }
      const side = out[square.color];
      side[square.type] += 1;
      if (square.type === 'b') {
        side.bishopSquares.push((rankIdx + fileIdx) % 2 === 0 ? 'light' : 'dark');
      }
    });
  });
  return out;
}

/**
 * FIDE 5.2.2 — "dead position": HECH QANDAY legal yurishlar ketma-ketligi
 * bilan mot qilib bo'lmaydi. docs/07 §6.5 jadvali AYNAN:
 *
 *  - K vs K, K+B vs K, K+N vs K → durang;
 *  - K+B vs K+B fillar BIR XIL rangdagi kataklarda → durang;
 *  - K+N+N vs K → durang EMAS (majburiy mot yo'q, lekin help-mate bor —
 *    FIDE uni dead position hisoblamaydi; ko'p implementatsiyada xato).
 */
export function isDeadPosition(fen: string): boolean {
  const pieces = countPieces(fen);
  const w = pieces.w;
  const b = pieces.b;

  if (w.p + b.p > 0 || w.r + b.r > 0 || w.q + b.q > 0) {
    return false;
  }

  const minorsW = w.n + w.b;
  const minorsB = b.n + b.b;

  if (minorsW === 0 && minorsB === 0) {
    return true; // K vs K
  }
  if ((minorsW === 1 && minorsB === 0) || (minorsW === 0 && minorsB === 1)) {
    return true; // K + yengil dona vs K
  }
  if (w.b === 1 && b.b === 1 && minorsW === 1 && minorsB === 1) {
    // K+B vs K+B — faqat fillar bir xil rangdagi kataklarda bo'lsa
    return w.bishopSquares[0] === b.bishopSquares[0];
  }
  return false;
}

/**
 * FIDE 6.9 — flag tushganda BOSHQA savol: "G'OLIB tomon mot qila oladimi?"
 * (docs/07 §3.5, §6.5 hasMatingMaterial). isDeadPosition bilan
 * CHALKASHTIRILMAYDI: K+N vs K+R holatida oq flag tushsa, qora YUTADI.
 *
 *  - Piyoda, ruk yoki farzin bor → HA;
 *  - Yengil donalar soni ≥ 2 (B+B, B+N, N+N) → HA (help-mate mumkin);
 *  - Yolg'iz shoh yoki K + bitta yengil dona → YO'Q → durang
 *    (`TIMEOUT_VS_INSUFFICIENT_MATERIAL`).
 */
export function hasMatingMaterial(fen: string, side: ChessSide): boolean {
  const c = countPieces(fen)[side];
  if (c.p > 0 || c.r > 0 || c.q > 0) {
    return true;
  }
  return c.n + c.b >= 2;
}

// ---------------------------------------------------------------------------
//  Zobrist hashing — docs/07 §6.1
// ---------------------------------------------------------------------------

/**
 * Deterministik 64-bit PRNG (xorshift64) — Zobrist kalitlari uchun.
 * `Math.random` EMAS: hash DB'da saqlanadi (Move.positionHash), shuning
 * uchun kalitlar har processda BIR XIL bo'lishi shart.
 */
class Xorshift64 {
  private s: bigint;

  constructor(seed: bigint) {
    this.s = seed & 0xffff_ffff_ffff_ffffn;
    if (this.s === 0n) {
      this.s = 0x9e37_79b9_7f4a_7c15n;
    }
  }

  next(): bigint {
    let x = this.s;
    x = (x ^ (x << 13n)) & 0xffff_ffff_ffff_ffffn;
    x = x ^ (x >> 7n);
    x = (x ^ (x << 17n)) & 0xffff_ffff_ffff_ffffn;
    this.s = x;
    return x;
  }
}

/**
 * ⚠️  SEED HECH QACHON O'ZGARTIRILMAYDI: positionHash DB'da saqlanadi —
 * seed o'zgarsa eski o'yinlarning takrorlanish hisobi buziladi.
 */
const ZOBRIST_SEED = 0x5152_79f3_84d1_c0den;

/**
 * Zobrist hasher — docs/07 §6.1 AYNAN: hash tarkibiga dona joylashuvi,
 * side-to-move, castling rights VA en passant fayl kiradi (FIDE 9.2).
 *
 * Kollizion himoyasi: 64-bit hash to'qnashuvi ehtimoli ~10⁻¹⁵, lekin durang
 * qarori ehtimolga TAYANMAYDI — chaqiruvchi (play.service) hash mos kelgan
 * qatorlarni FIDE 9.2 kaliti (positionKey) bilan QAYTA tekshiradi (§6.2).
 */
class ZobristHasher {
  private readonly pieceKeys: bigint[][];
  private readonly sideKey: bigint;
  private readonly castlingKeys: bigint[];
  private readonly epFileKeys: bigint[];

  constructor(seed: bigint) {
    const rng = new Xorshift64(seed);
    this.pieceKeys = Array.from({ length: 12 }, () =>
      Array.from({ length: 64 }, () => rng.next()),
    );
    this.sideKey = rng.next();
    this.castlingKeys = Array.from({ length: 16 }, () => rng.next());
    this.epFileKeys = Array.from({ length: 8 }, () => rng.next());
  }

  hash(fen: string): bigint {
    const chess = new Chess(fen);
    let h = 0n;

    chess.board().forEach((row, rankIdx) => {
      row.forEach((square, fileIdx) => {
        if (square === null) {
          return;
        }
        const pieceIdx = this.pieceIndex(square.type, square.color);
        const squareIdx = rankIdx * 8 + fileIdx;
        // noUncheckedIndexedAccess: indekslar konstruktsiya bo'yicha chegarada,
        // baribir aniq tekshiramiz (assertion o'rniga).
        const key = this.pieceKeys[pieceIdx]?.[squareIdx];
        if (key !== undefined) {
          h ^= key;
        }
      });
    });

    if (chess.turn() === 'w') {
      h ^= this.sideKey;
    }
    const castlingKey = this.castlingKeys[this.castlingMask(fen)];
    if (castlingKey !== undefined) {
      h ^= castlingKey;
    }

    const ep = this.enPassantFile(fen);
    const epKey = ep === null ? undefined : this.epFileKeys[ep];
    if (epKey !== undefined) {
      h ^= epKey;
    }

    return h;
  }

  private pieceIndex(type: string, color: string): number {
    const order = ['p', 'n', 'b', 'r', 'q', 'k'];
    return order.indexOf(type) + (color === 'w' ? 0 : 6);
  }

  private castlingMask(fen: string): number {
    const field = fen.split(' ')[2] ?? '-';
    let mask = 0;
    if (field.includes('K')) {
      mask |= 1;
    }
    if (field.includes('Q')) {
      mask |= 2;
    }
    if (field.includes('k')) {
      mask |= 4;
    }
    if (field.includes('q')) {
      mask |= 8;
    }
    return mask;
  }

  private enPassantFile(fen: string): number | null {
    const field = fen.split(' ')[3] ?? '-';
    if (field === '-') {
      return null;
    }
    return field.charCodeAt(0) - 'a'.charCodeAt(0);
  }
}

const HASHER = new ZobristHasher(ZOBRIST_SEED);

/** Pozitsiyaning Zobrist hash'i — 16 belgi hex (Move.positionHash formati). */
export function zobristHash(fen: string): string {
  return HASHER.hash(fen).toString(16).padStart(16, '0');
}

// ---------------------------------------------------------------------------
//  Perft — move generation to'g'riligi (docs/07 §5.4)
// ---------------------------------------------------------------------------

/**
 * Berilgan chuqurlikdagi barcha legal yurishlar (leaf node) soni.
 * Referens qiymatlar bilan solishtirish — chess.js versiya yangilanishiga
 * qarshi himoya (docs/07 §5.1 trade-off, §5.4).
 */
export function perft(fen: string, depth: number): number {
  const chess = new Chess(fen);
  return perftRec(chess, depth);
}

function perftRec(chess: Chess, depth: number): number {
  if (depth === 0) {
    return 1;
  }
  const moves = chess.moves({ verbose: true });
  if (depth === 1) {
    return moves.length;
  }
  let nodes = 0;
  for (const move of moves) {
    chess.move(move);
    nodes += perftRec(chess, depth - 1);
    chess.undo();
  }
  return nodes;
}

/**
 * PGN movetext — SAN ro'yxati + natija belgisi.
 * O'yin tugaganda `OnlineGame.pgn` shu yerdan yig'iladi.
 */
export function buildPgn(sans: readonly string[], result: '1-0' | '0-1' | '1/2-1/2' | '*'): string {
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const moveNo = i / 2 + 1;
    const white = sans[i];
    const black = sans[i + 1];
    parts.push(
      black === undefined
        ? `${String(moveNo)}. ${white ?? ''}`.trim()
        : `${String(moveNo)}. ${white ?? ''} ${black}`,
    );
  }
  return [...parts, result].join(' ');
}
