# FarzinLedgerImbalance — debet ≠ kredit

> **severity: page.** Pul yo'qolgan yoki yo'qdan yaratilgan.
> Billing operatsiyalarini to'xtating.

## Nimani anglatadi

`farzin_ledger_imbalance_tiyin` gauge'i noldan farq qiladi. Ikki tomonlama
yozuv (ADR-0006) qoidasi bo'yicha har tranzaksiyada debet yig'indisi
kredit yig'indisiga TENG bo'lishi shart. Farq bo'lsa — yo pul yo'qolgan,
yo yo'qdan paydo bo'lgan.

Qiymat **tiyin**da (BIGINT). Pul hech qachon JS `number` sifatida
saqlanmaydi — bu ataylab (ADR-0006).

> Bu gauge ataylab oldindan nol bilan e'lon qilinmaydi
> (`metrics.service.ts`): qiymatning MAVJUDLIGI "tekshirildi" degani.
> Metrikaning yo'qligi — "hali tekshirilmagan", nol emas.

## Ta'siri

Moliyaviy hisobot noto'g'ri. Foydalanuvchi balansi noto'g'ri
ko'rsatilishi mumkin. Buxgalteriya uchun bu — hisobot buzilishi.

## Birinchi qadamlar

1. **Yangi to'lov operatsiyalarini to'xtating.** Provayder webhook'lari
   kelaversin (ular idempotent), lekin qo'lda hech narsa tasdiqlamang.

2. **Nomutanosiblik hajmini va yo'nalishini o'lchang:**

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE 0 END) AS debit,
             SUM(CASE WHEN direction='CREDIT' THEN amount ELSE 0 END) AS credit,
             SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) AS diff
        FROM \"LedgerEntry\";"
   ```

3. **Buzuq tranzaksiyani toping** — har `transactionId` bo'yicha:

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT \"transactionId\",
             SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) AS diff,
             MIN(\"createdAt\") AS at
        FROM \"LedgerEntry\" GROUP BY \"transactionId\"
       HAVING SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) <> 0
       ORDER BY at DESC LIMIT 20;"
   ```

4. **Qatorlarni O'CHIRMANG va TUZATMANG.** Ledger append-only. Tuzatish
   faqat KOMPENSATSIYA yozuvi bilan qilinadi va uni moliya mas'uli
   tasdiqlashi kerak.

## Sabab izlash

- Nomutanosiblik bitta `transactionId` da bo'lsa — o'sha operatsiyani
  yaratgan kod yo'lini toping (audit log `payload` da operatsiya turi bor).
- Ko'p tranzaksiyada bo'lsa — migratsiya yoki qo'lda SQL aralashgan
  bo'lishi mumkin. `audit_logs` ni ko'ring: u PostgreSQL trigger bilan
  o'zgarmas, ya'ni unga ishonish mumkin.

  ```bash
  bash ~/.claude/bin/vps sql farzin \
    "SELECT \"createdAt\", action, \"actorId\" FROM audit_logs
      WHERE action LIKE '%ledger%' OR action LIKE '%payment%'
      ORDER BY \"createdAt\" DESC LIMIT 40;"
  ```

## Eskalatsiya

Darhol: texnik rahbar va moliya mas'uli. Kompensatsiya yozuvini
dasturchi YOLG'IZ kiritmaydi.

## Nega `abs(...) > 0`

Chegara yo'q. "Kichik nomutanosiblik" degan tushuncha ikki tomonlama
yozuvda mavjud emas — u yo nol, yo xato.
