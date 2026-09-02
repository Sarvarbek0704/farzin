# FarzinRatingPeriodLagHigh — reyting davri kechikdi

> **severity: ticket**

## Nimani anglatadi

`farzin_rating_period_lag_seconds > 7200` — davr tugaganidan beri 2
soatdan ortiq vaqt o'tdi, lekin hisob (compute) bajarilmadi.

Glicko-2 **davriy** reyting tizimi (docs/06): o'yinlar davr ichida
to'planadi va davr oxirida BIR MARTA hisoblanadi. Kechikish reytingni
buzmaydi — u faqat eskiradi.

## Ta'siri

O'yinchilar yangi reytingni ko'rmaydi. Turnir seedingi eski reytingga
tayanadi. Ma'lumot YO'QOLMAYDI.

## Birinchi qadamlar

1. **Qaysi davr kechikkan:**

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT id, environment, \"timeCategory\", status, \"startsAt\", \"endsAt\"
        FROM \"RatingPeriod\" WHERE status <> 'PUBLISHED'
        ORDER BY \"endsAt\" ASC LIMIT 10;"
   ```

2. **Worker tirikmi** (compute worker'da bajariladi):

   ```bash
   bash ~/.claude/bin/vps ps farzin
   bash ~/.claude/bin/vps logs farzin-worker 200
   ```

3. **BullMQ navbati:**

   ```bash
   bash ~/.claude/bin/vps run "docker exec farzin-redis redis-cli --scan --pattern 'bull:*' | head -20"
   ```

4. **Qo'lda ishga tushirish** (admin token bilan):

   ```
   POST /api/v1/rating-periods/<ID>/compute
   ```

   Natijani E'LON QILISHDAN OLDIN konvergensiya alertini tekshiring:
   [glicko-convergence.md](glicko-convergence.md).

## Odatiy sabablar

| Belgi | Sabab |
|---|---|
| Worker konteyneri yo'q | Deploy/restart muammosi |
| Navbat to'lgan | Boshqa og'ir job bloklab turibdi |
| Compute xato bilan tugagan | Loglarda `glicko` yoki `rating` xatosi |

## Eskalatsiya

Ish vaqtida. 24 soatdan oshsa — texnik rahbarga.
