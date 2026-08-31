/**
 * Maksimal og'irlikdagi matching — umumiy (general) graf, Edmonds blossom.
 *
 * ADR-0007 talabi: og'irliklar `BigInt` (leksikografik kriteriylar 53-bit
 * mantissaga sig'maydi), graf umumiy (S1/S2 exchange bipartitlikni buzadi),
 * natija OPTIMAL bo'lishi kafolatlanadi.
 *
 * Implementatsiya — Joris van Rantwijk'ning ma'lum `mwmatching.py`
 * (http://jorisvr.nl/article/maximum-matching, Galil 1986 tavsifi bo'yicha
 * O(V³)) referens kodining BigInt'ga moslashtirilgan porti. Tayyor npm
 * paketlar (`blossom`, `edmonds-blossom`) `number` bilan ishlagani uchun
 * YAROQSIZ (ADR-0007).
 *
 * Butunlik sharti: kirish og'irliklari ichkarida 2 ga ko'paytiriladi —
 * shunda barcha dual o'zgaruvchilar butun bo'lib qoladi (Galil: butun
 * og'irliklarda optimal duallar yarim-butun; ×2 → butun). Har ehtimolga
 * qarshi delta3 juftligi runtime'da tekshiriladi (buzilsa — ichki xato,
 * jimgina noto'g'ri natijadan ko'ra portlagan yaxshi).
 *
 * DETERMINIZM: hech qanday tasodifiylik yo'q; bir xil `vertexCount` va bir
 * xil TARTIBDAGI `edges` → bir xil natija (docs/05-pairing-engine.md §5.4).
 *
 * Tekshiruv: blossom.spec.ts — kichik graflarda (n ≤ 8) BARCHA matchinglarni
 * to'liq sanab chiqadigan brute-force oracle bilan og'irlik yig'indisi
 * taqqoslanadi (fast-check, minglab tasodifiy graf).
 */

export interface WeightedEdge {
  /** Tugun indeksi, 0-asosli. */
  readonly u: number;
  readonly v: number;
  /** Og'irlik — manfiy bo'lmagan BigInt (ADR-0007). */
  readonly weight: bigint;
}

/** noUncheckedIndexedAccess ostida massiv o'qishning qat'iy varianti. */
function req<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`blossom ichki xato: ${what} aniqlanmadi`);
  }
  return value;
}

/** Python'ning manfiy indeksiga ekvivalent modul aylantirish. */
function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}

/**
 * Maksimal og'irlikdagi matching (kardinallik EMAS — lekin barcha
 * og'irliklar musbat bo'lsa, maksimal og'irlik maksimal kardinallikni
 * o'z ichiga oladi, chunki qo'shimcha qirra doim foyda).
 *
 * @returns `mate[v]` — v bilan juftlashgan tugun indeksi yoki `-1`.
 */
export function maximumWeightMatching(
  vertexCount: number,
  edges: readonly WeightedEdge[],
): number[] {
  const nvertex = vertexCount;
  const nedge = edges.length;
  if (nvertex === 0) {
    return [];
  }

  // Kirish validatsiyasi — noto'g'ri chaqiruv jimgina o'tmasin.
  for (const e of edges) {
    if (
      !Number.isInteger(e.u) ||
      !Number.isInteger(e.v) ||
      e.u < 0 ||
      e.v < 0 ||
      e.u >= nvertex ||
      e.v >= nvertex ||
      e.u === e.v
    ) {
      throw new Error(`blossom: yaroqsiz qirra (${String(e.u)}, ${String(e.v)})`);
    }
    if (e.weight < 0n) {
      throw new Error("blossom: manfiy og'irlik qo'llab-quvvatlanmaydi");
    }
  }

  if (nedge === 0) {
    return new Array<number>(nvertex).fill(-1);
  }

  // Butun duallar uchun og'irliklar ×2 (fayl sarlavhasidagi izoh).
  const edgeU = new Array<number>(nedge);
  const edgeV = new Array<number>(nedge);
  const edgeW = new Array<bigint>(nedge);
  let maxweight = 0n;
  for (let k = 0; k < nedge; k += 1) {
    const e = req(edges[k], `edge[${String(k)}]`);
    edgeU[k] = e.u;
    edgeV[k] = e.v;
    const w2 = e.weight * 2n;
    edgeW[k] = w2;
    if (w2 > maxweight) {
      maxweight = w2;
    }
  }

  // endpoint[p]: p = 2k yoki 2k+1 — qirra k ning ikki uchi.
  const endpoint = new Array<number>(2 * nedge);
  for (let k = 0; k < nedge; k += 1) {
    endpoint[2 * k] = req(edgeU[k], 'edgeU');
    endpoint[2 * k + 1] = req(edgeV[k], 'edgeV');
  }

  // neighbend[v] — v ga tutash qirralarning UZOQ uchlari ro'yxati.
  const neighbend: number[][] = Array.from({ length: nvertex }, () => []);
  for (let k = 0; k < nedge; k += 1) {
    req(neighbend[req(edgeU[k], 'edgeU')], 'neighbend[u]').push(2 * k + 1);
    req(neighbend[req(edgeV[k], 'edgeV')], 'neighbend[v]').push(2 * k);
  }

  const mate = new Array<number>(nvertex).fill(-1);
  const label = new Array<number>(2 * nvertex).fill(0);
  const labelend = new Array<number>(2 * nvertex).fill(-1);
  const inblossom = Array.from({ length: nvertex }, (_, i) => i);
  const blossomparent = new Array<number>(2 * nvertex).fill(-1);
  const blossomchilds = new Array<number[] | null>(2 * nvertex).fill(null);
  const blossombase = Array.from({ length: 2 * nvertex }, (_, i) => (i < nvertex ? i : -1));
  const blossomendps = new Array<number[] | null>(2 * nvertex).fill(null);
  const bestedge = new Array<number>(2 * nvertex).fill(-1);
  const blossombestedges = new Array<number[] | null>(2 * nvertex).fill(null);
  const unusedblossoms: number[] = [];
  for (let b = nvertex; b < 2 * nvertex; b += 1) {
    unusedblossoms.push(b);
  }
  const dualvar = new Array<bigint>(2 * nvertex);
  for (let i = 0; i < 2 * nvertex; i += 1) {
    dualvar[i] = i < nvertex ? maxweight : 0n;
  }
  const allowedge = new Array<boolean>(nedge).fill(false);
  let queue: number[] = [];

  const slack = (k: number): bigint =>
    req(dualvar[req(edgeU[k], 'edgeU')], 'dual-u') +
    req(dualvar[req(edgeV[k], 'edgeV')], 'dual-v') -
    2n * req(edgeW[k], 'edgeW');

  /** b blossomining barcha barg (haqiqiy) tugunlari. */
  function blossomLeaves(b: number, out: number[] = []): number[] {
    if (b < nvertex) {
      out.push(b);
      return out;
    }
    for (const t of req(blossomchilds[b], 'blossomchilds')) {
      blossomLeaves(t, out);
    }
    return out;
  }

  function assignLabel(w: number, t: number, p: number): void {
    const b = req(inblossom[w], 'inblossom');
    label[w] = t;
    label[b] = t;
    labelend[w] = p;
    labelend[b] = p;
    bestedge[w] = -1;
    bestedge[b] = -1;
    if (t === 1) {
      queue.push(...blossomLeaves(b));
    } else if (t === 2) {
      const base = req(blossombase[b], 'blossombase');
      const mateBase = req(mate[base], 'mate[base]');
      if (mateBase < 0) {
        throw new Error("blossom ichki xato: T-blossom asosining juftligi yo'q");
      }
      assignLabel(req(endpoint[mateBase], 'endpoint'), 1, mateBase ^ 1);
    }
  }

  /** v va w dan orqaga iz qoldirib, umumiy asosni (yoki -1) topadi. */
  function scanBlossom(vStart: number, wStart: number): number {
    let v = vStart;
    let w = wStart;
    const path: number[] = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = req(inblossom[v], 'inblossom[v]');
      if ((req(label[b], 'label') & 4) !== 0) {
        base = req(blossombase[b], 'blossombase');
        break;
      }
      path.push(b);
      label[b] = 5;
      if (req(labelend[b], 'labelend') === -1) {
        v = -1;
      } else {
        v = req(endpoint[req(labelend[b], 'labelend')], 'endpoint');
        b = req(inblossom[v], 'inblossom');
        v = req(endpoint[req(labelend[b], 'labelend')], 'endpoint');
      }
      if (w !== -1) {
        const tmp = v;
        v = w;
        w = tmp;
      }
    }
    for (const b of path) {
      label[b] = 1;
    }
    return base;
  }

  /** base atrofида yangi blossom quradi (qirra k orqali). */
  function addBlossom(base: number, k: number): void {
    let v = req(edgeU[k], 'edgeU');
    let w = req(edgeV[k], 'edgeV');
    const bb = req(inblossom[base], 'inblossom[base]');
    let bv = req(inblossom[v], 'inblossom[v]');
    let bw = req(inblossom[w], 'inblossom[w]');
    const b = unusedblossoms.pop();
    if (b === undefined) {
      throw new Error("blossom ichki xato: bo'sh blossom raqami qolmadi");
    }
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path: number[] = [];
    const endps: number[] = [];
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(req(labelend[bv], 'labelend[bv]'));
      v = req(endpoint[req(labelend[bv], 'labelend[bv]')], 'endpoint');
      bv = req(inblossom[v], 'inblossom');
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(req(labelend[bw], 'labelend[bw]') ^ 1);
      w = req(endpoint[req(labelend[bw], 'labelend[bw]')], 'endpoint');
      bw = req(inblossom[w], 'inblossom');
    }
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    label[b] = 1;
    labelend[b] = req(labelend[bb], 'labelend[bb]');
    dualvar[b] = 0n;
    for (const leaf of blossomLeaves(b)) {
      if (req(label[req(inblossom[leaf], 'inblossom')], 'label') === 2) {
        queue.push(leaf);
      }
      inblossom[leaf] = b;
    }
    // delta3 optimizatsiyasi uchun eng yaxshi qirralarni yig'ish.
    const bestedgeto = new Array<number>(2 * nvertex).fill(-1);
    for (const child of path) {
      let nblists: number[][];
      const childBest = blossombestedges[child] ?? null;
      if (childBest === null) {
        nblists = blossomLeaves(child).map((leaf) =>
          req(neighbend[leaf], 'neighbend').map((p) => Math.floor(p / 2)),
        );
      } else {
        nblists = [childBest];
      }
      for (const nblist of nblists) {
        for (const kk of nblist) {
          let i = req(edgeU[kk], 'edgeU');
          let j = req(edgeV[kk], 'edgeV');
          if (req(inblossom[j], 'inblossom') === b) {
            const tmp = i;
            i = j;
            j = tmp;
          }
          const bj = req(inblossom[j], 'inblossom');
          if (
            bj !== b &&
            req(label[bj], 'label') === 1 &&
            (req(bestedgeto[bj], 'bestedgeto') === -1 ||
              slack(kk) < slack(req(bestedgeto[bj], 'bestedgeto')))
          ) {
            bestedgeto[bj] = kk;
          }
        }
      }
      blossombestedges[child] = null;
      bestedge[child] = -1;
    }
    const collected = bestedgeto.filter((kk) => kk !== -1);
    blossombestedges[b] = collected;
    bestedge[b] = -1;
    for (const kk of collected) {
      if (bestedge[b] === -1 || slack(kk) < slack(req(bestedge[b], 'bestedge'))) {
        bestedge[b] = kk;
      }
    }
  }

  /** b blossomini ochish (endstage — bosqich oxirida yoki delta4 da). */
  function expandBlossom(b: number, endstage: boolean): void {
    const childs = req(blossomchilds[b], 'blossomchilds');
    for (const s of childs) {
      blossomparent[s] = -1;
      if (s < nvertex) {
        inblossom[s] = s;
      } else if (endstage && req(dualvar[s], 'dualvar') === 0n) {
        expandBlossom(s, endstage);
      } else {
        for (const leaf of blossomLeaves(s)) {
          inblossom[leaf] = s;
        }
      }
    }
    if (!endstage && req(label[b], 'label') === 2) {
      const entrychild = req(
        inblossom[req(endpoint[req(labelend[b], 'labelend') ^ 1], 'endpoint')],
        'inblossom',
      );
      const len = childs.length;
      const endps = req(blossomendps[b], 'blossomendps');
      let j = childs.indexOf(entrychild);
      let jstep: number;
      let endptrick: number;
      if ((j & 1) !== 0) {
        j -= len;
        jstep = 1;
        endptrick = 0;
      } else {
        jstep = -1;
        endptrick = 1;
      }
      let p = req(labelend[b], 'labelend');
      while (j !== 0) {
        label[req(endpoint[p ^ 1], 'endpoint')] = 0;
        const ep1 = req(endps[wrap(j - endptrick, len)], 'endps');
        label[req(endpoint[ep1 ^ endptrick ^ 1], 'endpoint')] = 0;
        assignLabel(req(endpoint[p ^ 1], 'endpoint'), 2, p);
        allowedge[Math.floor(ep1 / 2)] = true;
        j += jstep;
        p = req(endps[wrap(j - endptrick, len)], 'endps') ^ endptrick;
        allowedge[Math.floor(p / 2)] = true;
        j += jstep;
      }
      let bv = req(childs[wrap(j, len)], 'childs');
      label[req(endpoint[p ^ 1], 'endpoint')] = 2;
      label[bv] = 2;
      labelend[req(endpoint[p ^ 1], 'endpoint')] = p;
      labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (req(childs[wrap(j, len)], 'childs') !== entrychild) {
        bv = req(childs[wrap(j, len)], 'childs');
        if (req(label[bv], 'label') === 1) {
          j += jstep;
          continue;
        }
        let reachable = -1;
        for (const leaf of blossomLeaves(bv)) {
          if (req(label[leaf], 'label') !== 0) {
            reachable = leaf;
            break;
          }
        }
        if (reachable !== -1) {
          if (req(label[reachable], 'label') !== 2) {
            throw new Error('blossom ichki xato: kutilgan T-tugun emas');
          }
          label[reachable] = 0;
          label[req(endpoint[req(mate[req(blossombase[bv], 'blossombase')], 'mate')], 'endpoint')] =
            0;
          assignLabel(reachable, 2, req(labelend[reachable], 'labelend'));
        }
        j += jstep;
      }
    }
    label[b] = -1;
    labelend[b] = -1;
    blossomchilds[b] = null;
    blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  }

  /** b (S-blossom) ichida v bazaga aylanadigan qilib juftliklarni almashtirish. */
  function augmentBlossom(b: number, v: number): void {
    let t = v;
    while (req(blossomparent[t], 'blossomparent') !== b) {
      t = req(blossomparent[t], 'blossomparent');
    }
    if (t >= nvertex) {
      augmentBlossom(t, v);
    }
    const childs = req(blossomchilds[b], 'blossomchilds');
    const endps = req(blossomendps[b], 'blossomendps');
    const len = childs.length;
    const i = childs.indexOf(t);
    let j = i;
    let jstep: number;
    let endptrick: number;
    if ((i & 1) !== 0) {
      j -= len;
      jstep = 1;
      endptrick = 0;
    } else {
      jstep = -1;
      endptrick = 1;
    }
    while (j !== 0) {
      j += jstep;
      let tt = req(childs[wrap(j, len)], 'childs');
      const p = req(endps[wrap(j - endptrick, len)], 'endps') ^ endptrick;
      if (tt >= nvertex) {
        augmentBlossom(tt, req(endpoint[p], 'endpoint'));
      }
      j += jstep;
      tt = req(childs[wrap(j, len)], 'childs');
      if (tt >= nvertex) {
        augmentBlossom(tt, req(endpoint[p ^ 1], 'endpoint'));
      }
      mate[req(endpoint[p], 'endpoint')] = p ^ 1;
      mate[req(endpoint[p ^ 1], 'endpoint')] = p;
    }
    const rotated = childs.slice(i).concat(childs.slice(0, i));
    const rotatedEndps = endps.slice(i).concat(endps.slice(0, i));
    blossomchilds[b] = rotated;
    blossomendps[b] = rotatedEndps;
    blossombase[b] = req(blossombase[req(rotated[0], 'rotated[0]')], 'blossombase');
    if (req(blossombase[b], 'blossombase') !== v) {
      throw new Error('blossom ichki xato: augmentBlossom asosi mos kelmadi');
    }
  }

  /** k qirrasi orqali almashtirish yo'lini qo'llash. */
  function augmentMatching(k: number): void {
    const startV = req(edgeU[k], 'edgeU');
    const startW = req(edgeV[k], 'edgeV');
    const sides: readonly (readonly [number, number])[] = [
      [startV, 2 * k + 1],
      [startW, 2 * k],
    ];
    for (const [s0, p0] of sides) {
      let s = s0;
      let p = p0;
      for (;;) {
        const bs = req(inblossom[s], 'inblossom');
        if (req(label[bs], 'label') !== 1) {
          throw new Error("blossom ichki xato: augment yo'lida S-blossom emas");
        }
        if (bs >= nvertex) {
          augmentBlossom(bs, s);
        }
        mate[s] = p;
        if (req(labelend[bs], 'labelend') === -1) {
          break;
        }
        const t = req(endpoint[req(labelend[bs], 'labelend')], 'endpoint');
        const bt = req(inblossom[t], 'inblossom');
        if (req(label[bt], 'label') !== 2) {
          throw new Error("blossom ichki xato: augment yo'lida T-blossom emas");
        }
        s = req(endpoint[req(labelend[bt], 'labelend')], 'endpoint');
        const j = req(endpoint[req(labelend[bt], 'labelend') ^ 1], 'endpoint');
        if (bt >= nvertex) {
          augmentBlossom(bt, j);
        }
        mate[j] = req(labelend[bt], 'labelend');
        p = req(labelend[bt], 'labelend') ^ 1;
      }
    }
  }

  // --- Asosiy sikl: har bosqichda bitta almashtirish yo'li qidiriladi ---------
  for (let stage = 0; stage < nvertex; stage += 1) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = nvertex; b < 2 * nvertex; b += 1) {
      blossombestedges[b] = null;
    }
    allowedge.fill(false);
    queue = [];

    for (let v = 0; v < nvertex; v += 1) {
      if (
        req(mate[v], 'mate') === -1 &&
        req(label[req(inblossom[v], 'inblossom')], 'label') === 0
      ) {
        assignLabel(v, 1, -1);
      }
    }

    let augmented = false;
    for (;;) {
      while (queue.length > 0 && !augmented) {
        const v = queue.pop();
        if (v === undefined) {
          break;
        }
        for (const p of req(neighbend[v], 'neighbend')) {
          const k = Math.floor(p / 2);
          const w = req(endpoint[p], 'endpoint');
          if (req(inblossom[v], 'inblossom') === req(inblossom[w], 'inblossom')) {
            continue;
          }
          let kslack = 0n;
          let kslackKnown = false;
          if (!req(allowedge[k], 'allowedge')) {
            kslack = slack(k);
            kslackKnown = true;
            if (kslack <= 0n) {
              allowedge[k] = true;
            }
          }
          if (req(allowedge[k], 'allowedge')) {
            const bw = req(inblossom[w], 'inblossom');
            if (req(label[bw], 'label') === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (req(label[bw], 'label') === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) {
                addBlossom(base, k);
              } else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (req(label[w], 'label') === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (kslackKnown) {
            const bw = req(inblossom[w], 'inblossom');
            if (req(label[bw], 'label') === 1) {
              const bv = req(inblossom[v], 'inblossom');
              if (
                req(bestedge[bv], 'bestedge') === -1 ||
                kslack < slack(req(bestedge[bv], 'bestedge'))
              ) {
                bestedge[bv] = k;
              }
            } else if (req(label[w], 'label') === 0) {
              if (
                req(bestedge[w], 'bestedge') === -1 ||
                kslack < slack(req(bestedge[w], 'bestedge'))
              ) {
                bestedge[w] = k;
              }
            }
          }
        }
      }
      if (augmented) {
        break;
      }

      // Dual o'zgaruvchilarni yangilash uchun minimal delta.
      let deltatype = 1;
      let delta = req(dualvar[0], 'dualvar');
      for (let v = 1; v < nvertex; v += 1) {
        const d = req(dualvar[v], 'dualvar');
        if (d < delta) {
          delta = d;
        }
      }
      let deltaedge = -1;
      let deltablossom = -1;

      for (let v = 0; v < nvertex; v += 1) {
        if (
          req(label[req(inblossom[v], 'inblossom')], 'label') === 0 &&
          req(bestedge[v], 'bestedge') !== -1
        ) {
          const d = slack(req(bestedge[v], 'bestedge'));
          if (d < delta) {
            delta = d;
            deltatype = 2;
            deltaedge = req(bestedge[v], 'bestedge');
          }
        }
      }
      for (let b = 0; b < 2 * nvertex; b += 1) {
        if (
          req(blossomparent[b], 'blossomparent') === -1 &&
          req(label[b], 'label') === 1 &&
          req(bestedge[b], 'bestedge') !== -1
        ) {
          const kslack = slack(req(bestedge[b], 'bestedge'));
          if ((kslack & 1n) !== 0n) {
            throw new Error('blossom ichki xato: delta3 slack toq — butunlik buzildi');
          }
          const d = kslack / 2n;
          if (d < delta) {
            delta = d;
            deltatype = 3;
            deltaedge = req(bestedge[b], 'bestedge');
          }
        }
      }
      for (let b = nvertex; b < 2 * nvertex; b += 1) {
        if (
          req(blossombase[b], 'blossombase') >= 0 &&
          req(blossomparent[b], 'blossomparent') === -1 &&
          req(label[b], 'label') === 2 &&
          req(dualvar[b], 'dualvar') < delta
        ) {
          delta = req(dualvar[b], 'dualvar');
          deltatype = 4;
          deltablossom = b;
        }
      }

      // Duallarni yangilash.
      for (let v = 0; v < nvertex; v += 1) {
        const lbl = req(label[req(inblossom[v], 'inblossom')], 'label');
        if (lbl === 1) {
          dualvar[v] = req(dualvar[v], 'dualvar') - delta;
        } else if (lbl === 2) {
          dualvar[v] = req(dualvar[v], 'dualvar') + delta;
        }
      }
      for (let b = nvertex; b < 2 * nvertex; b += 1) {
        if (
          req(blossombase[b], 'blossombase') >= 0 &&
          req(blossomparent[b], 'blossomparent') === -1
        ) {
          const lbl = req(label[b], 'label');
          if (lbl === 1) {
            dualvar[b] = req(dualvar[b], 'dualvar') + delta;
          } else if (lbl === 2) {
            dualvar[b] = req(dualvar[b], 'dualvar') - delta;
          }
        }
      }

      if (deltatype === 1) {
        break; // Optimum topildi.
      } else if (deltatype === 2) {
        allowedge[deltaedge] = true;
        let i = req(edgeU[deltaedge], 'edgeU');
        if (req(label[req(inblossom[i], 'inblossom')], 'label') === 0) {
          i = req(edgeV[deltaedge], 'edgeV');
        }
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = true;
        queue.push(req(edgeU[deltaedge], 'edgeU'));
      } else {
        expandBlossom(deltablossom, false);
      }
    }

    if (!augmented) {
      break;
    }

    // Bosqich oxirida duali nolga tushgan S-blossomlarni ochish.
    for (let b = nvertex; b < 2 * nvertex; b += 1) {
      if (
        req(blossomparent[b], 'blossomparent') === -1 &&
        req(blossombase[b], 'blossombase') >= 0 &&
        req(label[b], 'label') === 1 &&
        req(dualvar[b], 'dualvar') === 0n
      ) {
        expandBlossom(b, true);
      }
    }
  }

  // Endpoint ko'rinishidan tugun ko'rinishiga o'tkazish.
  const result = new Array<number>(nvertex).fill(-1);
  for (let v = 0; v < nvertex; v += 1) {
    const m = req(mate[v], 'mate');
    if (m >= 0) {
      result[v] = req(endpoint[m], 'endpoint');
    }
  }
  // Simmetriya himoyasi.
  for (let v = 0; v < nvertex; v += 1) {
    const m = req(result[v], 'result');
    if (m !== -1 && req(result[m], 'result') !== v) {
      throw new Error('blossom ichki xato: matching simmetrik emas');
    }
  }
  return result;
}
