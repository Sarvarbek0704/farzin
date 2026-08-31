import fc from 'fast-check';

import { maximumWeightMatching, type WeightedEdge } from './blossom';

/**
 * Blossom (BigInt maximum weight matching) testlari.
 *
 * ASOSIY ISHONCH MANBAI — brute-force oracle (docs/05-pairing-engine.md §8.5):
 * kichik graflarda (n ≤ 8) BARCHA matchinglar to'liq sanab chiqiladi va
 * og'irliklar yig'indisi solishtiriladi. Og'irliklar orasida ATAYIN juda
 * katta (leksikografik daraja masshtabidagi, ~200 bit) qiymatlar ham bor —
 * ADR-0007 dagi "53-bit mantissa" tuzog'ining aynan o'zi shu yerda sinaladi.
 */

/** Deterministik PRNG — faqat TEST tarafida (engine'da tasodif taqiqlangan). */
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

/** Tasodifiy graf: har juftlik `density`% ehtimol bilan qirra. */
function randomGraph(
  n: number,
  density: number,
  rng: () => number,
  hugeWeights: boolean,
): WeightedEdge[] {
  const edges: WeightedEdge[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (rng() * 100 >= density) {
        continue;
      }
      let weight = BigInt(Math.floor(rng() * 1_000_000));
      if (hugeWeights && rng() < 0.5) {
        // Leksikografik daraja masshtabi: past qismlar yuqori qism ustunligini
        // buzmasligi kerak (double bo'lsa jimgina buzilardi).
        weight = (weight << 200n) + BigInt(Math.floor(rng() * 1_000_000));
      }
      edges.push({ u: i, v: j, weight });
    }
  }
  return edges;
}

/** Brute-force: barcha matchinglar orasidan maksimal og'irlik yig'indisi. */
function bruteForceBestWeight(n: number, edges: readonly WeightedEdge[]): bigint {
  const weightOf = new Map<number, bigint>();
  for (const e of edges) {
    weightOf.set(e.u * 64 + e.v, e.weight);
  }
  const used = new Array<boolean>(n).fill(false);

  function go(start: number): bigint {
    let first = -1;
    for (let i = start; i < n; i += 1) {
      if (!used[i]) {
        first = i;
        break;
      }
    }
    if (first === -1) {
      return 0n;
    }
    used[first] = true;
    // Variant 1: first juftliksiz qoladi.
    let best = go(first + 1);
    // Variant 2: first biror j bilan juftlashadi.
    for (let j = first + 1; j < n; j += 1) {
      if (used[j]) {
        continue;
      }
      const w = weightOf.get(first * 64 + j);
      if (w === undefined) {
        continue;
      }
      used[j] = true;
      const candidate = w + go(first + 1);
      if (candidate > best) {
        best = candidate;
      }
      used[j] = false;
    }
    used[first] = false;
    return best;
  }

  return go(0);
}

function matchingWeight(mate: readonly number[], edges: readonly WeightedEdge[]): bigint {
  const weightOf = new Map<number, bigint>();
  for (const e of edges) {
    const key = e.u < e.v ? e.u * 64 + e.v : e.v * 64 + e.u;
    weightOf.set(key, e.weight);
  }
  let total = 0n;
  for (let v = 0; v < mate.length; v += 1) {
    const m = mate[v];
    if (m !== undefined && m > v) {
      const w = weightOf.get(v * 64 + m);
      expect(w).toBeDefined(); // matching faqat mavjud qirralardan iborat
      total += w ?? 0n;
    }
  }
  return total;
}

describe('maximumWeightMatching (BigInt blossom)', () => {
  it("chekka holatlar: bo'sh graf, yakka tugun, bitta qirra", () => {
    expect(maximumWeightMatching(0, [])).toEqual([]);
    expect(maximumWeightMatching(1, [])).toEqual([-1]);
    expect(maximumWeightMatching(3, [{ u: 0, v: 2, weight: 5n }])).toEqual([2, -1, 0]);
  });

  it('yaroqsiz kirish rad etiladi', () => {
    expect(() => maximumWeightMatching(2, [{ u: 0, v: 0, weight: 1n }])).toThrow();
    expect(() => maximumWeightMatching(2, [{ u: 0, v: 5, weight: 1n }])).toThrow();
    expect(() => maximumWeightMatching(2, [{ u: 0, v: 1, weight: -1n }])).toThrow();
  });

  it("uchburchak: eng og'ir qirra tanlanadi", () => {
    const mate = maximumWeightMatching(3, [
      { u: 0, v: 1, weight: 10n },
      { u: 1, v: 2, weight: 11n },
      { u: 0, v: 2, weight: 5n },
    ]);
    expect(mate).toEqual([-1, 2, 1]);
  });

  it("blossom holati: toq sikl orqali almashtirish to'g'ri ishlaydi", () => {
    // Klassik 5-sikl + dum: sof greedy adashadi, blossom to'g'ri topadi.
    const edges: WeightedEdge[] = [
      { u: 0, v: 1, weight: 8n },
      { u: 1, v: 2, weight: 9n },
      { u: 2, v: 3, weight: 8n },
      { u: 3, v: 4, weight: 9n },
      { u: 4, v: 0, weight: 8n },
      { u: 4, v: 5, weight: 6n },
    ];
    const mate = maximumWeightMatching(6, edges);
    expect(matchingWeight(mate, edges)).toBe(bruteForceBestWeight(6, edges));
  });

  it("ORACLE: n ≤ 8 tasodifiy graflarda brute-force bilan og'irlik teng (2000 run)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 10, max: 100 }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.boolean(),
        (n, density, seed, huge) => {
          const rng = mulberry32(seed);
          const edges = randomGraph(n, density, rng, huge);
          const mate = maximumWeightMatching(n, edges);
          // Yaroqlilik: simmetrik va faqat mavjud qirralar.
          for (let v = 0; v < n; v += 1) {
            const m = mate[v];
            if (m !== undefined && m !== -1) {
              expect(mate[m]).toBe(v);
            }
          }
          expect(matchingWeight(mate, edges)).toBe(bruteForceBestWeight(n, edges));
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("bir xil og'irliklar (1n) → maksimal kardinallik: to'liq grafda juft n/2 juftlik", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (half) => {
        const n = 2 * half;
        const edges: WeightedEdge[] = [];
        for (let i = 0; i < n; i += 1) {
          for (let j = i + 1; j < n; j += 1) {
            edges.push({ u: i, v: j, weight: 1n });
          }
        }
        const mate = maximumWeightMatching(n, edges);
        expect(mate.every((m) => m !== -1)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it('DETERMINIZM: bir xil kirish → bir xil natija', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), (seed) => {
        const rng = mulberry32(seed);
        const edges = randomGraph(8, 60, rng, true);
        const a = maximumWeightMatching(8, edges);
        const b = maximumWeightMatching(8, edges);
        expect(a).toEqual(b);
      }),
      { numRuns: 200 },
    );
  });
});
