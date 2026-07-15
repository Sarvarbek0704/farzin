/**
 * Pul.
 *
 * QAT'IY QOIDA: pul HECH QACHON `number` bo'lmaydi.
 * Ichki ifoda — `bigint`, eng mayda birlikda (UZS uchun tiyin).
 *
 * Nega:
 *   0.1 + 0.2 === 0.30000000000000004
 *   toFixed() xatoni YASHIRADI, tuzatmaydi.
 *
 * Bu fayl sof TypeScript — hech qanday framework bog'liqligi yo'q (ADR-0001).
 *
 * @see docs/adr/0006-money-as-bigint-tiyin.md
 * @see docs/09-payments-and-billing.md §4
 */

export type Currency = 'UZS' | 'USD' | 'EUR';

/** Har valyutaning eng mayda birligi butun birlikka nisbatan. */
const MINOR_UNITS: Readonly<Record<Currency, bigint>> = Object.freeze({
  UZS: 100n, // 1 so'm = 100 tiyin
  USD: 100n,
  EUR: 100n,
});

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Turli valyutadagi summalarni qo'shib bo'lmaydi: ${a} va ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * O'zgarmas (immutable) pul qiymati.
 *
 * Har amal YANGI Money qaytaradi. Mavjud obyekt hech qachon o'zgarmaydi —
 * bu concurrent kodda tasodifiy o'zgartirishning oldini oladi.
 */
export class Money {
  /**
   * @param amount   Eng mayda birlikda (tiyin). 50 000 UZS → 5_000_000n
   * @param currency Valyuta. Qiymat valyutasiz ma'nosiz.
   */
  private constructor(
    readonly amount: bigint,
    readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  /** Eng mayda birlikdan (tiyin). Asosiy konstruktor. */
  static fromMinor(amount: bigint, currency: Currency): Money {
    return new Money(amount, currency);
  }

  /**
   * Butun birlikdan (so'm). FAQAT butun son qabul qiladi.
   *
   * Kasr `number` qabul qilinmaydi — aynan shu yerdan float xatosi kiradi.
   * Kasr kerak bo'lsa `fromMinor` ishlating.
   */
  static fromMajor(amount: number | bigint, currency: Currency): Money {
    if (typeof amount === 'number' && !Number.isInteger(amount)) {
      throw new TypeError(
        `Money.fromMajor kasr son qabul qilmaydi: ${String(amount)}. ` +
          `Kasr uchun fromMinor(${String(Math.round(amount * 100))}n, '${currency}') ishlating.`,
      );
    }
    return new Money(BigInt(amount) * MINOR_UNITS[currency], currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: bigint): Money {
    return new Money(this.amount * factor, this.currency);
  }

  /**
   * Foiz hisobi, basis point'da (1 bp = 0.01%).
   *
   * 2.5% → 250 bp
   *
   * Yaxlitlash: YUQORIGA. Komissiya har doim platforma foydasiga yaxlitlanadi.
   * Bu ataylab qilingan tanlov — ADR-0006 talab qiladi: har bo'lishning
   * yaxlitlash yo'nalishi asoslangan bo'lishi kerak.
   */
  percentage(basisPoints: bigint): Money {
    const product = this.amount * basisPoints;
    const divisor = 10_000n;
    // Yuqoriga yaxlitlash butun sonlar bilan: (a + b - 1) / b
    // Manfiy summa uchun bu noto'g'ri ishlaydi — shuning uchun tekshiramiz.
    if (this.amount < 0n) {
      throw new RangeError('percentage() manfiy summa bilan ishlatilmaydi');
    }
    return new Money((product + divisor - 1n) / divisor, this.currency);
  }

  /**
   * Summani N qismga bo'lish — TIYIN YO'QOTMASDAN.
   *
   * Bu marketplace split payment uchun kritik: 100 tiyinni 3 kishiga bo'lsak,
   * 33 + 33 + 33 = 99. Bitta tiyin qayerga ketdi?
   *
   * Bu metod qoldiqni birinchi qismlarga taqsimlaydi:
   *   allocate(100n, [1,1,1]) → [34, 33, 33]
   *
   * Kafolat: natijalar yig'indisi HAR DOIM asl summaga teng.
   * Bu property-based test bilan tekshiriladi.
   *
   * @param ratios Nisbatlar. Masalan [70, 20, 10] — 70%, 20%, 10%.
   */
  allocate(ratios: readonly bigint[]): Money[] {
    if (ratios.length === 0) {
      throw new RangeError("allocate() bo'sh nisbat massivi bilan chaqirilmaydi");
    }
    const total = ratios.reduce((sum, r) => {
      if (r < 0n) {
        throw new RangeError('allocate() manfiy nisbat qabul qilmaydi');
      }
      return sum + r;
    }, 0n);

    if (total === 0n) {
      throw new RangeError("allocate() nisbatlar yig'indisi noldan katta bo'lishi kerak");
    }

    const shares: bigint[] = [];
    let remainder = this.amount;

    for (const ratio of ratios) {
      // Pastga yaxlitlash — qoldiq keyin taqsimlanadi
      const share = (this.amount * ratio) / total;
      shares.push(share);
      remainder -= share;
    }

    // Qoldiqni birinchi qismlarga bittadan taqsimlash.
    // Bu yerda `remainder` har doim `0 <= remainder < ratios.length`.
    for (let i = 0n; i < remainder; i++) {
      const idx = Number(i);
      shares[idx] = (shares[idx] ?? 0n) + 1n;
    }

    return shares.map((s) => new Money(s, this.currency));
  }

  isZero(): boolean {
    return this.amount === 0n;
  }

  isNegative(): boolean {
    return this.amount < 0n;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amount < other.amount) {
      return -1;
    }
    if (this.amount > other.amount) {
      return 1;
    }
    return 0;
  }

  /**
   * Ko'rsatish uchun formatlash.
   *
   * `Number()` ga o'tkazish FAQAT shu yerda ruxsat etiladi — natija
   * ko'rsatiladi va qayta hisobga kirmaydi.
   */
  format(locale = 'uz-UZ'): string {
    const minorUnit = MINOR_UNITS[this.currency];
    const major = this.amount / minorUnit;
    const minor = this.amount % minorUnit;
    const asNumber = Number(`${major.toString()}.${minor.toString().padStart(2, '0')}`);

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
    }).format(asNumber);
  }

  /**
   * JSON serializatsiya.
   *
   * Summa STRING sifatida chiqadi — JS `Number` 2^53 dan katta butun sonni
   * yo'qotadi, va bu pul uchun qabul qilinmaydi.
   */
  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.amount.toString(), currency: this.currency };
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency} (minor units)`;
  }
}
