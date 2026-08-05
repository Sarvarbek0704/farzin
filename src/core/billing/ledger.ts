/**
 * Double-entry ledger — SOF tranzaksiya quruvchi.
 *
 * Har bir moliyaviy hodisa kamida ikkita yozuv: debit va kredit.
 * Invariant: SUM(debit) === SUM(credit) — HAR DOIM, HAR TRANZAKSIYADA.
 * Buzilsa — tranzaksiya umuman yaratilmaydi (fail fast, DB'ga yetmaydi).
 *
 * Bu fayl sof TypeScript — NestJS ham, Prisma ham yo'q (ADR-0001).
 * DB'ga yozish billing.repository.ts da; bu yerda faqat invariant.
 *
 * @see docs/09-payments-and-billing.md §6 (double-entry printsipi)
 * @see docs/adr/0006-money-as-bigint-tiyin.md (pul — BigInt tiyinda)
 */

/**
 * Hisoblar rejasi (chart of accounts) — docs/09 §6.6 jadvalining
 * `prisma/schema.prisma` (haqiqat manbai) uslubidagi transkripsiyasi.
 *
 * Sxema `LedgerEntry.account` izohida yassi kodlar ishlatiladi
 * ("cash.click" | "revenue.subscription" | "liability.organizer_payable");
 * docs/09 §6.6 esa shablonli kodlar beradi. Moslashtirish jadvali:
 *
 * | Kod (schema uslubi)          | docs/09 §6.6 sherigi              | Turi      |
 * |------------------------------|-----------------------------------|-----------|
 * | cash.click                   | provider:click:settlement         | asset     |
 * | cash.payme                   | provider:payme:settlement         | asset     |
 * | cash.uzum                    | provider:uzum:settlement          | asset     |
 * | cash.bank_transfer           | bank:main                         | asset     |
 * | cash.manual                  | (naqd kassa — §7.2 bank/naqd)     | asset     |
 * | revenue.entry_fee            | farzin:revenue:* (Farzin turniri) | revenue   |
 * | revenue.subscription         | farzin:revenue:subscription       | revenue   |
 * | revenue.commission           | farzin:revenue:commission         | revenue   |
 * | liability.organizer_payable  | tournament:{id}:entry_fees        | liability |
 * | liability.tax_payable        | farzin:liability:tax_payable      | liability |
 * | expense.provider_fee         | farzin:expense:provider_fee       | expense   |
 *
 * Refund uchun ALOHIDA hisob YO'Q — docs/09 §8.2: refund asl hisoblar
 * ustidagi TESKARI yozuv (reversing entry), asl yozuv o'chirilmaydi.
 *
 * `liability.tax_payable` to'ldirilish qoidasi bu kodda belgilanmaydi —
 * soliq stavkasi yuridik masala (docs/09 §6.6 izohi, §9).
 */
export const LEDGER_ACCOUNTS = Object.freeze({
  'cash.click': 'asset',
  'cash.payme': 'asset',
  'cash.uzum': 'asset',
  'cash.bank_transfer': 'asset',
  'cash.manual': 'asset',
  'revenue.entry_fee': 'revenue',
  'revenue.subscription': 'revenue',
  'revenue.commission': 'revenue',
  'liability.organizer_payable': 'liability',
  'liability.tax_payable': 'liability',
  'expense.provider_fee': 'expense',
} as const);

export type LedgerAccountCode = keyof typeof LEDGER_ACCOUNTS;
export type LedgerAccountKind = (typeof LEDGER_ACCOUNTS)[LedgerAccountCode];

/** `prisma/schema.prisma` dagi `LedgerDirection` enum bilan AYNAN mos. */
export type LedgerEntryDirection = 'DEBIT' | 'CREDIT';

/** `prisma/schema.prisma` dagi `PaymentProvider` enum bilan AYNAN mos. */
export type LedgerPaymentProvider = 'CLICK' | 'PAYME' | 'UZUM' | 'BANK_TRANSFER' | 'MANUAL';

/**
 * Bitta ledger yozuvi (miqdor MUSBAT, yo'nalish alohida maydonda —
 * `prisma/schema.prisma` `LedgerEntry` modeli bilan mos shakl).
 * Miqdor — TIYINDA, `bigint` (ADR-0006). Float HECH QACHON.
 */
export interface LedgerEntryInput {
  readonly account: LedgerAccountCode;
  readonly direction: LedgerEntryDirection;
  readonly amountTiyin: bigint;
}

/**
 * Ledger invarianti buzildi. Bu foydalanuvchi xatosi EMAS — dastur bugi:
 * balanslanmagan to'plam qurishga urinish. Shuning uchun DomainError emas,
 * oddiy Error (500 — kutilmagan holat, docs/02-architecture.md §11).
 */
export class LedgerImbalanceError extends Error {
  constructor(
    message: string,
    readonly debitTotalTiyin: bigint,
    readonly creditTotalTiyin: bigint,
  ) {
    super(
      `${message} (debit=${debitTotalTiyin.toString()} tiyin, ` +
        `credit=${creditTotalTiyin.toString()} tiyin)`,
    );
    this.name = 'LedgerImbalanceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Yo'nalish bo'yicha yig'indi — reconciliation va testlar uchun ham. */
export function sumByDirection(
  entries: readonly LedgerEntryInput[],
  direction: LedgerEntryDirection,
): bigint {
  return entries.reduce((sum, e) => (e.direction === direction ? sum + e.amountTiyin : sum), 0n);
}

/**
 * Balanslangan ledger tranzaksiyasini qurish.
 *
 * Tekshiruvlar (docs/09 §6.4 — DB trigger backstop, bu yerda birinchi
 * chiziq):
 *  1. kamida 2 yozuv (double-entry ta'rifi);
 *  2. har miqdor > 0n (nol/manfiy yozuv — ma'nosiz; manfiy miqdor
 *     o'rniga yo'nalish almashtiriladi);
 *  3. SUM(debit) === SUM(credit).
 *
 * Muvaffaqiyatda muzlatilgan nusxa qaytadi — chaqiruvchi keyin
 * o'zgartira olmaydi.
 */
export function buildLedgerTransaction(
  entries: readonly LedgerEntryInput[],
): readonly LedgerEntryInput[] {
  if (entries.length < 2) {
    throw new LedgerImbalanceError(
      `Ledger tranzaksiyasi kamida 2 yozuv talab qiladi, berildi: ${String(entries.length)}`,
      sumByDirection(entries, 'DEBIT'),
      sumByDirection(entries, 'CREDIT'),
    );
  }

  for (const entry of entries) {
    if (entry.amountTiyin <= 0n) {
      throw new LedgerImbalanceError(
        `Ledger yozuvi miqdori musbat bo'lishi shart: ${entry.account} = ` +
          entry.amountTiyin.toString(),
        sumByDirection(entries, 'DEBIT'),
        sumByDirection(entries, 'CREDIT'),
      );
    }
    if (!(entry.account in LEDGER_ACCOUNTS)) {
      // TS tipi buni bloklaydi, lekin runtime chegara (JSON'dan kelgan
      // qiymat) uchun ham himoya kerak.
      throw new LedgerImbalanceError(
        `Noma'lum ledger hisobi: ${entry.account}`,
        sumByDirection(entries, 'DEBIT'),
        sumByDirection(entries, 'CREDIT'),
      );
    }
  }

  const debit = sumByDirection(entries, 'DEBIT');
  const credit = sumByDirection(entries, 'CREDIT');
  if (debit !== credit) {
    throw new LedgerImbalanceError('Balanslanmagan ledger tranzaksiyasi', debit, credit);
  }

  return Object.freeze(entries.map((e) => Object.freeze({ ...e })));
}

/**
 * Teskari (reversing) yozuvlar — refund uchun.
 *
 * docs/09 §6.1 (2-sabab) va §8.2: xato/refund ASL yozuvni o'zgartirmaydi,
 * teskari yozuv QO'SHADI. DEBIT ↔ CREDIT almashadi, miqdor o'zgarmaydi —
 * natija ham balanslangan to'plam.
 */
export function reverseLedgerEntries(
  entries: readonly LedgerEntryInput[],
): readonly LedgerEntryInput[] {
  return buildLedgerTransaction(
    entries.map((e) => ({
      account: e.account,
      direction: e.direction === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
      amountTiyin: e.amountTiyin,
    })),
  );
}

/**
 * Provayder → pul tushadigan kassa hisobi (docs/09 §6.6
 * `provider:{code}:settlement` qatori, yassi kodda).
 */
export function cashAccountForProvider(provider: LedgerPaymentProvider): LedgerAccountCode {
  switch (provider) {
    case 'CLICK':
      return 'cash.click';
    case 'PAYME':
      return 'cash.payme';
    case 'UZUM':
      return 'cash.uzum';
    case 'BANK_TRANSFER':
      return 'cash.bank_transfer';
    case 'MANUAL':
      return 'cash.manual';
  }
}

/**
 * Turnir start puli to'lovi uchun yozuvlar to'plami — docs/09 §6.2
 * birinchi jadvali:
 *
 *   DR provider settlement (cash.*)      amount
 *   CR tournament entry_fees (liability) amount
 *
 * Start puli TASHKILOTCHIGA tegishli (docs/09 §6.6: liability) —
 * Farzin komissiyasi keyinroq alohida tranzaksiya bilan ushlanadi
 * (DR liability.organizer_payable / CR revenue.commission — payout
 * oqimi, Faza 4 davomi).
 */
export function buildEntryFeePaymentEntries(
  provider: LedgerPaymentProvider,
  amountTiyin: bigint,
): readonly LedgerEntryInput[] {
  return buildLedgerTransaction([
    { account: cashAccountForProvider(provider), direction: 'DEBIT', amountTiyin },
    { account: 'liability.organizer_payable', direction: 'CREDIT', amountTiyin },
  ]);
}
