import fc from 'fast-check';

import {
  ByeType,
  Color,
  FloatDirection,
  PairingImpossibleError,
  type PairingRequest,
  type PairingResult,
  type PlayerId,
  type RoundId,
} from './pairing.types';
import { SwissDutchEngine } from './swiss-dutch.engine';

/**
 * Swiss (FIDE Dutch) — PROPERTY invariantlar (docs/05-pairing-engine.md §8.2).
 *
 * Har run TO'LIQ turnir simulyatsiyasi: 4–40 o'yinchi, 1–9 tur, turlar orasida
 * tasodifiy natijalar (deterministik PRNG — faqat TEST tarafida), dvigatel har
 * turni O'ZINING oldingi chiqishidan qurilgan tarix bilan juftlashtiradi.
 *
 * PairingImpossibleError — YAROQLI yakun (masalan, N=4 va 5-tur: barcha
 * juftliklar tugagan); bunday runda simulyatsiya to'xtaydi, invariant
 * buzilishi hisoblanmaydi.
 */

const engine = new SwissDutchEngine();

/** Deterministik PRNG — faqat test tarafida (engine'da tasodif TAQIQLANGAN). */
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
  points: number;
  readonly opponents: Set<PlayerId>;
  readonly colorHistory: Color[];
  readonly floatHistory: FloatDirection[];
  hasReceivedBye: boolean;
  readonly joinedAtRound: number;
  /** Shu turdan boshlab chiqib ketgan hisoblanadi (Infinity — hech qachon). */
  readonly withdrawnFromRound: number;
}

interface SimConfig {
  readonly n: number;
  readonly rounds: number;
  readonly seed: number;
  readonly withLatecomer: boolean;
  readonly withWithdrawal: boolean;
}

function createPlayers(cfg: SimConfig): SimPlayer[] {
  return Array.from({ length: cfg.n }, (_, i) => ({
    id: `S${String(i + 1)}` as PlayerId,
    pairingNumber: i + 1,
    points: 0,
    opponents: new Set<PlayerId>(),
    colorHistory: [],
    floatHistory: [],
    hasReceivedBye: false,
    // Bitta kech qo'shiluvchi (oxirgi TPN) va bitta chiquvchi (o'rtadagi TPN).
    joinedAtRound: cfg.withLatecomer && i === cfg.n - 1 && cfg.rounds >= 2 ? 2 : 1,
    withdrawnFromRound:
      cfg.withWithdrawal && i === 1 && cfg.rounds >= 3 ? Math.ceil(cfg.rounds / 2) + 1 : Infinity,
  }));
}

function toRequest(players: readonly SimPlayer[], round: number, rounds: number): PairingRequest {
  return {
    roundId: `sim-r${String(round)}` as RoundId,
    roundNumber: round,
    totalRounds: rounds,
    players: players.map((p) => ({
      playerId: p.id,
      pairingNumber: p.pairingNumber,
      rating: 1500,
      points: p.points,
      opponentIds: new Set(p.opponents),
      colorHistory: [...p.colorHistory],
      floatHistory: [...p.floatHistory],
      hasReceivedBye: p.hasReceivedBye,
      isWithdrawn: p.withdrawnFromRound <= round,
      joinedAtRound: p.joinedAtRound,
    })),
  };
}

function isTopscorer(p: SimPlayer, round: number, rounds: number): boolean {
  return round === rounds && Math.round(p.points * 2) > round - 1;
}

/** Natijalarni qo'llash: ochkolar, ranglar, floatlar (Article 1.4 semantikasi). */
function applyResults(
  players: Map<PlayerId, SimPlayer>,
  result: PairingResult,
  rng: () => number,
): void {
  const floatOf = new Map<PlayerId, FloatDirection>();

  for (const pairing of result.pairings) {
    const white = players.get(pairing.whitePlayerId);
    const black = players.get(pairing.blackPlayerId);
    if (white === undefined || black === undefined) {
      throw new Error('sim: noma\'lum o\'yinchi juftlikda');
    }
    // Float — juftlashtirish paytidagi ochkolar bo'yicha (1.4.2).
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

    const r = rng();
    if (r < 0.4) {
      white.points += 1;
    } else if (r < 0.8) {
      black.points += 1;
    } else {
      white.points += 0.5;
      black.points += 0.5;
    }
  }

  for (const bye of result.byes) {
    const p = players.get(bye.playerId);
    if (p === undefined) {
      throw new Error('sim: noma\'lum o\'yinchi bye\'da');
    }
    p.points += bye.points;
    p.hasReceivedBye = true;
    floatOf.set(p.id, FloatDirection.Down); // 1.4.3
  }

  for (const p of players.values()) {
    p.floatHistory.push(floatOf.get(p.id) ?? FloatDirection.None);
  }
}

/**
 * Bir turnirni simulyatsiya qiladi; har muvaffaqiyatli turda `check`
 * chaqiriladi. PairingImpossibleError — simulyatsiya yakuni (yaroqli holat).
 */
async function simulate(
  cfg: SimConfig,
  check: (
    round: number,
    result: PairingResult,
    active: readonly SimPlayer[],
    request: PairingRequest,
  ) => void | Promise<void>,
): Promise<void> {
  const rng = mulberry32(cfg.seed);
  const list = createPlayers(cfg);
  const byId = new Map(list.map((p) => [p.id, p]));

  for (let round = 1; round <= cfg.rounds; round += 1) {
    const request = toRequest(list, round, cfg.rounds);
    let result: PairingResult;
    try {
      result = await engine.pair(request);
    } catch (error) {
      if (error instanceof PairingImpossibleError) {
        return; // Kutilgan yakun — invariantlar buzilmagan.
      }
      throw error;
    }
    const active = list.filter(
      (p) => p.joinedAtRound <= round && p.withdrawnFromRound > round,
    );
    await check(round, result, active, request);
    applyResults(byId, result, rng);
  }
}

const tournamentArb = fc.record({
  n: fc.integer({ min: 4, max: 40 }),
  rounds: fc.integer({ min: 1, max: 9 }),
  seed: fc.integer({ min: 0, max: 0x7fffffff }),
  withLatecomer: fc.boolean(),
  withWithdrawal: fc.boolean(),
});

describe('SwissDutchEngine — invariantlar (property)', () => {
  it(
    'P1–P5: takror juftlik YO\'Q (C1), qamrov aniq, PAB yagona va haqli (C2), ' +
      'rang chegaralari (|CD| ≤ 2, 3 ketma-ket emas — topscorer istisnosi) — 1000 run',
    async () => {
      await fc.assert(
        fc.asyncProperty(tournamentArb, async (cfg) => {
          await simulate(cfg, (round, result, active) => {
            const activeById = new Map(active.map((p) => [p.id, p]));

            // Qamrov: har aktiv o'yinchi aynan bir marta; taxtalar 1..k.
            const seen = new Set<PlayerId>();
            result.pairings.forEach((pairing, index) => {
              expect(pairing.boardNumber).toBe(index + 1);
              for (const id of [pairing.whitePlayerId, pairing.blackPlayerId]) {
                expect(activeById.has(id)).toBe(true);
                expect(seen.has(id)).toBe(false);
                seen.add(id);
              }
            });
            for (const bye of result.byes) {
              expect(seen.has(bye.playerId)).toBe(false);
              seen.add(bye.playerId);
            }
            expect(seen.size).toBe(active.length);

            // Toq → aynan bitta PAB; juft → bye yo'q.
            expect(result.byes.length).toBe(active.length % 2);
            for (const bye of result.byes) {
              expect(bye.type).toBe(ByeType.PairingAllocated);
              expect(bye.points).toBe(1);
              const p = activeById.get(bye.playerId);
              // C2: PAB oldin bye/o'ynamasdan g'alaba olganga berilmaydi.
              expect(p?.hasReceivedBye).toBe(false);
            }

            // C1 + rang chegaralari.
            for (const pairing of result.pairings) {
              const white = activeById.get(pairing.whitePlayerId);
              const black = activeById.get(pairing.blackPlayerId);
              if (white === undefined || black === undefined) {
                throw new Error('sim: aktiv bo\'lmagan o\'yinchi juftlikda');
              }
              expect(white.opponents.has(black.id)).toBe(false);
              expect(black.opponents.has(white.id)).toBe(false);

              const anyTop =
                isTopscorer(white, round, cfg.rounds) || isTopscorer(black, round, cfg.rounds);
              for (const [p, got] of [
                [white, Color.White],
                [black, Color.Black],
              ] as const) {
                const cd = p.colorHistory.reduce(
                  (acc, c) => acc + (c === Color.White ? 1 : -1),
                  0,
                );
                const newCd = cd + (got === Color.White ? 1 : -1);
                const h = p.colorHistory;
                const threeRow =
                  h.length >= 2 && h[h.length - 1] === got && h[h.length - 2] === got;
                if (Math.abs(newCd) > 2 || threeRow) {
                  // Istisno FAQAT topscorer ishtirokidagi juftlikda (C10/C11).
                  expect(anyTop).toBe(true);
                }
              }
            }
          });
        }),
        { numRuns: 1000 },
      );
    },
    600_000,
  );

  it(
    'P6: DETERMINIZM — bir xil kirish → bir xil chiqish (200 run, har turda ikki chaqiruv)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            n: fc.integer({ min: 4, max: 30 }),
            rounds: fc.integer({ min: 1, max: 5 }),
            seed: fc.integer({ min: 0, max: 0x7fffffff }),
            withLatecomer: fc.boolean(),
            withWithdrawal: fc.boolean(),
          }),
          async (cfg) => {
            await simulate(cfg, async (_round, result, _active, request) => {
              const again = await engine.pair(request);
              expect(again.pairings).toEqual(result.pairings);
              expect(again.byes).toEqual(result.byes);
              expect(again.engineVersion).toBe(result.engineVersion);
              // durationMs dan tashqari diagnostika ham deterministik.
              expect(again.diagnostics?.scoreGroupCount).toBe(
                result.diagnostics?.scoreGroupCount,
              );
              expect(again.diagnostics?.floatCount).toBe(result.diagnostics?.floatCount);
              expect(again.diagnostics?.relaxedCriteria).toEqual(
                result.diagnostics?.relaxedCriteria,
              );
            });
          },
        ),
        { numRuns: 200 },
      );
    },
    600_000,
  );

  it(
    "P7: kirish tartibiga befarqlik — o'yinchilar aralashtirilsa ham natija bir xil (200 run)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            n: fc.integer({ min: 4, max: 30 }),
            rounds: fc.integer({ min: 1, max: 5 }),
            seed: fc.integer({ min: 0, max: 0x7fffffff }),
            withLatecomer: fc.boolean(),
            withWithdrawal: fc.boolean(),
          }),
          async (cfg) => {
            await simulate(cfg, async (_round, result, _active, request) => {
              // Fisher–Yates, deterministik urug' bilan (test tarafида).
              const rng = mulberry32(cfg.seed ^ 0x5f3759df);
              const shuffled = [...request.players];
              for (let i = shuffled.length - 1; i > 0; i -= 1) {
                const j = Math.floor(rng() * (i + 1));
                const tmp = shuffled[i];
                const other = shuffled[j];
                if (tmp !== undefined && other !== undefined) {
                  shuffled[i] = other;
                  shuffled[j] = tmp;
                }
              }
              const again = await engine.pair({ ...request, players: shuffled });
              expect(again.pairings).toEqual(result.pairings);
              expect(again.byes).toEqual(result.byes);
            });
          },
        ),
        { numRuns: 200 },
      );
    },
    600_000,
  );
});
