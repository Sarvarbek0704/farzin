# FarzinPaymentFailureRateHigh — to'lov xatosi 5% dan oshdi

> **severity: ticket** · yorliq: `{{ $labels.provider }}` (Click / Payme)

## Nimani anglatadi

`farzin_payment_failures_total / farzin_payment_attempts_total` provayder
kesimida 15 daqiqalik oynada 5% dan oshdi.

## Ta'siri

Foydalanuvchi turnirga ro'yxatdan o'ta olmaydi yoki obuna to'lay olmaydi.
Bu to'g'ridan-to'g'ri daromadga tegadi va qo'llab-quvvatlashga murojaat
oqimini oshiradi.

## Birinchi qadamlar

1. **Bitta provayderdami yoki ikkalasidami:**

   ```
   sum(rate(farzin_payment_failures_total[15m])) by (provider, reason)
   ```

   Ikkalasida ham bo'lsa — muammo BIZDA. Bittasida — provayderda.

2. **Provayder holati** — Click/Payme status sahifasi va oxirgi
   webhook'lar:

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT provider, status, COUNT(*) FROM \"Payment\"
       WHERE \"createdAt\" > now() - interval '1 hour'
       GROUP BY provider, status ORDER BY 3 DESC;"
   ```

3. **Webhook imzosi rad etilyaptimi** — bu eng tez-tez uchraydigan
   "bizning tomon" sababi (kalit almashtirilgan/muddati o'tgan):

   ```bash
   bash ~/.claude/bin/vps logs farzin 300 | grep -iE "webhook|signature|imzo"
   ```

   Kalitni loglarga yoki chatga **ko'chirmang** — faqat qaysi fayl va
   qaysi env o'zgaruvchi ekanini ayting.

4. **Outbox oqmayaptimi** (tranzaksion outbox, ADR-0008):

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT status, COUNT(*) FROM outbox_messages GROUP BY status;"
   ```

## Muhim qoidalar

- **Pulni qo'lda "tuzatmang".** Har tuzatish ledger yozuvi orqali
  bo'ladi ([ledger-imbalance.md](ledger-imbalance.md)).
- **Webhook'lar idempotent** — takroriy kelishi normal, ularni
  bloklamang.
- To'lov muvaffaqiyatsiz bo'lsa foydalanuvchi qayta urinishi mumkin;
  ikki marta yechilishdan idempotentlik kaliti himoya qiladi.

## Eskalatsiya

Provayder tomonida bo'lsa — ularning qo'llab-quvvatlashiga murojaat va
foydalanuvchilarga xabar. Bizda bo'lsa — texnik rahbar.
