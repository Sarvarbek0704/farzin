# FarzinTargetDown — scrape javob bermayapti

> **severity: page.** Bu alert boshqa alertlarning ISHONCHLILIGI uchun
> majburiy: metrikalar yo'qolsa, qolgan hamma alert JIM bo'ladi.

## Nimani anglatadi

`up{job=~"farzin-.*"} == 0` — Prometheus target'dan metrika yig'a
olmayapti 2 daqiqadan beri.

Ikki ehtimol:

1. **Ilova yiqilgan** — u holda foydalanuvchi ham ta'sirlangan.
2. **Faqat scrape yo'li buzilgan** — ilova ishlaydi, lekin ko'r holatda
   qolamiz. Bu ham xavfli: ledger nomutanosibligi ham, juftlashtirish
   buzilishi ham SEZILMAY qoladi.

## Birinchi qadamlar

1. **Ilova tirikmi:**

   ```bash
   bash ~/.claude/bin/vps ps farzin
   bash ~/.claude/bin/vps run "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health/live"
   ```

2. **`/metrics` javob beryaptimi** — u autentifikatsiya bilan himoyalangan
   (JIDDIY-2), ya'ni tokensiz 401 KUTILADI:

   ```bash
   bash ~/.claude/bin/vps run "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/metrics"
   ```

   - `401` — endpoint tirik, muammo Prometheus tomonida (token/konfig).
   - `000` yoki ulanish xatosi — ilova yo'q yoki portni tinglamayapti.

3. **Konteyner holati va restart tarixi:**

   ```bash
   bash ~/.claude/bin/vps run "docker inspect --format '{{.State.Status}} restarts={{.RestartCount}}' farzin-app"
   bash ~/.claude/bin/vps logs farzin 200
   ```

4. **Resurs tugamaganmi** — disk to'lishi eng tez-tez uchraydigan sabab:

   ```bash
   bash ~/.claude/bin/vps status
   ```

## Agar ilova tirik, faqat scrape buzilgan bo'lsa

- Prometheus konfiguratsiyasidagi target manzilini tekshiring
  (`docker/prometheus/prometheus.yml`).
- `/metrics` uchun bearer token to'g'ri berilganini tekshiring
  (`METRICS_TOKEN`). Tokenni **logga yoki chatga ko'chirmang** — faqat
  mavjudligini tasdiqlang.

## Muhim

Bu alert ochiq turganda **boshqa alertlarning jimligi "hammasi joyida"
degani EMAS**. Target tiklangunicha domen holatini qo'lda tekshiring:

```bash
bash ~/.claude/bin/vps sql farzin "SELECT COUNT(*) FROM \"OnlineGame\" WHERE status='ACTIVE';"
```

## Eskalatsiya

Darhol. 15 daqiqada tiklanmasa — texnik rahbar.
