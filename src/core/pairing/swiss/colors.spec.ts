import { Color, ColorPreferenceStrength } from '../pairing.types';
import {
  allocateColors,
  colorDifference,
  colorPreferenceOf,
  oppositeColor,
  type ColorAllocationSide,
} from './colors';

/**
 * Rang mantiqi testlari — FIDE C.04.3 (2026-02) Article 1.6, 1.7 va 5.2
 * verbatim matniga qarshi (docs/references/fide-c0403-dutch-2026-02.md).
 */

const W = Color.White;
const B = Color.Black;

function side(overrides: Partial<ColorAllocationSide> = {}): ColorAllocationSide {
  return {
    pref: { color: null, strength: ColorPreferenceStrength.None },
    colorDiff: 0,
    history: [],
    rankIndex: 0,
    pairingNumber: 1,
    ...overrides,
  };
}

/** Tarixdan tomon quradi — pref/CD nomuvofiqligi testda bo'lmasin. */
function sideFromHistory(
  history: readonly Color[],
  rankIndex: number,
  pairingNumber: number,
): ColorAllocationSide {
  return {
    pref: colorPreferenceOf(history),
    colorDiff: colorDifference(history),
    history,
    rankIndex,
    pairingNumber,
  };
}

describe('colorDifference (Article 1.6)', () => {
  it.each([
    [[], 0],
    [[W], 1],
    [[B], -1],
    [[W, B], 0],
    [[W, W, B], 1],
    [[B, B], -2],
  ] as const)('%j → %i', (history, expected) => {
    expect(colorDifference(history)).toBe(expected);
  });
});

describe('colorPreferenceOf (Article 1.7)', () => {
  it('1.7.4: partiya o\'ynamagan — afzallik yo\'q', () => {
    expect(colorPreferenceOf([])).toEqual({
      color: null,
      strength: ColorPreferenceStrength.None,
    });
  });

  it('1.7.2: CD = +1 → strong qora; CD = −1 → strong oq', () => {
    expect(colorPreferenceOf([W])).toEqual({
      color: B,
      strength: ColorPreferenceStrength.Strong,
    });
    expect(colorPreferenceOf([B])).toEqual({
      color: W,
      strength: ColorPreferenceStrength.Strong,
    });
    expect(colorPreferenceOf([W, B, W])).toEqual({
      color: B,
      strength: ColorPreferenceStrength.Strong,
    });
  });

  it('1.7.3: CD = 0 → mild, oxirgi rangning teskarisi', () => {
    expect(colorPreferenceOf([W, B])).toEqual({
      color: W,
      strength: ColorPreferenceStrength.Mild,
    });
    expect(colorPreferenceOf([B, W])).toEqual({
      color: B,
      strength: ColorPreferenceStrength.Mild,
    });
  });

  it('1.7.1 (sabab 1): |CD| > 1 → absolute', () => {
    expect(colorPreferenceOf([W, W])).toEqual({
      color: B,
      strength: ColorPreferenceStrength.Absolute,
    });
    expect(colorPreferenceOf([B, B])).toEqual({
      color: W,
      strength: ColorPreferenceStrength.Absolute,
    });
  });

  it('1.7.1 (sabab 2): oxirgi ikki partiya bir xil rang → absolute (CD ≤ 1 bo\'lsa ham)', () => {
    // B,W,W: CD = +1, lekin oxirgi ikkitasi oq → absolute qora.
    expect(colorPreferenceOf([B, W, W])).toEqual({
      color: B,
      strength: ColorPreferenceStrength.Absolute,
    });
    // W,B,B: CD = −1, oxirgi ikkitasi qora → absolute oq.
    expect(colorPreferenceOf([W, B, B])).toEqual({
      color: W,
      strength: ColorPreferenceStrength.Absolute,
    });
  });

  it('oppositeColor yordamchisi', () => {
    expect(oppositeColor(W)).toBe(B);
    expect(oppositeColor(B)).toBe(W);
  });
});

describe('allocateColors (Article 5.2)', () => {
  it('5.2.1: qarama-qarshi afzalliklar — ikkalasi ham qondiriladi', () => {
    const a = sideFromHistory([B], 0, 1); // strong oq
    const b = sideFromHistory([W], 1, 2); // strong qora
    expect(allocateColors(a, b, W)).toEqual({ firstIsWhite: true, rule: '5.2.1' });
  });

  it('5.2.1 (1.7.4 bilan): faqat bittasida afzallik — o\'shaniki qondiriladi', () => {
    const a = sideFromHistory([W], 0, 1); // strong qora
    const b = side({ rankIndex: 1, pairingNumber: 9 }); // o'ynamagan
    expect(allocateColors(a, b, W)).toEqual({ firstIsWhite: false, rule: '5.2.1' });
    expect(allocateColors(b, a, W)).toEqual({ firstIsWhite: true, rule: '5.2.1' });
  });

  it('5.2.2: kuchliroq afzallik yutadi (absolute > strong > mild)', () => {
    const absolute = sideFromHistory([B, B], 0, 1); // absolute oq
    const mild = sideFromHistory([B, W], 1, 2); // mild qora... aslida [B,W] mild qora
    // Ikkalasi ham "oq" istamaydi — mild qora vs absolute oq mos → 5.2.1 bo'ladi.
    // Shuning uchun BIR XIL rangni istaydigan juftlik tuzamiz:
    const strongWhite = sideFromHistory([B], 1, 2); // strong oq
    expect(allocateColors(absolute, strongWhite, W)).toEqual({
      firstIsWhite: true,
      rule: '5.2.2',
    });
    expect(allocateColors(strongWhite, absolute, W)).toEqual({
      firstIsWhite: false,
      rule: '5.2.2',
    });
    // mild ishlatilmay qolmasin: strong vs mild — strong yutadi.
    const mildWhite = sideFromHistory([W, B], 1, 2); // mild oq
    expect(allocateColors(strongWhite, mildWhite, W)).toEqual({
      firstIsWhite: true,
      rule: '5.2.2',
    });
    expect(mild.pref.color).toBe(B); // tip ishlatildi
  });

  it('5.2.2 (2-jumla): ikkala absolute — kengroq |CD| yutadi (topscorer holati)', () => {
    // a: CD −2 → absolute oq; b: oxirgi 2 ta qora, CD 0 emas −... [W,B,B]: CD −1,
    // oxirgi ikkitasi qora → absolute oq, |CD| = 1 < 2.
    const a = sideFromHistory([B, B], 0, 1);
    const b = sideFromHistory([W, B, B], 1, 2);
    expect(allocateColors(a, b, W)).toEqual({ firstIsWhite: true, rule: '5.2.2' });
    expect(allocateColors(b, a, W)).toEqual({ firstIsWhite: false, rule: '5.2.2' });
  });

  it('5.2.3: teng kuch, bir xil istak — ranglari farq qilgan eng oxirgi juftga nisbatan almashtiriladi', () => {
    // a: [W,B,W] strong qora; b: [W,W,B] strong qora. Oxiridan 1-qadam:
    // a oq, b qora — farq! a teskarisini (qora) oladi.
    const a = sideFromHistory([W, B, W], 0, 1);
    const b = sideFromHistory([W, W, B], 1, 2);
    expect(allocateColors(a, b, W)).toEqual({ firstIsWhite: false, rule: '5.2.3' });
  });

  it('5.2.4: tarix ham bir xil — yuqori rankdagining afzalligi', () => {
    const a = sideFromHistory([W, B], 0, 1); // mild oq
    const b = sideFromHistory([W, B], 1, 2); // mild oq (aynan bir xil tarix)
    expect(allocateColors(a, b, W)).toEqual({ firstIsWhite: true, rule: '5.2.4' });
    // Teskari tartibda ham yuqori rank (b endi birinchi argument emas) yutadi.
    expect(allocateColors(b, a, W)).toEqual({ firstIsWhite: false, rule: '5.2.4' });
  });

  it('5.2.5: afzalliklar yo\'q — yuqori rankdagi TPN toq bo\'lsa initial-colour oladi', () => {
    const a = side({ rankIndex: 0, pairingNumber: 1 });
    const b = side({ rankIndex: 1, pairingNumber: 5 });
    expect(allocateColors(a, b, W)).toEqual({ firstIsWhite: true, rule: '5.2.5' });
    expect(allocateColors(a, b, B)).toEqual({ firstIsWhite: false, rule: '5.2.5' });

    const evenHigher = side({ rankIndex: 0, pairingNumber: 2 });
    const lower = side({ rankIndex: 1, pairingNumber: 6 });
    // Juft TPN → teskari rang.
    expect(allocateColors(evenHigher, lower, W)).toEqual({
      firstIsWhite: false,
      rule: '5.2.5',
    });
    expect(allocateColors(evenHigher, lower, B)).toEqual({
      firstIsWhite: true,
      rule: '5.2.5',
    });
  });
});
