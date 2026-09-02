# FarzinClockDriftHigh — taymer drifti yuqori

> **severity: ticket.** Lekin bu ADOLAT masalasi — o'yinchi haqsiz vaqt
> yo'qotishi mumkin.

## Nimani anglatadi

`farzin_clock_drift_seconds` — flag taymeri **kutilgan** uyg'onish payti
bilan **haqiqiy** uyg'onish payti orasidagi farq. p99 > 100 ms.

O'lchov joyi: `play.service.checkFlag(gameId, expectedWakeAtMs)` —
taymer uyg'onganda `|now - expectedWakeAtMs|` yoziladi.

**NIMA O'LCHANMAYDI:** o'yinchining qurilma soati bilan server soati
orasidagi farq. Buning uchun klient timestamp'i kerak, u ishonchsiz va
protokolda yo'q (docs/07 §3.3). Ya'ni bu metrika SERVER tomonidagi
kechikishni ko'rsatadi, klientnikini emas.

## Nega bu adolat masalasi

Bullet o'yinda 100 ms — sezilarli. Drift kattalashsa, flag kech e'lon
qilinadi va o'yinchi haqiqatda tugagan vaqtdan keyin ham yurishi mumkin
(yoki teskarisi). docs/14 Faza 5 xavflar jadvalida bu "juda yuqori
ta'sir" deb belgilangan.

Yumshatuvchi omil: soatning O'ZI Redis'da avtoritativ va `checkFlag`
uni qayta o'qiydi — ya'ni drift **e'lon vaqtiga** ta'sir qiladi,
hisoblangan qolgan vaqtga emas.

## Birinchi qadamlar

1. **Qaysi kategoriya** — alert yorlig'ida `game_type` bor. Bullet'da
   muhimroq.

2. **Event loop bandmi:**

   ```
   rate(nodejs_eventloop_lag_seconds_sum[5m]) / rate(nodejs_eventloop_lag_seconds_count[5m])
   ```

   Lag yuqori bo'lsa — CPU to'yingan yoki sinxron og'ir ish bor
   (masalan katta juftlashtirish hisobi bir vaqtda ketyapti:
   [pairing-slow.md](pairing-slow.md)).

3. **Redis kechikishi:**

   ```bash
   bash ~/.claude/bin/vps run "docker exec farzin-redis redis-cli --latency-history -i 5"
   ```

4. **Instansiya soni va yuk** — bitta node ko'p o'yinni tortayotgan
   bo'lishi mumkin:

   ```
   farzin_active_games{type="online"}
   farzin_websocket_connections{namespace="play"}
   ```

## Tuzatish yo'llari

| Sabab | Chora |
|---|---|
| CPU to'yingan | Replika qo'shish (HPA `farzin_active_games` bo'yicha) |
| Og'ir sinxron ish | Juftlashtirishni worker'ga ko'chirish |
| Redis sekin | Redis resursini oshirish / tarmoqni tekshirish |
| GC pauzalari | Heap profilini olish, xotira chegarasini sozlash |

## Eskalatsiya

Turnir kuni bo'lsa — darhol texnik rahbarga. Oddiy kunda ticket.
