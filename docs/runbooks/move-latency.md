# FarzinMoveProcessingSlow — yurish qayta ishlash sekinlashdi

> **severity: ticket** · SLO #2: p95 < 150 ms (docs/15 §6.2)

## Nimani anglatadi

`farzin_move_processing_duration_seconds` — `game:move` niyati kelganidan
javob (ack + broadcast) tayyor bo'lgunicha o'tgan vaqt. p95 > 150 ms.

Yurish quvuri (docs/07 §5.2): vaqt o'lchash → rol → holat → navbat →
soat (flag) → qonuniylik → o'yin oxiri → PostgreSQL (atomik) → Redis
soat → broadcast.

## Ta'siri

O'yin "og'ir" his qilinadi. Bullet va blitsda bu to'g'ridan-to'g'ri
o'yin sifatiga ta'sir qiladi, chunki o'yinchi javobni kutib turadi.

## Birinchi qadamlar

1. **Qaysi bosqich sekin** — DB yozuvi eng ehtimolli nomzod:

   ```
   histogram_quantile(0.95, sum(rate(farzin_db_query_duration_seconds_bucket[5m])) by (le))
   ```

2. **PostgreSQL holati:**

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT state, COUNT(*) FROM pg_stat_activity WHERE datname='farzin' GROUP BY state;"
   bash ~/.claude/bin/vps sql farzin \
     "SELECT pid, now()-query_start AS dur, LEFT(query,80) FROM pg_stat_activity
       WHERE datname='farzin' AND state='active' ORDER BY dur DESC LIMIT 10;"
   ```

3. **Event loop lag** — CPU to'yinganini ko'rsatadi:

   ```
   rate(nodejs_eventloop_lag_seconds_sum[5m]) / rate(nodejs_eventloop_lag_seconds_count[5m])
   ```

4. **Yuk darajasi:**

   ```
   farzin_active_games{type="online"}
   sum(rate(farzin_moves_total[1m]))
   ```

## Odatiy sabablar

| Belgi | Sabab | Chora |
|---|---|---|
| DB p95 ham yuqori | Sekin so'rov / indeks yo'q | `EXPLAIN ANALYZE`, indeks |
| DB tez, lekin move sekin | Event loop band | Replika qo'shish |
| Faqat cho'qqi paytda | Yetarsiz resurs | HPA chegarasini pasaytirish |
| Barqaror yomonlashuv | Move jadvali o'sib ketgan | Partitsiya/arxiv rejasi |

## Nima QILMASLIK kerak

Validatsiyani "tezlashtirish uchun" o'chirib qo'ymang. Server yagona
hakam (docs/07 §2) — qonuniylik tekshiruvini yengillashtirish
xavfsizlik teshigi ochadi.

## Eskalatsiya

Ticket. Turnir kuni yoki p95 > 500 ms bo'lsa — darhol.
