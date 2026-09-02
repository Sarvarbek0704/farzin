# FarzinGlickoConvergenceFailure — sigma iteratsiyasi yaqinlashmadi

> **severity: page.** Reyting natijasini E'LON QILMANG.

## Nimani anglatadi

`farzin_glicko_convergence_failures_total` ko'tarildi. Glicko-2 da
volatility (σ) yangilanishi **Illinois** algoritmi bilan iterativ
hisoblanadi. Iteratsiya belgilangan qadamda kerakli aniqlikka
yetmasa, natija ishonchsiz.

Bu sof yadroda (`src/core/rating/`) sodir bo'ladi — u framework'siz va
deterministik, ya'ni bir xil kirish har doim bir xil natija beradi.

## Ta'siri

O'sha o'yinchining yangi reytingi ishonchsiz. Agar davr natijasi e'lon
qilinsa, xato reyting rasmiy tarixga tushadi va uni orqaga qaytarish
`RatingHistory` ni qayta yozishni talab qiladi.

## Birinchi qadamlar

1. **Compute natijasini e'lon qilmang.** Rating period `COMPUTED`
   holatida qolsin, `PUBLISHED` ga o'tkazilmasin.

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT id, environment, \"timeCategory\", status, \"startsAt\", \"endsAt\"
        FROM \"RatingPeriod\" ORDER BY \"endsAt\" DESC LIMIT 10;"
   ```

2. **Qaysi o'yinchi ekanini toping:**

   ```bash
   bash ~/.claude/bin/vps logs farzin 500 | grep -i "glicko\|convergence"
   ```

3. **Kirish qiymatlarini oling** — σ, RD va o'yinlar ro'yxati:

   ```bash
   bash ~/.claude/bin/vps sql farzin \
     "SELECT \"playerId\", rating, \"ratingDeviation\", volatility, \"gamesPlayed\"
        FROM \"PlayerRating\" WHERE \"playerId\" = '<PLAYER_ID>';"
   ```

## Sabab izlash

Konvergensiya buzilishining odatiy sabablari:

- **σ yoki RD ekstremal qiymatda** — masalan migratsiya paytida
  noto'g'ri boshlang'ich qiymat berilgan. Glicko-2 rasmiy diapazoni:
  σ ≈ 0.06, RD ≤ 350.
- **Bitta davrda juda ko'p o'yin** — kutilmagan hajm.
- **Kirish ma'lumoti buzuq** — masalan natijasi `null` bo'lgan o'yin
  hisobga kirgan.

Yadro testi rasmiy Glicko-2 test vektorini aniq takrorlaydi
(`src/core/rating/`), shuning uchun algoritmning o'zi shubha ostida
emas — avval KIRISHNI tekshiring.

## Tiklash

1. Buzuq kirishni tuzating (masalan `PlayerRating` ni oqilona qiymatga
   qaytaring — audit logga yozib).
2. Davrni QAYTA hisoblang.
3. Konvergensiya toza bo'lsa — e'lon qiling.

## Eskalatsiya

Texnik rahbar. Reyting — mahsulotning ishonch asosi; bu yerda
"keyin tuzatamiz" ishlamaydi.
