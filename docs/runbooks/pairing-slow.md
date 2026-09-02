# FarzinPairingSlow — juftlashtirish sekinlashdi

> **severity: ticket** · SLO #4: ≤100 o'yinchili seksiyada p95 < 10 s

## Nimani anglatadi

`farzin_pairing_duration_seconds` p95 (kichik seksiyalar: `xs|s|m`
bucket'lari) 10 soniyadan oshdi.

Juftlashtirish — blossom (maksimal og'irlikli juftlik) algoritmi
ustidagi FIDE Dutch Swiss (C.04.3). U ataylab sof va deterministik
(`src/core/pairing/`), ya'ni tashqi bog'liqliksiz ishlaydi — sekinlik
KIRISH hajmidan yoki CPU'dan keladi.

## Ta'siri

Hakam turni boshlay olmaydi. Turnir kuni bu — zalda kutayotgan
o'yinchilar demakdir.

## Birinchi qadamlar

1. **Seksiya hajmini tekshiring** — alert faqat kichik/o'rta
   seksiyalarni qamraydi, ya'ni bu yerda sekinlik KUTILMAGAN:

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT s.id, s.name, COUNT(*) AS players
        FROM \"Section\" s JOIN \"Standing\" st ON st.\"sectionId\" = s.id
       GROUP BY s.id, s.name ORDER BY players DESC LIMIT 10;"
   ```

2. **CPU to'yinganmi:**

   ```bash
   bash ~/.claude/bin/vps run "docker stats --no-stream farzin-app"
   ```

3. **Bir vaqtda nechta juftlashtirish ketyapti** — bir nechta turnir
   bir paytda tur ochsa, ular bitta CPU uchun kurashadi:

   ```
   sum(rate(farzin_pairing_duration_seconds_count[5m]))
   ```

## Odatiy sabablar

| Belgi | Sabab | Chora |
|---|---|---|
| Faqat katta seksiyada | Kutilgan — alert `xs\|s\|m` bilan cheklangan, `l` bucket'ni tekshiring | — |
| Hamma seksiyada | CPU yetishmayapti | Replika / resurs |
| Bir turnirda | Buzuq kirish (masalan juda ko'p float) | `Standing` qatorlarini ko'rish |
| Yangi deploy'dan keyin | Regressiya | Property-test bilan mahalliy tekshirish |

## Muhim

**Vaqtni tejash uchun absolyut kriteriya tekshiruvini o'chirmang.**
Har juftlashtirishdan keyingi C1/C2/C3 qayta tekshiruvi — natijaning
FIDE'ga mosligini kafolatlaydi ([pairing-violation.md](pairing-violation.md)).

## Eskalatsiya

Turnir kuni bo'lsa darhol; aks holda ticket.
