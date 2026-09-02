# FarzinPairingCriteriaViolation — FIDE absolyut kriteriyasi buzildi

> **severity: page.** Bu loyihadagi ENG YUQORI prioritetli alert.
> Turnirni davom ettirmang.

## Nimani anglatadi

`farzin_pairing_criteria_violations_total{criterion}` hisoblagichi
ko'tarildi. U FAQAT bitta joyda ko'tariladi: juftlashtirish natijasi
chiqarilgandan keyin FIDE C.04.3 **absolyut** kriteriyalari qayta
tekshirilganda va ular buzilganda.

Absolyut kriteriyalar (`docs/05-pairing-engine.md`):

| `criterion` | Ma'nosi |
|---|---|
| `C1` | Ikki o'yinchi bir-biri bilan IKKI MARTA o'ynay olmaydi |
| `C2` | Bir rangda uch marta ketma-ket o'ynash mumkin emas |
| `C3` | Rang farqi ±2 dan oshmasligi kerak |

Bular "afzallik" emas — FIDE ularni **buzib bo'lmaydigan** deb
belgilaydi. Buzilgan juftlashtirish bilan o'tkazilgan turnir natijasi
rasmiy emas.

## Ta'siri

Turnir natijasi FIDE qoidalariga mos emas. Reyting hisobiga kirsa,
xato o'yinchilar reytingiga TARQALADI va orqaga qaytarish qiyin.

## Birinchi qadamlar

1. **Turnirni to'xtating.** Keyingi tur juftlashtirilmasin.

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT id, name, status FROM \"Tournament\" WHERE status = 'IN_PROGRESS';"
   ```

2. **Qaysi tur ekanini aniqlang** — alert yorlig'idagi `criterion` va
   loglar:

   ```bash
   bash ~/.claude/bin/vps logs farzin 300 | grep -i "criteria\|pairing"
   ```

3. **Juftliklarni ko'ring** (natija kiritilgunicha ular hali
   o'zgartirilishi mumkin):

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT r.number, p.\"whitePlayerId\", p.\"blackPlayerId\", p.result
        FROM \"Pairing\" p JOIN \"Round\" r ON r.id = p.\"roundId\"
       WHERE r.\"tournamentId\" = '<TURNIR_ID>' ORDER BY r.number DESC LIMIT 50;"
   ```

4. **Natija kiritilganmi?**
   - **Yo'q** — turni qayta juftlashtiring (hakam konsolidan). Zarar yo'q.
   - **Ha** — hakam bilan qaror qiling: FIDE qoidalari bo'yicha
     o'ynalgan o'yin odatda saqlanadi, lekin buni **hakam** hal qiladi,
     dasturchi emas.

5. **Reytingga tushmasin.** Turnir reytingli bo'lsa, rating period
   compute'ni ishga tushirmang (`POST /rating-periods/:id/compute`).

## Sabab izlash

Juftlashtirish yadrosi sof va deterministik (`src/core/pairing/`), ya'ni
bir xil kirish har doim bir xil natija beradi. Shuning uchun:

1. Turnir holatini olib, **mahalliy** qayta juftlashtiring — xato
   takrorlansa, bu yadro xatosi va property-test bilan tiklanadi.
2. Takrorlanmasa — kirish ma'lumoti buzilgan (masalan `Standing`
   qatorlari yoki `floatHistory`). Audit logni ko'ring:

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT \"createdAt\", action, \"actorId\", payload FROM audit_logs
       WHERE payload::text LIKE '%<TURNIR_ID>%' ORDER BY \"createdAt\" DESC LIMIT 30;"
   ```

## Eskalatsiya

Darhol: texnik rahbar **va** turnir bosh hakami. Bu faqat texnik
muammo emas — sport natijasiga tegadi.

## Nega bu alert `for: 0m`

Bitta buzilish ham yetarli. Kutish — buzilgan juftlik bilan o'ynalgan
o'yinlar sonini oshiradi, xolos.
