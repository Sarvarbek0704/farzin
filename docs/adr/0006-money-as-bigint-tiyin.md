# ADR-0006 — Pul: BigInt, tiyinda. Float hech qachon

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15

## Kontekst

Farzin pul bilan ishlaydi: turnir start puli, klub obunasi, maktab shartnomasi, murabbiy to'lovi ([09-payments-and-billing.md](../09-payments-and-billing.md)).

Valyuta — UZS (so'm). Eng mayda birlik — tiyin (1 so'm = 100 tiyin).

> Amalda tiyin muomaladan chiqqan — narxlar butun so'mda. Lekin bu **ichki hisob birligini tanlashga ta'sir qilmaydi**: komissiya hisobi (masalan 2.5%) kasr qiymat beradi va uni biror joyda saqlash kerak.

## Qaror

**Ichki hisob va saqlash: `BigInt`, tiyinda.**

```prisma
entryFeeAmount   BigInt?  @map("entry_fee_amount")   // 50000 UZS → 5_000_000n
entryFeeCurrency String   @default("UZS")
```

**Float hech qachon. Hech qayerda. Hech qanday sababga ko'ra.**

Valyuta **har doim** alohida ustunda. Qiymat valyutasiz ma'nosiz.

## Sabablar

### Float nima uchun jinoyat

IEEE 754 ikkilik kasr. `0.1` ikkilik sistemada aniq ifodalanmaydi — xuddi `1/3` o'nlikda `0.333...` bo'lgani kabi.

```js
0.1 + 0.2                    // 0.30000000000000004
0.1 + 0.2 === 0.3            // false
(0.1 + 0.2).toFixed(2)       // "0.30"  ← xato yashirindi, yo'qolmadi

// Real misol — 1000 ta tranzaksiya:
let total = 0;
for (let i = 0; i < 1000; i++) total += 0.1;
total                        // 99.9999999999986
total === 100                // false
```

Buxgalteriyada bu **balans mos kelmaydi** degani. Va xato jimgina to'planadi — hech kim sezmaydi, toki soliq tekshiruvi kelguncha.

`toFixed()` — xatoni **yashiradi**, tuzatmaydi. Ko'rsatish uchun to'g'ri, hisob uchun halokatli.

### Nega BigInt

| Yondashuv | Baho |
|---|---|
| `Float` / `Double` | ❌ Yuqorida asoslangan |
| `Decimal` (PostgreSQL `NUMERIC`) | ✅ To'g'ri, lekin JS'da `Decimal` obyekti kerak (Prisma `Decimal.js` beradi) |
| `BigInt` + eng mayda birlik | ✅ **Tanlandi** |
| `Integer` + eng mayda birlik | ⚠️ 32-bit → maksimum ~21 mln so'm. Yetarli emas |

`BigInt` + tiyin ustunligi:
- **Yaxlitlash muammosi umuman yo'q** — tiyindan mayda birlik yo'q, demak kasr paydo bo'lmaydi
- JS'da native tip, kutubxona kerak emas
- Arifmetika oddiy: `+`, `-`, `*` to'g'ridan-to'g'ri ishlaydi
- Chegara amalda cheksiz (2⁶³ tiyin ≈ 92 kvadrillion so'm)

`Decimal` ham to'g'ri javob bo'lardi. `BigInt` tanlandi, chunki oddiyroq: `Decimal.js` API'sini o'rganish va har amalda `.plus()`, `.times()` yozish shart emas.

### Bo'lish — yagona xavfli joy

Qo'shish va ayirish xavfsiz. **Bo'lish** kasr beradi:

```ts
// Komissiya 2.5%
const fee = amount * 25n / 1000n;  // ← BigInt bo'lishi KESADI (truncate), yaxlitlamaydi
```

`BigInt` bo'lishi nolga tomon kesadi. Ya'ni `7n / 2n === 3n` (3.5 emas).

Shuning uchun yaxlitlash **aniq belgilanadi**:

```ts
/** Yuqoriga yaxlitlash bilan foiz hisobi. Komissiya har doim bizning foydamizga yaxlitlanadi. */
function percentageOf(amount: bigint, basisPoints: bigint): bigint {
  const product = amount * basisPoints;
  const divisor = 10_000n;
  // Yuqoriga yaxlitlash: (a + b - 1) / b
  return (product + divisor - 1n) / divisor;
}
```

**Qoida:** har bir bo'lish operatsiyasi yonida yaxlitlash yo'nalishi **komment bilan** asoslanadi. Bu kod review'da majburiy tekshiriladi.

Va **eng muhimi:** bo'lish natijasida yo'qolgan tiyin **hech qayerga yo'qolmasligi kerak**. Split payment'da (murabbiy marketplace) 3 kishiga bo'linsa va 1 tiyin ortib qolsa — u kimgadir berilishi kerak, yo'q bo'lib ketmasligi. Bu ledger invariantida tekshiriladi: `SUM(debit) === SUM(credit)`.

### Nega valyuta alohida ustun

`50000` — bu nima? 50 000 so'mmi, 50 000 dollarmi?

Qiymat valyutasiz ma'nosiz. Va turli valyutadagi qiymatlarni **qo'shib bo'lmaydi** — bu tip xatosi.

Hozircha faqat UZS. Lekin xalqaro turnir (Toshkent FIDE tadbirlarini qabul qiladi) USD/EUR talab qilishi mumkin. Ustun bugundan bor.

### Ko'rsatish

Bo'lish **faqat presentation qatlamida**:

```ts
// ❌ Domen qatlamida hech qachon
const som = Number(amountTiyin) / 100;

// ✅ Faqat ko'rsatishda
export function formatMoney(amount: bigint, currency: string, locale: string): string {
  const major = amount / 100n;
  const minor = amount % 100n;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(Number(`${major}.${minor.toString().padStart(2, '0')}`));
}
```

`Number()` ga o'tkazish **faqat shu yerda** ruxsat etiladi, chunki natija ko'rsatiladi va qayta hisobga kirmaydi.

## Oqibatlar

**Ijobiy:**
- Yaxlitlash xatosi tuzilmaviy jihatdan **imkonsiz**
- Buxgalteriya bilan solishtirish aniq
- Ledger invarianti (`SUM(debit) === SUM(credit)`) har doim bajariladi

**Salbiy:**
- **`BigInt` JSON'da serializatsiya qilinmaydi** — `JSON.stringify(1n)` xato tashlaydi. Global serializer kerak:
  ```ts
  // main.ts
  (BigInt.prototype as any).toJSON = function () { return this.toString(); };
  ```
  API'da pul **string** sifatida qaytadi: `"entryFeeAmount": "5000000"`. Bu ataylab — JS'da `Number` 2⁵³ dan katta butun sonni yo'qotadi.
- Har joyda `n` suffiksi va `BigInt()` konversiyasi — kod biroz shovqinli
- Aralashtirib bo'lmaydi: `1n + 1` → `TypeError`. Bu **yaxshi** (xato erta chiqadi), lekin o'rganish kerak
- Prisma `BigInt` ni qaytarganda JS `bigint` beradi — DTO'da to'g'ri o'giriladi

## Majburlash

Bu ADR niyat bilan emas, **CI bilan** majburlanadi:

- ESLint qoidasi: `prisma/schema.prisma` da pul maydonlarida `Float` ishlatish taqiqlanadi
- Kod review checklist: har bo'lish operatsiyasida yaxlitlash asoslanganmi
- Property-based test: tasodifiy summalar bilan ledger balansi doim mos kelishi

## Havolalar

- [03-data-model.md §1.2](../03-data-model.md#12-nega-pul-bigint-va-tiyinda)
- [09-payments-and-billing.md](../09-payments-and-billing.md)
- Martin Fowler — "Money" pattern (Patterns of Enterprise Application Architecture)
