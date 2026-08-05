/**
 * FIDE C.04.3 (2026-02) kriteriylarini BigInt leksikografik og'irliklarga
 * kodlash (ADR-0007 + ADR-0009).
 *
 * G'OYA: bitta bracket ichidagi barcha nomzod juftlashtirishlar bitta skalyar
 * og'irlik bilan taqqoslanadi. Har bir kriteriy o'z "darajasi"da (aralash
 * radiks pozitsion kodlash): yuqoriroq darajaning 1 birlik farqi quyi
 * darajalarning BARCHA mumkin yig'indisidan qat'iy katta. `number` mantissasi
 * 53 bit — bu kodlash unga SIG'MAYDI, shuning uchun BigInt (ADR-0007).
 *
 * DARAJALAR (yuqoridan pastga, Article 2 ustuvorligi):
 *
 *   PAIR — [C6] juftliklar sonini maksimallashtirish. Har qirra bir xil
 *          basePair oladi; basePair quyi darajalar jami diapazonining IKKI
 *          baravaridan katta (bonus va jarima aralash bo'lgani uchun ×2).
 *   C5   — [C5] PAB oluvchining ochkosi minimal (faqat dummy qirrada).
 *   C7   — [C7] downfloaterlar ochkolari (kamayish tartibida) minimal:
 *          juftlashgan har tugun ochkosiga eksponensial bonus — floatga
 *          qolganlar yig'indisi shu bilan leksikografik minimallashadi.
 *   SD   — tarkibiy yaqinlashish (ADR-0009): juftlik ichidagi ochko farqlari
 *          (kamayish tartibida) minimal. Sof FIDE'da bu bracket tuzilishining
 *          o'zi; birlashtirilgan (merge) bracketlarda vazn sifatida kerak.
 *   C9   — [C9] PAB oluvchining o'ynalmagan partiyalari minimal (dummy qirra).
 *   C10  — [C10] |CD| > 2 bo'ladigan topscorer/raqib sonini minimal.
 *   C11  — [C11] uch marta ketma-ket bir xil rang holatlarini minimal.
 *   C12  — [C12] rang afzalligi qondirilmaganlar sonini minimal.
 *   C13  — [C13] STRONG afzalligi qondirilmaganlar sonini minimal
 *          (talqin: 1.7.2 ma'nosidagi strong; absolyut buzilishlar C10/C11
 *          darajasida allaqachon jarimalangan — hujjatlangan talqin).
 *   C14  — [C14] o'tgan turda downfloat olgan RESIDENT yana float qilmasin
 *          (juftlashganlik bonusi — floatga qolsa bonus yo'qoladi).
 *   C15  — [C15] o'tgan turda upfloat olgan o'yinchi yana MDP raqibi bo'lmasin.
 *   C16/C17 — [C16/C17] xuddi shu, ikki tur oldingi float uchun.
 *   C18–C21 — [C18–C21] float takrorlanganda ochko farqlari (kamayish
 *          tartibida) minimal — eksponensial qiymatlar bilan.
 *   TB   — kanonik tanlov darajasi: Article 3.6/3.7 va 4.2 ketma-ketligining
 *          yaqinlashuvi. Har juftlikning kichik BSN'li tomoni uchun "sherik
 *          o'rni" raqami leksikografik minimallashadi (4.2.2 transpozitsiya
 *          tartibi bilan mos); floatga qolish istalgan sherikdan yomon.
 *          Bu daraja teng-kuchli nomzodlar ichida YAGONA deterministik
 *          tanlovni kafolatlaydi. JaVaFo ketma-ketligi bilan to'liq ekvivalentlik
 *          DA'VO QILINMAYDI (ADR-0009 "halol chegaralar").
 *
 * Eksponensial qiymatlar: V(e) = (n+1)^e — "kamayish tartibida taqqoslangan
 * multiset minimal" semantikasi yig'indiga aynan kodlanadi, chunki bitta
 * yuqoriroq qiymat quyi qiymatlarning n tasidan ham katta.
 */

import { Color, ColorPreferenceStrength, FloatDirection } from '../pairing.types';
import { allocateColors } from './colors';
import { colorOutcomeFlags, toAllocationSide, type SwissPlayer } from './swiss-types';

/** Bracket ichidagi o'rin: o'yinchi + BSN (Article 4.1) + MDP belgisi. */
export interface BracketSlot {
  readonly player: SwissPlayer;
  /** In-Bracket Sequence-Number, 0-asosli (Article 4.1.1). */
  readonly bsn: number;
  /** Yuqori bracketdan tushgan (MDP, Article 1.4.1). */
  readonly carried: boolean;
}

export interface WeightSchemeParams {
  /** Aktiv o'yinchilar soni (barcha bracketlar uchun yagona shkala). */
  readonly n: number;
  readonly minScoreX2: number;
  readonly maxScoreX2: number;
  /** Bu turgacha o'tgan turlar soni — C9 diapazoni. */
  readonly maxUnplayed: number;
  /** Article 5.1 — qur'a ranggi (5.2.5 uchun). */
  readonly initialColor: Color;
}

/** Rang jarimalarining hisobi — og'irlik va diagnostika uchun umumiy. */
export interface ColorPenalties {
  readonly c10: number;
  readonly c11: number;
  readonly c12: number;
  readonly c13: number;
  /** Birinchi (a) tomon oq o'ynaydimi — Article 5.2 natijasi. */
  readonly firstIsWhite: boolean;
}

/**
 * Juftlik uchun rang taqsimotini bajarib (Article 5.2), C10–C13
 * jarimalarini sanaydi. Determinizm: rang taqsimoti sof funksiya.
 */
export function colorPenaltiesFor(
  a: SwissPlayer,
  b: SwissPlayer,
  initialColor: Color,
): ColorPenalties {
  const alloc = allocateColors(toAllocationSide(a), toAllocationSide(b), initialColor);
  const colorA = alloc.firstIsWhite ? Color.White : Color.Black;
  const colorB = alloc.firstIsWhite ? Color.Black : Color.White;
  let c10 = 0;
  let c11 = 0;
  let c12 = 0;
  let c13 = 0;
  for (const [p, got] of [
    [a, colorA],
    [b, colorB],
  ] as const) {
    const flags = colorOutcomeFlags(p, got);
    if (flags.exceedsColorDiff) {
      c10 += 1;
    }
    if (flags.threeInARow) {
      c11 += 1;
    }
    if (p.pref.color !== null && p.pref.color !== got) {
      c12 += 1;
      if (p.pref.strength === ColorPreferenceStrength.Strong) {
        c13 += 1;
      }
    }
  }
  return { c10, c11, c12, c13, firstIsWhite: alloc.firstIsWhite };
}

function bpow(base: bigint, exp: number): bigint {
  let result = 1n;
  for (let i = 0; i < exp; i += 1) {
    result *= base;
  }
  return result;
}

export class WeightScheme {
  readonly params: WeightSchemeParams;

  private readonly nBig: bigint;
  /** TB darajasi pozitsion bazasi: har digit < 2n+3. */
  private readonly betaTB: bigint;
  /** (n+1)^e qiymatlari, e = 0..span+2. */
  private readonly vPow: readonly bigint[];
  /** betaTB^e qiymatlari, e = 0..n. */
  private readonly tbPow: readonly bigint[];

  private readonly baseTB = 1n;
  private readonly baseC21: bigint;
  private readonly baseC20: bigint;
  private readonly baseC19: bigint;
  private readonly baseC18: bigint;
  private readonly baseC17: bigint;
  private readonly baseC16: bigint;
  private readonly baseC15: bigint;
  private readonly baseC14: bigint;
  private readonly baseC13: bigint;
  private readonly baseC12: bigint;
  private readonly baseC11: bigint;
  private readonly baseC10: bigint;
  private readonly baseC9: bigint;
  private readonly baseSD: bigint;
  private readonly baseC7: bigint;
  private readonly baseC5: bigint;
  private readonly basePair: bigint;

  constructor(params: WeightSchemeParams) {
    this.params = params;
    const n = params.n;
    const span = params.maxScoreX2 - params.minScoreX2;
    this.nBig = BigInt(n);
    this.betaTB = BigInt(2 * n + 3);

    const vBase = BigInt(n + 1);
    const vPow: bigint[] = [];
    for (let e = 0; e <= span + 2; e += 1) {
      vPow.push(bpow(vBase, e));
    }
    this.vPow = vPow;

    const tbPow: bigint[] = [];
    for (let e = 0; e <= n; e += 1) {
      tbPow.push(bpow(this.betaTB, e));
    }
    this.tbPow = tbPow;

    // Diapazon chegaralari (isbotlanadigan ustki chegaralar):
    //  - TB jami: Σ betaTB^(n-1-b)·(2n+2) < betaTB^(n+1);
    //  - eksponensial (C7/SD/C18–C21) jami: n·(n+1)^span < (n+1)^(span+2);
    //  - hisob (count) darajalari jami: ≤ n.
    const maxTbTotal = bpow(this.betaTB, n + 1);
    const maxExpTotal = bpow(vBase, span + 2);
    const maxCount = this.nBig;

    this.baseC21 = this.baseTB * (maxTbTotal + 1n);
    this.baseC20 = this.baseC21 * (maxExpTotal + 1n);
    this.baseC19 = this.baseC20 * (maxExpTotal + 1n);
    this.baseC18 = this.baseC19 * (maxExpTotal + 1n);
    this.baseC17 = this.baseC18 * (maxExpTotal + 1n);
    this.baseC16 = this.baseC17 * (maxCount + 1n);
    this.baseC15 = this.baseC16 * (maxCount + 1n);
    this.baseC14 = this.baseC15 * (maxCount + 1n);
    this.baseC13 = this.baseC14 * (maxCount + 1n);
    this.baseC12 = this.baseC13 * (maxCount + 1n);
    this.baseC11 = this.baseC12 * (maxCount + 1n);
    this.baseC10 = this.baseC11 * (maxCount + 1n);
    this.baseC9 = this.baseC10 * (maxCount + 1n);
    this.baseSD = this.baseC9 * (BigInt(params.maxUnplayed) + 1n);
    this.baseC7 = this.baseSD * (maxExpTotal + 1n);
    this.baseC5 = this.baseC7 * (maxExpTotal + 1n);
    // C6 dominantligi: quyi darajalar bonus HAM jarima HAM bo'lgani uchun
    // ikki nomzod orasidagi farq jami diapazonning 2 baravarigacha yetadi.
    this.basePair = this.baseC5 * (BigInt(span) + 1n) * 2n + 1n;
  }

  private vp(exp: number, what: string): bigint {
    const v = this.vPow[exp];
    if (v === undefined) {
      throw new Error(`WeightScheme: (n+1)^${String(exp)} tayyorlanmagan (${what})`);
    }
    return v;
  }

  private tb(exp: number): bigint {
    const v = this.tbPow[exp];
    if (v === undefined) {
      throw new Error(`WeightScheme: betaTB^${String(exp)} tayyorlanmagan`);
    }
    return v;
  }

  /**
   * Haqiqiy juftlik qirrasining og'irligi. `split` — S1/S2 chegarasi
   * (Article 3.2: heterogen bracketda MDP soni, homogen bracketda MaxPairs).
   */
  realEdgeWeight(u: BracketSlot, v: BracketSlot, split: number): bigint {
    const { n, minScoreX2, initialColor } = this.params;
    const pu = u.player;
    const pv = v.player;
    let w = this.basePair;

    // [C7] — juftlashganlik bonusi, ochkoga eksponensial.
    w += this.baseC7 * (this.vp(pu.scoreX2 - minScoreX2, 'C7') + this.vp(pv.scoreX2 - minScoreX2, 'C7'));

    // SD — juftlik ichidagi ochko farqi (birlashtirilgan bracketlar uchun).
    const dX2 = Math.abs(pu.scoreX2 - pv.scoreX2);
    if (dX2 > 0) {
      w -= this.baseSD * this.vp(dX2, 'SD');
    }

    // [C10]–[C13] — rang taqsimoti natijasidagi jarimalar.
    const pens = colorPenaltiesFor(pu, pv, initialColor);
    w -= this.baseC10 * BigInt(pens.c10);
    w -= this.baseC11 * BigInt(pens.c11);
    w -= this.baseC12 * BigInt(pens.c12);
    w -= this.baseC13 * BigInt(pens.c13);

    // [C14]/[C16] — resident bo'lib o'tgan tur(lar)da down float olganlar
    // juftlashsa bonus (floatga qolsa — yo'qotadi).
    for (const slot of [u, v]) {
      if (!slot.carried && slot.player.floatPrev === FloatDirection.Down) {
        w += this.baseC14;
      }
      if (!slot.carried && slot.player.floatPrevPrev === FloatDirection.Down) {
        w += this.baseC16;
      }
    }

    // Aralash ochkoli juftlik: yuqori tomon down, quyi tomon up float oladi
    // (Article 1.4.2) — [C15]/[C17]/[C18]–[C21].
    if (dX2 > 0) {
      const down = pu.scoreX2 > pv.scoreX2 ? pu : pv;
      const up = down === pu ? pv : pu;
      if (up.floatPrev === FloatDirection.Up) {
        w -= this.baseC15;
        w -= this.baseC19 * this.vp(dX2, 'C19');
      }
      if (up.floatPrevPrev === FloatDirection.Up) {
        w -= this.baseC17;
        w -= this.baseC21 * this.vp(dX2, 'C21');
      }
      if (down.floatPrev === FloatDirection.Down) {
        w -= this.baseC18 * this.vp(dX2, 'C18');
      }
      if (down.floatPrevPrev === FloatDirection.Down) {
        w -= this.baseC20 * this.vp(dX2, 'C20');
      }
    }

    // TB — kanonik ketma-ketlik darajasi (fayl sarlavhasi).
    const lo = u.bsn < v.bsn ? u : v;
    const hi = lo === u ? v : u;
    const matchedBonus = BigInt(2 * n + 2);
    w += this.tb(n - 1 - lo.bsn) * matchedBonus;
    w += this.tb(n - 1 - hi.bsn) * matchedBonus;
    // Sherik o'rni: S2 hududidagi sherik BSN o'sishida yomonlashadi (4.2.2
    // transpozitsiya tartibi); S1 ichidagi sherik har qanday S2 sherikdan
    // yomon, kattaroq BSN afzal (4.3 exchange qoidasining yo'nalishi).
    const rank = hi.bsn >= split ? hi.bsn : 2 * n - hi.bsn;
    w -= this.tb(n - 1 - lo.bsn) * BigInt(rank);

    return w;
  }

  /**
   * PAB dummy qirrasi (faqat oxirgi bracket, toq umumiy son):
   * [C5] ochko minimal + [C9] o'ynalmagan partiyalar minimal.
   * TB/C7/C14/C16 bonuslari YO'Q — PAB olish floatga qolish bilan teng
   * (1.4.3: PAB — downfloat), shuning uchun bonuslarning yo'qolishi
   * kriteriylarni avtomatik to'g'ri hisoblaydi.
   */
  dummyEdgeWeight(slot: BracketSlot): bigint {
    const { maxScoreX2, maxUnplayed } = this.params;
    let w = this.basePair;
    w += this.baseC5 * BigInt(maxScoreX2 - slot.player.scoreX2);
    w += this.baseC9 * BigInt(Math.max(0, maxUnplayed - slot.player.unplayedCount));
    return w;
  }
}
