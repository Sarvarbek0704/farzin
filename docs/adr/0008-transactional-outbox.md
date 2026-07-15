# ADR-0008 — Kritik event'lar uchun transactional outbox

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15

## Kontekst

Modullar bir-biri bilan domain event orqali gaplashadi ([02-architecture.md §6.2](../02-architecture.md#62-asinxron--domain-event)).

NestJS `EventEmitter2` beradi — oddiy, tez, in-process. Lekin u **DB tranzaksiyasi bilan atomik emas**.

## Muammo

```ts
// ❌ Buzuq
await prisma.$transaction(async (tx) => {
  await tx.payment.update({ where: { id }, data: { status: 'PAID' } });
});
// ← process shu yerda yiqilsa?
eventEmitter.emit('PaymentCompleted', { paymentId });
```

Natija: to'lov `PAID`, lekin `PaymentCompleted` hech qachon chiqmaydi → obuna faollashmaydi.

**Mijoz pul to'ladi, xizmat olmadi.** Va bu holat log'da ham ko'rinmaydi — hech qanday xato yo'q.

Tartibni almashtirsak ham yordam bermaydi:

```ts
// ❌ Bu ham buzuq — teskari tomondan
eventEmitter.emit('PaymentCompleted', { paymentId });
await prisma.$transaction(...);  // ← bu yiqilsa?
```

Natija: obuna faollashdi, lekin to'lov yozilmadi. **Bepul xizmat.**

Bu klassik **dual write problem**: ikki tizimga (DB va event bus) atomik yozib bo'lmaydi.

## Qaror

**Kritik event'lar uchun transactional outbox.**

Event DB tranzaksiyasi **ichida** `outbox_events` jadvaliga yoziladi. Alohida worker uni o'qib publish qiladi.

```ts
// ✅ Atomik
await prisma.$transaction(async (tx) => {
  await tx.payment.update({ where: { id }, data: { status: 'PAID' } });
  await tx.outboxEvent.create({
    data: {
      eventType: 'PaymentCompleted',
      aggregateType: 'Payment',
      aggregateId: id,
      payload: { paymentId: id, amount: amount.toString() },
    },
  });
});
// Ikkalasi ham commit bo'ladi yoki ikkalasi ham bo'lmaydi.
```

Worker:

```ts
// Har 500ms
const events = await prisma.outboxEvent.findMany({
  where: { status: 'PENDING', availableAt: { lte: new Date() } },
  orderBy: { id: 'asc' },   // UUID v7 → yaratilish tartibi
  take: 100,
});

for (const event of events) {
  try {
    await eventBus.publish(event);
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  } catch (err) {
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        attempts: { increment: 1 },
        lastError: String(err),
        availableAt: backoff(event.attempts),  // eksponensial
      },
    });
  }
}
```

## Qaysi event'lar outbox talab qiladi

**Bu ro'yxat qat'iy.** Hamma event outbox'ga o'tkazilsa — keraksiz murakkablik va DB yuklamasi.

| Event | Outbox? | Sabab |
|---|---|---|
| `PaymentCompleted` | **Ha** | Pul. Yo'qolsa mijoz zarar ko'radi |
| `RefundIssued` | **Ha** | Pul |
| `RoundCompleted` | **Ha** | Juftlashtirishni ishga tushiradi. Yo'qolsa turnir to'xtaydi |
| `RatingRecomputed` | **Ha** | Sport natijasi |
| `FairPlayCaseOpened` | **Ha** | Odamning karyerasi |
| `PlayerProfileUpdated` | Yo'q | Yo'qolsa dunyo qulamaydi |
| `PuzzleSolved` | Yo'q | Statistika |
| `UserLoggedIn` | Yo'q | Audit log alohida yoziladi |

**Mezon:** event yo'qolsa **pul, sport natijasi yoki odamning huquqi** zarar ko'radimi? Ha bo'lsa — outbox.

## At-least-once — va uning narxi

Outbox **at-least-once** kafolat beradi, exactly-once **emas**.

Ssenariy: worker event'ni publish qildi, lekin `status: 'PUBLISHED'` yozishdan oldin yiqildi → keyingi poll'da **ikkinchi marta** publish qiladi.

Exactly-once distributed tizimda **printsipial imkonsiz** (two generals problem). Buni yamashga urinish — vaqt isrofi.

**Shuning uchun: har bir event handler idempotent bo'lishi SHART.**

Bu tavsiya emas, **arxitektura talabi**. Handler ikki marta chaqirilganda natija bir xil bo'lishi kerak:

```ts
// ❌ Idempotent emas
async onPaymentCompleted(e: PaymentCompletedEvent) {
  await this.subscription.extend(e.subscriptionId, 30);  // ikki marta = 60 kun!
}

// ✅ Idempotent
async onPaymentCompleted(e: PaymentCompletedEvent) {
  const already = await this.processed.exists(e.eventId);
  if (already) return;
  await prisma.$transaction(async (tx) => {
    await this.subscription.extendTo(tx, e.subscriptionId, e.periodEnd);  // absolyut, nisbiy emas
    await this.processed.mark(tx, e.eventId);
  });
}
```

Ikki texnika:
1. **Ishlangan event'lar jurnali** — `eventId` bo'yicha tekshirish
2. **Absolyut operatsiya** — `extendTo(date)`, `extend(+30 days)` emas. Absolyut operatsiya tabiatan idempotent

Ikkinchisi afzal: qo'shimcha jadval kerak emas.

## Tartib (ordering) kafolati

Outbox `ORDER BY id` bilan o'qiydi. UUID v7 vaqt bo'yicha tartiblangani uchun ([ADR-0005](./0005-uuid-v7-primary-keys.md)) bu **yaratilish tartibi**.

**Lekin:** bir nechta worker parallel ishlasa, tartib buziladi.

Hozircha: **bitta worker**. Yetarli — outbox hajmi kichik (kritik event'lar kam).

Kelajakda kerak bo'lsa: `aggregateId` bo'yicha partitioning (bir aggregate'ning event'lari bitta worker'ga). Bu `SELECT ... FOR UPDATE SKIP LOCKED` bilan qilinadi.

## Oqibatlar

**Ijobiy:**
- Dual write problem hal qilingan
- Event yo'qolmaydi — DB'da turadi
- Retry tabiiy (worker qayta uriniladi)
- Debug oson: `outbox_events` jadvalini ko'rish mumkin — qaysi event chiqmagan, nega
- Failed event'lar ko'rinadi va alert qilinadi

**Salbiy:**
- **Kechikish** — event darhol emas, poll oralig'ida (500ms) chiqadi. Real-time oqim uchun yaramaydi (shuning uchun WebSocket alohida)
- Qo'shimcha jadval, qo'shimcha worker, qo'shimcha monitoring
- **Har handler idempotent bo'lishi shart** — bu doimiy intizom talab qiladi
- `outbox_events` o'sadi → tozalash job kerak (PUBLISHED event'lar 7 kundan keyin o'chiriladi)
- Poll — DB'ga doimiy yuklama (har 500ms `SELECT`). Index bilan arzon, lekin nol emas

## Alternativalar

| Variant | Nega rad etildi |
|---|---|
| **Oddiy `EventEmitter2`** | Dual write problem — yuqorida asoslangan. **Kritik bo'lmagan event'lar uchun ishlatiladi** |
| **CDC** (Debezium + Kafka) | To'g'ri va kuchli, lekin Kafka + Debezium infrastrukturasi. Bir kishilik jamoa uchun bu ortiqcha |
| **`LISTEN`/`NOTIFY`** (PostgreSQL) | Poll'siz, tez. Lekin **kafolatsiz** — tinglovchi yo'q bo'lsa xabar yo'qoladi. Aynan hal qilmoqchi bo'lgan muammomiz |
| **Two-phase commit** | DB va event bus orasida. Sekin, murakkab, ko'p tizim qo'llab-quvvatlamaydi |
| **Hamma event outbox'da** | Keraksiz yuklama. Kritik bo'lmagan event uchun kechikish va murakkablik o'zini oqlamaydi |

## Havolalar

- [02-architecture.md §6.2](../02-architecture.md#62-asinxron--domain-event)
- [03-data-model.md §3.6](../03-data-model.md#36-transactional-outbox--nega-kerak)
- Chris Richardson — "Transactional Outbox Pattern"
- Gregor Hohpe — Enterprise Integration Patterns
