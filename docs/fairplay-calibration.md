# Fair-play detektori — kalibrlash natijalari

> Vosita: `src/tools/fairplay-calibration.ts`
> Oxirgi o'lchov: **2026-09-02**, Stockfish 18 (worker image)

## Nima uchun bu hujjat bor

`FAIRPLAY_SUSPICION_THRESHOLD = 0.6` chegarasi va signal vaznlari
(`ENGINE_CORRELATION` 0.35, `TIMING_ANOMALY` 0.30, …) `docs/08` dagi
**sifat** so'zlaridan olingan — "Yuqori", "O'rtacha–yuqori". Ular
o'lchovdan kelib chiqmagan. Ya'ni chegara **taxmin** edi va uning
narxini hech kim bilmasdi.

Bu hujjat o'sha bo'shliqning **o'lchangan qismini** yozib boradi.

## Usul

Har "yordam darajasi" p uchun o'yin generatsiya qilinadi: har yurishda
p ehtimol bilan kuchli dvigatel yurishi (depth 12), aks holda zaif
yurish (depth 1). Keyin o'yin **production kod yo'li** bilan tahlil
qilinadi — `buildObservations()` + `engineCorrelation()`, ya'ni
`analysis.processor` chaqiradigan aynan o'sha funksiyalar.

Faqat `ENGINE_CORRELATION` signali qatnashadi. Bu holda agregat skor
signal kuchiga TENG (`aggregateSuspicion` vazn bo'yicha
normallashtiradi), shuning uchun chegara bilan solishtirish to'g'ri.

## Natija (2026-09-02)

Stockfish 18 · tahlil chuqurligi 12 · chegara 0.60 · 60 ply · har
daraja uchun 3 o'yin:

| Dvigatel yordami | O'yin | O'rtacha skor | Chegaradan oshgan |
|---|---|---|---|
| 100% | 3 | 0.687 | **2/3** |
| 50% | 3 | 0.593 | 1/3 |
| 25% | 3 | 0.455 | 0/3 |
| 0% (nazorat) | 1 | 0.033 | 0/1 |

## Buni qanday o'qish kerak

**1. Detektor 0.6 chegarasida SEZUVCHAN EMAS.**

Har yurishini dvigateldan olgan o'yinchi 60 ply'lik o'yinda uchtadan
faqat ikkitasida belgilanadi. Ya'ni **eng qo'pol chit ham uchdan bir
holatda o'tib ketadi**. 25% yordam esa umuman ko'rinmaydi.

Bu chegarani pasaytirish kerak degani EMAS — pasaytirish yolg'on-pozitiv
darajasini oshiradi va u hali o'lchanmagan. Bu shuni anglatadiki,
**0.6 raqami dalilsiz tanlangan** va uni o'zgartirish uchun ikkinchi
raqam (yolg'on-pozitiv) kerak.

**2. Nazorat qatori — halol odam EMAS.**

0% qatori zaif dvigatel (depth 1). U detektor hamma narsani
belgilamasligini ko'rsatadi, xolos. Uni yolg'on-pozitiv darajasi deb
o'qish **xato** bo'ladi.

Diqqatga sazovor: uchta nazorat o'yinidan ikkitasi umuman **skor
bermadi**. Sabab — zaif o'yinda pozitsiya tez "hal bo'ladi"
(|eval| > 500 cp) va bunday pozitsiyalar `docs/08 §2.1` bo'yicha
chiqarib tashlanadi; qolgan namuna `ENGINE_MIN_SAMPLE = 20` dan kam
bo'lib qoladi. Ya'ni detektor bir tomonlama yutuqli o'yinlarda umuman
xulosa chiqarmaydi — bu to'g'ri xatti-harakat, lekin uni bilish kerak.

**3. Namuna KICHIK.**

Har darajada 3 o'yin. Bu — yo'nalishni ko'rsatuvchi ishora, aniq
o'lchov emas. Xulosa ("0.6 da sezuvchanlik past") ishonchli, aniq
foizlar esa yo'q.

## Hali o'lchanmagani — YOLG'ON-POZITIV DARAJASI

Bu raqamni olish uchun **haqiqiy odamlar o'ynagan, chit bo'lmagani
ishonchli bilingan** o'yinlar to'plami kerak. Loyihada bunday ma'lumot
yo'q va uni to'qib bo'lmaydi: soxta to'plamdan chiqqan raqam o'lchovga
o'xshab ko'rinadi, lekin fantaziya bo'ladi — "o'lchanmagan" deb yozib
qo'yishdan yomonroq.

Eng muhim va eng qiyin holat — **kuchli odam**: u dvigatelga tabiiy
ravishda yuqori mos keladi (`docs/08 §2.1`: GM tinch pozitsiyada
60–70% T1). Ya'ni yolg'on-pozitiv xavfi aynan eng kuchli va eng
ko'rinadigan o'yinchilarga to'planadi.

Kerakli ma'lumot manbalari (qaror mahsulot egasiniki):

- ochiq baza (masalan Lichess open database) — litsenziya va maxfiylik
  masalalarini ko'rib chiqish kerak;
- Farzin platformasining o'z o'yinlari — vaqt o'tib to'planadi, lekin
  ular "toza" deb **bilinmaydi**, faqat "shubhalanmagan";
- federatsiya bilan hamkorlikda hakam tasdiqlagan OTB o'yinlar.

## Vositani ishga tushirish

```bash
docker build --target worker -t farzin:worker .
docker run --rm -e STOCKFISH_PATH=/usr/bin/stockfish \
  -e CALIB_GAMES=5 -e CALIB_MAX_PLIES=80 \
  farzin:worker node dist/tools/fairplay-calibration.js
```

Windows/Git Bash'da `MSYS_NO_PATHCONV=1` qo'shing — aks holda
`/usr/bin/stockfish` Windows yo'liga aylanib ketadi.

Sozlamalar: `CALIB_GAMES`, `CALIB_MAX_PLIES`, `CALIB_STRONG_DEPTH`,
`FAIRPLAY_ENGINE_DEPTH`, `FAIRPLAY_SUSPICION_THRESHOLD`.

## Qoida

**Chegarani o'lchovsiz o'zgartirmang.** Hozirgi holat: sezuvchanlik
past ekani ma'lum, yolg'on-pozitiv narxi noma'lum. Bu ikkisidan bittasi
bilan qaror chiqarish — tanga tashlash.

Yumshatuvchi omil: chegaradan oshish **jazo emas**, faqat ish ochilishi.
Qarorni odam chiqaradi, yozma asos majburiy va doimiy ban yo'q
(`docs/08 §4.3`). Ya'ni past sezuvchanlik "chit qiluvchilar
jazolanmayapti" degani, yolg'on-pozitiv esa "nohaq odam komissiya
ko'rigiga tushadi" — ikkalasi ham yomon, lekin ikkinchisi
qaytarilmasroq.
