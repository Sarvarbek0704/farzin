# FarzinApiErrorBudgetBurn{Fast,Slow} — API xato budjeti yonyapti

> **Fast: page** (14.4×, budget ~2 kunda tugaydi) ·
> **Slow: ticket** (6×, tunda uyg'otmaydi)

## Nimani anglatadi

SLO: API mavjudligi **99.5%** (30 kunlik oyna). Xato budjeti — 0.5%.
`farzin:api_availability:ratio_rate5m|1h|6h` recording qoidalari 5xx
javoblar ulushini o'lchaydi.

- **Fast** — ikki oynali shart (5m VA 1h). Ikkalasi ham buzilishi
  kerak: qisqa sakrash yolg'on alert bermaydi.
- **Slow** — 6h oynasi. Sekin oqayotgan xato.

## Birinchi qadamlar

1. **Xato qayerdan kelayotganini ko'ring** — route va status bo'yicha:

   ```
   sum(rate(http_requests_total{status=~"5.."}[5m])) by (route, status)
   ```

2. **Target tirikmi:**

   ```bash
   bash ~/.claude/bin/vps status
   bash ~/.claude/bin/vps ps farzin
   ```

3. **Loglardagi birinchi xatoni toping** (RFC 9457 `traceId` bilan):

   ```bash
   bash ~/.claude/bin/vps logs farzin 300 | grep -iE "error|5[0-9][0-9]" | head -40
   ```

4. **Bog'liqliklarni tekshiring** — 5xx ning eng tez-tez sababi tashqi
   qism:

   ```bash
   bash ~/.claude/bin/vps db farzin          # Postgres holati
   bash ~/.claude/bin/vps run "docker exec farzin-redis redis-cli PING"
   ```

## Odatiy sabablar

| Belgi | Sabab | Qadam |
|---|---|---|
| Bitta route'da 5xx | Yangi deploy | Oldingi image'ga qaytarish |
| Hamma route'da 5xx | DB/Redis yo'q | Bog'liqlikni tiklash |
| Asta o'sib boruvchi | Ulanish hovuzi tugagan / xotira oqishi | Restart + profil |
| `/api/v1/play/*` da | WS/soat yo'li | [move-latency.md](move-latency.md) |

## Xato budjeti tugaganda

Budget tugasa (docs/15 §6.3): **yangi funksiya deploy qilinmaydi**,
faqat barqarorlik ishlari. Bu texnik qaror emas, mahsulot qarori —
uni rahbar bilan kelishing.

## Eskalatsiya

Fast: darhol navbatchi → texnik rahbar (30 daqiqada yechim bo'lmasa).
Slow: ish vaqtida ticket.
