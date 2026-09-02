import { Chess } from 'chess.js';

import {
  buildObservations,
  engineCorrelation,
  type PositionEval,
} from '../modules/fairplay/engine/engine-correlation';
import { StockfishUciAdapter } from '../modules/fairplay/engine/stockfish-uci.adapter';
import { OPENING_PLIES_EXCLUDED } from '../core/fairplay/timing-analysis';

/**
 * FAIR-PLAY DETEKTORINING SEZUVCHANLIGINI O'LCHASH.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU NIMA VA NIMA EMAS
 *
 *  docs/AUDIT.md JIDDIY-10: `FAIRPLAY_SUSPICION_THRESHOLD = 0.6` chegarasi
 *  va signal vaznlari hujjatning SIFAT so'zlaridan ("Yuqori",
 *  "O'rtacha–yuqori") olingan — o'lchovdan emas. Ya'ni hech kim
 *  detektorning qanchalik to'g'ri ishlashini bilmaydi.
 *
 *  Kalibrlash ikki raqamni talab qiladi:
 *    1. SEZUVCHANLIK   — chit qilganlarning nechtasi ushlanadi;
 *    2. YOLG'ON-POZITIV — halollarning nechtasiga nohaq ish ochiladi.
 *
 *  ⚠️  BU VOSITA FAQAT BIRINCHISINI O'LCHAYDI.
 *
 *  Sabab oddiy: "dvigatel o'ynagan o'yin" ni TA'RIFI BO'YICHA yaratish
 *  mumkin — Stockfish o'ynasa, u dvigatel o'yini, bunga dalil kerak emas.
 *  "Halol odam o'yini" esa faqat HAQIQIY odamlardan keladi; uni o'ylab
 *  topib bo'lmaydi. To'qilgan "toza" to'plam o'lchovga o'xshagan, aslida
 *  fantaziya bo'lgan raqam berardi — bu "o'lchanmagan" deb yozib
 *  qo'yishdan YOMONROQ.
 *
 *  Shu sababli chiqishda yolg'on-pozitiv darajasi O'RNIGA aniq izoh
 *  chiqadi, taxminiy raqam emas.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  USUL
 *
 *  Har "yordam darajasi" p uchun o'yin generatsiya qilinadi: har yurishda
 *  p ehtimol bilan KUCHLI dvigatel yurishi (GEN_STRONG_DEPTH), aks holda
 *  ZAIF yurish (GEN_WEAK_DEPTH) o'ynaladi. Keyin o'yin production kod
 *  yo'li bilan tahlil qilinadi va `engineCorrelation` skori olinadi.
 *
 *  p = 0 qatori — NAZORAT. U "halol odam" EMAS, balki zaif dvigatel.
 *  Uning vazifasi bitta: detektor hamma narsani belgilamasligini
 *  ko'rsatish. Uni yolg'on-pozitiv darajasi sifatida o'qish XATO bo'ladi
 *  va chiqishda shu ochiq yozilgan.
 *
 *  Nega tasodifiy yurish emas: tasodifiy o'ynagan "o'yinchi" ni tozalash
 *  arzimas ish. Qiyin holat — KUCHLI odam, va zaif dvigatel unga
 *  tasodifdan ko'ra yaqinroq proksi.
 *
 *  ISHGA TUSHIRISH (Stockfish worker image'ida):
 *    docker build --target worker -t farzin:worker .
 *    docker run --rm -e STOCKFISH_PATH=/usr/bin/stockfish \
 *      farzin:worker node dist/tools/fairplay-calibration.js
 */

/** Yordam darajalari — 1.0 = har yurish dvigateldan. */
const ASSIST_RATES = [1.0, 0.5, 0.25, 0.0];

/** Har daraja uchun nechta o'yin. Kichik: har o'yin yuzlab tahlil oladi. */
const GAMES_PER_RATE = Number(process.env.CALIB_GAMES ?? '2');

/** O'yin uzunligi chegarasi (ply). ~60 ply = 30 yurish. */
const MAX_PLIES = Number(process.env.CALIB_MAX_PLIES ?? '60');

/** "Chit" yurish chuqurligi. */
const GEN_STRONG_DEPTH = Number(process.env.CALIB_STRONG_DEPTH ?? '12');

/** "Zaif" yurish chuqurligi — odam proksisi, tasodif emas. */
const GEN_WEAK_DEPTH = 1;

/** Tahlil chuqurligi — production `FAIRPLAY_ENGINE_DEPTH` bilan bir xil bo'lsin. */
const ANALYSIS_DEPTH = Number(process.env.FAIRPLAY_ENGINE_DEPTH ?? '12');

/** Ish ochish chegarasi — production `FAIRPLAY_SUSPICION_THRESHOLD`. */
const THRESHOLD = Number(process.env.FAIRPLAY_SUSPICION_THRESHOLD ?? '0.6');

interface GeneratedGame {
  /** `{ply, uci}` — production `GameMoveForAnalysis` ning kerakli qismi. */
  moves: { ply: number; uci: string }[];
  /** Har ply'dan KEYINGI FEN; [0] — boshlang'ich pozitsiya. */
  fens: string[];
}

async function generateGame(
  engine: StockfishUciAdapter,
  assistRate: number,
  rng: () => number,
): Promise<GeneratedGame> {
  const chess = new Chess();
  const moves: { ply: number; uci: string }[] = [];
  const fens: string[] = [chess.fen()];

  for (let ply = 1; ply <= MAX_PLIES; ply += 1) {
    if (chess.isGameOver()) {
      break;
    }
    const assisted = rng() < assistRate;
    const depth = assisted ? GEN_STRONG_DEPTH : GEN_WEAK_DEPTH;
    const { bestMoveUci } = await engine.analyzePosition(chess.fen(), depth);
    if (bestMoveUci === '') {
      break;
    }
    try {
      chess.move({
        from: bestMoveUci.slice(0, 2),
        to: bestMoveUci.slice(2, 4),
        ...(bestMoveUci.length > 4 ? { promotion: bestMoveUci[4] } : {}),
      });
    } catch {
      break; // engine qonuniy bo'lmagan yurish qaytardi — o'yinni to'xtatamiz
    }
    moves.push({ ply, uci: bestMoveUci });
    fens.push(chess.fen());
  }
  return { moves, fens };
}

/** Deterministik RNG — takroriy ishga tushirishda natija qayta chiqarilsin. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function scoreGame(
  engine: StockfishUciAdapter,
  game: GeneratedGame,
  isWhite: boolean,
): Promise<number | null> {
  const evals: (PositionEval | null)[] = [];
  for (const fen of game.fens) {
    try {
      evals.push(await engine.analyzePosition(fen, ANALYSIS_DEPTH));
    } catch {
      evals.push(null);
    }
  }
  // PRODUCTION KOD YO'LI — analysis.processor ham aynan shuni chaqiradi.
  const result = engineCorrelation(
    buildObservations(game.moves, isWhite, evals, OPENING_PLIES_EXCLUDED),
  );
  return result === null ? null : result.strength;
}

function pct(x: number): string {
  return `${(100 * x).toFixed(0)}%`;
}

async function main(): Promise<void> {
  const path = process.env.STOCKFISH_PATH;
  if (path === undefined || path.trim() === '') {
    console.error('STOCKFISH_PATH berilmagan — kalibrlash mumkin emas.');
    process.exit(2);
  }

  // Adapter lazy: birinchi `analyzePosition` da process ko`tariladi.
  const engine = new StockfishUciAdapter(path);
  console.log(`Engine: ${engine.name}`);
  console.log(
    `Tahlil chuqurligi: ${String(ANALYSIS_DEPTH)} · chegara: ${THRESHOLD.toFixed(2)} · ` +
      `har daraja uchun ${String(GAMES_PER_RATE)} o'yin · ${String(MAX_PLIES)} ply\n`,
  );

  const rows: { rate: number; scores: number[] }[] = [];
  try {
    for (const rate of ASSIST_RATES) {
      const scores: number[] = [];
      for (let i = 0; i < GAMES_PER_RATE; i += 1) {
        // Urug' darajaga VA o'yin raqamiga bog'liq — takrorlanadigan.
        const rng = mulberry32(Math.round(rate * 1000) * 100 + i);
        const game = await generateGame(engine, rate, rng);
        // Oq tomon baholanadi (ikkala tomon ham bir xil siyosat bilan
        // o'ynaydi, ya'ni tomon tanlash natijaga ta'sir qilmaydi).
        const score = await scoreGame(engine, game, true);
        if (score !== null) {
          scores.push(score);
        }
        console.log(
          `  yordam=${pct(rate)} o'yin ${String(i + 1)}/${String(GAMES_PER_RATE)}: ` +
            `${String(game.moves.length)} ply, skor=${score === null ? 'yo`q' : score.toFixed(3)}`,
        );
      }
      rows.push({ rate, scores });
    }
  } finally {
    await engine.dispose();
  }

  console.log('\n=== NATIJA ===\n');
  console.log("yordam |  o'yin | o'rtacha skor | chegaradan oshgan");
  console.log('-------+--------+---------------+------------------');
  for (const { rate, scores } of rows) {
    const n = scores.length;
    const avg = n === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / n;
    const flagged = scores.filter((s) => s >= THRESHOLD).length;
    console.log(
      `${pct(rate).padStart(6)} | ${String(n).padStart(6)} | ${avg.toFixed(3).padStart(13)} | ` +
        `${String(flagged)}/${String(n)}`,
    );
  }

  console.log(`
IZOH — bu raqamlarni qanday O'QISH kerak:

  * "yordam" — o'yinchi yurishlarining qancha ulushi dvigateldan olingan.
  * Yuqoridagi qatorlar SEZUVCHANLIKNI ko'rsatadi: dvigatel yordami
    qanchalik kuchli bo'lsa, detektor uni shunchalik ishonchli ushlaydi.
  * yordam=0% qatori NAZORAT: u zaif dvigatel, HALOL ODAM EMAS. Uni
    yolg'on-pozitiv darajasi deb o'qish XATO.

  YOLG'ON-POZITIV DARAJASI HALI O'LCHANMAGAN. Uning uchun haqiqiy
  odamlar o'ynagan, chit bo'lmagani ishonchli bilingan o'yinlar to'plami
  kerak. Loyihada bunday ma'lumot yo'q va uni to'qib bo'lmaydi.
  Ayniqsa muhim holat — KUCHLI odam: u dvigatelga tabiiy ravishda
  yuqori mos keladi (docs/08 §2.1: GM tinch pozitsiyada 60-70% T1).
`);
}

void main().catch((e: unknown) => {
  console.error(`Kalibrlash yiqildi: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
