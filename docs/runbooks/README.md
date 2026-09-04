# Runbook'lar

`infra/prometheus/farzin-rules.yml` dagi har bir alert shu papkadagi
faylga `runbook_url` bilan ishora qiladi. Qoida (docs/15 §6.5, 4-band):
**runbook'siz alert qo'shilmaydi** — chunki tunda uyg'ongan navbatchi
alert nomidan emas, runbook'dan foydalanadi.

## Runbook nima uchun kerak

Alert faqat "nimadir buzildi" deydi. Runbook uchta savolga javob beradi:

1. **Bu nimani anglatadi** — qaysi metrika, qaysi kod yo'li, qanday
   foydalanuvchi ta'siri.
2. **Birinchi navbatda nima qilish** — aniq buyruqlar, taxminlar emas.
3. **Qachon eskalatsiya** — va kimga.

## Umumiy tamoyillar

- **Avval ta'sirni to'xtat, keyin sababni izla.** Reyting e'lon
  qilinmasin, to'lov qabul qilinmasin, turnir davom etmasin — bularning
  hammasi orqaga qaytarish qiyin bo'lgan qadamlar.
- **Ma'lumotni o'chirma.** Diagnostika uchun kerak bo'ladi va audit log
  append-only (`audit_logs` trigger) — undan foydalaning.
- **`vps` skripti bilan ishlang** (`~/.claude/bin/vps`): bitta serverda
  ko'p loyiha bor, konteyner va DB nomini ANIQ ko'rsating.

## Alert → runbook xaritasi

| Alert                                   | Runbook                                        | Jiddiylik     |
| --------------------------------------- | ---------------------------------------------- | ------------- |
| `FarzinApiErrorBudgetBurnFast` / `Slow` | [api-errors.md](api-errors.md)                 | page / ticket |
| `FarzinPairingCriteriaViolation`        | [pairing-violation.md](pairing-violation.md)   | **page**      |
| `FarzinLedgerImbalance`                 | [ledger-imbalance.md](ledger-imbalance.md)     | **page**      |
| `FarzinGlickoConvergenceFailure`        | [glicko-convergence.md](glicko-convergence.md) | **page**      |
| `FarzinTargetDown`                      | [target-down.md](target-down.md)               | **page**      |
| `FarzinRatingPeriodLagHigh`             | [rating-period-lag.md](rating-period-lag.md)   | ticket        |
| `FarzinPairingSlow`                     | [pairing-slow.md](pairing-slow.md)             | ticket        |
| `FarzinClockDriftHigh`                  | [clock-drift.md](clock-drift.md)               | ticket        |
| `FarzinPaymentFailureRateHigh`          | [payment-failures.md](payment-failures.md)     | ticket        |
| `FarzinMoveProcessingSlow`              | [move-latency.md](move-latency.md)             | ticket        |

## Jiddiylik nimani anglatadi

- **page** — darhol, tunda ham. Ma'lumot yaxlitligi yoki pul xavf ostida.
- **ticket** — ish vaqtida. Sifat pasaygan, lekin buzilmagan.

Bu ajratish ataylab qat'iy: hamma narsani "page" qilish navbatchini
alertga befarq qiladi va HAQIQIY page o'tkazib yuboriladi.

## Alertga bog'lanmagan runbook'lar

Bular alertdan kelib chiqmaydi — ular **rejalashtirilgan ish** uchun.

| Runbook                | Qachon                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| [deploy.md](deploy.md) | Birinchi deploy, yangilanish, rollback, zaxira nusxa va **birinchi superadminni tayinlash** |
