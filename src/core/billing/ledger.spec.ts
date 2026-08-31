import fc from 'fast-check';

import { Money } from '../money/money';
import {
  buildEntryFeePaymentEntries,
  buildLedgerTransaction,
  cashAccountForProvider,
  LEDGER_ACCOUNTS,
  LedgerImbalanceError,
  type LedgerEntryInput,
  type LedgerPaymentProvider,
  reverseLedgerEntries,
  sumByDirection,
} from './ledger';

/**
 * Ledger invarianti — PROPERTY TEST, 1000 run (docs/14-roadmap.md Faza 4
 * DoD: "Ledger invarianti property test bilan (1000 run)").
 *
 * Nega property test: balans bugi odatda KUTILMAGAN bo'linishda chiqadi
 * (masalan, 1 tiyin qoldiq). Qo'lda yozilgan misol faqat o'ylab topilgan
 * holatni tekshiradi; fast-check o'zi o'ylamagan holatlarni topadi va
 * yiqilgan misolni minimallashtiradi (docs/13-testing-strategy.md §5).
 */
const RUNS_1000 = { numRuns: 1000 };

/** 1 tiyin .. 10^12 tiyin (~10 mlrd so'm) — real diapazon. */
const amountArb = fc.bigInt({ min: 1n, max: 10n ** 12n });

/** 1..10 ta musbat og'irlik — split payment nisbatlari. */
const weightsArb = fc.array(fc.bigInt({ min: 1n, max: 100n }), {
  minLength: 1,
  maxLength: 10,
});

const CREDIT_SPLIT_ACCOUNTS = [
  'liability.organizer_payable',
  'revenue.commission',
  'expense.provider_fee',
  'revenue.entry_fee',
  'revenue.subscription',
  'liability.tax_payable',
] as const;

/**
 * Summani Money.allocate bilan bo'lib, bitta DEBIT + N ta CREDIT
 * yozuvdan iborat to'plam quradi. Nol qismlar tashlab yuboriladi —
 * 0 miqdorli ledger yozuvi taqiqlangan (yozuv bo'lmasa, qarz ham yo'q).
 */
function splitIntoEntries(totalTiyin: bigint, weights: readonly bigint[]): LedgerEntryInput[] {
  const parts = Money.fromMinor(totalTiyin, 'UZS').allocate(weights);
  const credits: LedgerEntryInput[] = parts
    .filter((p) => p.amount > 0n)
    .map((p, i) => ({
      account: CREDIT_SPLIT_ACCOUNTS[i % CREDIT_SPLIT_ACCOUNTS.length]!,
      direction: 'CREDIT' as const,
      amountTiyin: p.amount,
    }));
  return [{ account: 'cash.click', direction: 'DEBIT', amountTiyin: totalTiyin }, ...credits];
}

describe('buildLedgerTransaction — invariant (property, 1000 run)', () => {
  it("tasodifiy bo'linish HAR DOIM balanslanadi — bitta tiyin ham yo'qolmaydi", () => {
    fc.assert(
      fc.property(amountArb, weightsArb, (total, weights) => {
        const entries = buildLedgerTransaction(splitIntoEntries(total, weights));

        // SUM(debit) === SUM(credit) === asl summa.
        expect(sumByDirection(entries, 'DEBIT')).toBe(total);
        expect(sumByDirection(entries, 'CREDIT')).toBe(total);
      }),
      RUNS_1000,
    );
  });

  it('har qanday nomutanosiblik HAR DOIM LedgerImbalanceError tashlaydi', () => {
    fc.assert(
      fc.property(
        amountArb,
        weightsArb,
        fc.bigInt({ min: 1n, max: 1_000n }),
        fc.boolean(),
        (total, weights, delta, addToDebit) => {
          // Balanslangan to'plamning BITTA tomonini delta'ga buzamiz.
          const entries = splitIntoEntries(total, weights).map((e, i) => {
            if (addToDebit && i === 0) {
              return { ...e, amountTiyin: e.amountTiyin + delta };
            }
            if (!addToDebit && i === 1) {
              return { ...e, amountTiyin: e.amountTiyin + delta };
            }
            return e;
          });

          expect(() => buildLedgerTransaction(entries)).toThrow(LedgerImbalanceError);
        },
      ),
      RUNS_1000,
    );
  });

  it('nol yoki manfiy miqdor HAR DOIM rad etiladi', () => {
    fc.assert(
      fc.property(amountArb, fc.bigInt({ min: -(10n ** 12n), max: 0n }), (total, bad) => {
        const entries: LedgerEntryInput[] = [
          { account: 'cash.manual', direction: 'DEBIT', amountTiyin: total },
          { account: 'liability.organizer_payable', direction: 'CREDIT', amountTiyin: total },
          // Nol/manfiy yozuv — yig'indini buzmasligi uchun juft qo'shiladi,
          // baribir rad etilishi shart (miqdor qoidasi balansdan oldin).
          { account: 'revenue.commission', direction: 'DEBIT', amountTiyin: bad },
          { account: 'revenue.commission', direction: 'CREDIT', amountTiyin: bad },
        ];
        expect(() => buildLedgerTransaction(entries)).toThrow(LedgerImbalanceError);
      }),
      RUNS_1000,
    );
  });

  it('teskari (reversing) yozuvlar ham balanslangan va yoʼnalishlar almashgan', () => {
    fc.assert(
      fc.property(amountArb, weightsArb, (total, weights) => {
        const original = buildLedgerTransaction(splitIntoEntries(total, weights));
        const reversed = reverseLedgerEntries(original);

        expect(reversed).toHaveLength(original.length);
        expect(sumByDirection(reversed, 'DEBIT')).toBe(total);
        expect(sumByDirection(reversed, 'CREDIT')).toBe(total);
        for (const [i, entry] of reversed.entries()) {
          expect(entry.account).toBe(original[i]!.account);
          expect(entry.direction).not.toBe(original[i]!.direction);
          expect(entry.amountTiyin).toBe(original[i]!.amountTiyin);
        }
      }),
      RUNS_1000,
    );
  });
});

describe('buildLedgerTransaction — chegara holatlari', () => {
  it('2 tadan kam yozuv — double-entry emas, rad etiladi', () => {
    expect(() => buildLedgerTransaction([])).toThrow(LedgerImbalanceError);
    expect(() =>
      buildLedgerTransaction([{ account: 'cash.click', direction: 'DEBIT', amountTiyin: 100n }]),
    ).toThrow(LedgerImbalanceError);
  });

  it("noma'lum hisob kodi runtime'da ham rad etiladi", () => {
    expect(() =>
      buildLedgerTransaction([
        { account: 'cash.bitcoin' as never, direction: 'DEBIT', amountTiyin: 100n },
        { account: 'revenue.commission', direction: 'CREDIT', amountTiyin: 100n },
      ]),
    ).toThrow(LedgerImbalanceError);
  });

  it('natija muzlatilgan — keyin oʼzgartirib boʼlmaydi', () => {
    const entries = buildLedgerTransaction([
      { account: 'cash.manual', direction: 'DEBIT', amountTiyin: 5_000_000n },
      { account: 'liability.organizer_payable', direction: 'CREDIT', amountTiyin: 5_000_000n },
    ]);
    expect(Object.isFrozen(entries)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
  });
});

describe('hisoblar rejasi (docs/09 §6.6)', () => {
  it('har provayderning kassa hisobi rejada bor', () => {
    const providers: LedgerPaymentProvider[] = [
      'CLICK',
      'PAYME',
      'UZUM',
      'BANK_TRANSFER',
      'MANUAL',
    ];
    for (const p of providers) {
      const account = cashAccountForProvider(p);
      expect(LEDGER_ACCOUNTS[account]).toBe('asset');
    }
  });

  it("start puli to'lovi: DR cash.* / CR liability.organizer_payable (docs/09 §6.2)", () => {
    const entries = buildEntryFeePaymentEntries('MANUAL', 5_000_000n);
    expect(entries).toEqual([
      { account: 'cash.manual', direction: 'DEBIT', amountTiyin: 5_000_000n },
      { account: 'liability.organizer_payable', direction: 'CREDIT', amountTiyin: 5_000_000n },
    ]);
  });
});
