import { performance } from 'node:perf_hooks';

import {
  Color,
  FloatDirection,
  PairingImpossibleError,
  type PairingRequest,
  type PairingResult,
  type PlayerId,
  type RoundId,
} from '../core/pairing/pairing.types';
import { SwissDutchEngine } from '../core/pairing/swiss-dutch.engine';

/**
 * JUFTLASHTIRISH TEZLIGINI O'LCHASH — docs/AUDIT.md dagi ikki ochiq band:
 *
 *   "100 o'yinchida p95 < 10 s — o'lchov yo'q"
 *   "500 o'yinchida tugaydi, vaqt hujjatlangan — o'lchanmagan"
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NIMA O'LCHANADI VA NIMA O'LCHANMAYDI
 *
 *  O'lchanadigan narsa — SOF YADRO: `SwissDutchEngine.pair()` chaqiruvi
 *  (FIDE Dutch + blossom matching + C1-C3 qayta tekshiruv). Bu SLO'ning
 *  eng og'ir qismi, chunki qolgan yo'l (HTTP, DB o'qish/yozish) oddiy
 *  CRUD va u alohida o'lchanadi.
 *
 *  Bu PRODUCTION QOBIG'I EMAS: tarmoq, DB, navbat yo'q. Ya'ni natija
 *  "SLO bajarildi" degan da'vo emas — "yadro shuncha oladi" degan
 *  quyi chegara. SLO'ning to'liq o'lchovi klaster bilan (17-band).
 *
 *  Natijalar deterministik: urug'langan PRNG, engine'da tasodif yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Ishga tushirish:  node dist/tools/pairing-benchmark.js
 */

const SIZES = [20, 50, 100, 200, 500];
const ROUNDS = 9;
const SEEDS_PER_SIZE = Number(process.env.BENCH_SEEDS ?? '5');

/** Deterministik PRNG — natija takrorlanadigan bo'lsin. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimPlayer {
  readonly id: PlayerId;
  readonly pairingNumber: number;
  readonly rating: number;
  points: number;
  readonly opponents: Set<PlayerId>;
  readonly colorHistory: Color[];
  readonly floatHistory: FloatDirection[];
  hasReceivedBye: boolean;
}

function createPlayers(n: number, rng: () => number): SimPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `B${String(i + 1)}` as PlayerId,
    pairingNumber: i + 1,
    // Reyting tarqalishi realistik: 1200-2600, yuqoriga siyraklashadi.
    rating: 1200 + Math.floor(1400 * rng() * rng()),
    points: 0,
    opponents: new Set<PlayerId>(),
    colorHistory: [],
    floatHistory: [],
    hasReceivedBye: false,
  }));
}

function toRequest(players: readonly SimPlayer[], round: number): PairingRequest {
  return {
    roundId: `bench-r${String(round)}` as RoundId,
    roundNumber: round,
    totalRounds: ROUNDS,
    players: players.map((p) => ({
      playerId: p.id,
      pairingNumber: p.pairingNumber,
      rating: p.rating,
      points: p.points,
      opponentIds: new Set(p.opponents),
      colorHistory: [...p.colorHistory],
      floatHistory: [...p.floatHistory],
      hasReceivedBye: p.hasReceivedBye,
      isWithdrawn: false,
      joinedAtRound: 1,
    })),
  };
}

/** Natijalarni qo'llash — kuchliroq reyting ko'proq yutadi (realistik oqim). */
function applyResults(
  byId: Map<PlayerId, SimPlayer>,
  result: PairingResult,
  rng: () => number,
): void {
  const floatOf = new Map<PlayerId, FloatDirection>();

  for (const pairing of result.pairings) {
    const white = byId.get(pairing.whitePlayerId);
    const black = byId.get(pairing.blackPlayerId);
    if (white === undefined || black === undefined) {
      throw new Error("bench: noma'lum o'yinchi");
    }
    if (white.points > black.points) {
      floatOf.set(white.id, FloatDirection.Down);
      floatOf.set(black.id, FloatDirection.Up);
    } else if (black.points > white.points) {
      floatOf.set(black.id, FloatDirection.Down);
      floatOf.set(white.id, FloatDirection.Up);
    }

    white.opponents.add(black.id);
    black.opponents.add(white.id);
    white.colorHistory.push(Color.White);
    black.colorHistory.push(Color.Black);

    // Elo kutilmasi bo'yicha natija — jadval realistik shakllanadi.
    const expected = 1 / (1 + Math.pow(10, (black.rating - white.rating) / 400));
    const r = rng();
    if (r < expected * 0.85) {
      white.points += 1;
    } else if (r < expected * 0.85 + (1 - expected) * 0.85) {
      black.points += 1;
    } else {
      white.points += 0.5;
      black.points += 0.5;
    }
  }

  for (const bye of result.byes) {
    const p = byId.get(bye.playerId);
    if (p === undefined) {
      throw new Error("bench: noma'lum o'yinchi bye'da");
    }
    p.points += bye.points;
    p.hasReceivedBye = true;
    floatOf.set(p.id, FloatDirection.Down);
  }

  for (const p of byId.values()) {
    p.floatHistory.push(floatOf.get(p.id) ?? FloatDirection.None);
  }
}

function quantile(sortedMs: readonly number[], q: number): number {
  if (sortedMs.length === 0) {
    return NaN;
  }
  const idx = Math.min(sortedMs.length - 1, Math.ceil(q * sortedMs.length) - 1);
  return sortedMs[Math.max(0, idx)] ?? NaN;
}

interface SizeResult {
  /** Barcha pair() chaqiruvlari (saralangan). */
  readonly all: number[];
  /** Tur raqami → o'sha turdagi namunalar (saralangan). */
  readonly byRound: Map<number, number[]>;
}

async function benchSize(engine: SwissDutchEngine, n: number): Promise<SizeResult> {
  const samples: number[] = [];
  const byRound = new Map<number, number[]>();
  for (let seed = 1; seed <= SEEDS_PER_SIZE; seed += 1) {
    const rng = mulberry32(n * 1000 + seed);
    const players = createPlayers(n, rng);
    const byId = new Map(players.map((p) => [p.id, p]));

    for (let round = 1; round <= ROUNDS; round += 1) {
      const request = toRequest(players, round);
      const t0 = performance.now();
      let result: PairingResult;
      try {
        result = await engine.pair(request);
      } catch (e) {
        if (e instanceof PairingImpossibleError) {
          break; // kichik seksiyada kech turlarda yaroqli yakun
        }
        throw e;
      }
      const ms = performance.now() - t0;
      samples.push(ms);
      const bucket = byRound.get(round);
      if (bucket === undefined) {
        byRound.set(round, [ms]);
      } else {
        bucket.push(ms);
      }
      applyResults(byId, result, rng);
    }
  }
  for (const bucket of byRound.values()) {
    bucket.sort((a, b) => a - b);
  }
  return { all: samples.sort((a, b) => a - b), byRound };
}

async function main(): Promise<void> {
  const engine = new SwissDutchEngine();

  console.log(
    `Swiss juftlashtirish benchmark'i — ${String(ROUNDS)} tur x ${String(SEEDS_PER_SIZE)} urug'/hajm\n` +
      `Node ${process.version} · ${process.arch}\n`,
  );
  console.log("o'yinchi | namuna |   min |  median |    p95 |    max | 9 tur jami (median)");
  console.log('---------+--------+-------+---------+--------+--------+---------------------');

  let largest: SizeResult | null = null;
  for (const n of SIZES) {
    const r = await benchSize(engine, n);
    const s = r.all;
    const median = quantile(s, 0.5);
    console.log(
      `${String(n).padStart(8)} | ${String(s.length).padStart(6)} | ${fmt(s[0] ?? NaN)} | ${fmt(median).padStart(7)} | ${fmt(quantile(s, 0.95)).padStart(6)} | ${fmt(s[s.length - 1] ?? NaN).padStart(6)} | ~${fmt(median * ROUNDS)}`,
    );
    if (n === SIZES[SIZES.length - 1]) {
      largest = r;
    }
  }

  // Eng katta hajm uchun TUR-MA-TUR taqsimot: vaqt qayerda ketadi.
  // Kech turlar og'irroq — cheklovlar (takror, rang, float) to'planadi.
  if (largest !== null) {
    console.log(`
Tur bo'yicha (n = ${String(SIZES[SIZES.length - 1] ?? 0)}):`);
    console.log('  tur | namuna |  median |     max');
    console.log('  ----+--------+---------+--------');
    for (const round of [...largest.byRound.keys()].sort((a, b) => a - b)) {
      const b = largest.byRound.get(round) ?? [];
      console.log(
        `  ${String(round).padStart(3)} | ${String(b.length).padStart(6)} | ${fmt(quantile(b, 0.5)).padStart(7)} | ${fmt(b[b.length - 1] ?? NaN).padStart(7)}`,
      );
    }
  }

  console.log(`
IZOH:
  * O'lchov SOF YADRO (SwissDutchEngine.pair) — HTTP/DB kirmaydi.
    Ya'ni bu SLO'ning "bajarildi" isboti emas, yadroning quyi chegarasi.
  * Har pair() dan keyin C1-C3 absolyut kriteriyalar QAYTA tekshiriladi —
    bu vaqt o'lchovga KIRADI (production'da ham shunday).
  * To'liq SLO o'lchovi (k6, klaster) — AUDIT 17-band, hali ochiq.
`);
}

function fmt(ms: number): string {
  if (Number.isNaN(ms)) {
    return '    —';
  }
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(1)}ms`;
}

void main().catch((e: unknown) => {
  console.error(`Benchmark yiqildi: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
