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

Stockfish 18 · tahlil chuqurligi 12 · chegara 0.60. **Ikki yurgizish**
qasddan keltiriladi — ular bir-biriga mos kelmadi va bu faktning o'zi
xulosaning bir qismi.

**A yurgizish** — 60 ply, 3 o'yin/daraja:

| Dvigatel yordami | Skorlangan o'yin | O'rtacha skor | Chegaradan oshgan |
|---|---|---|---|
| 100% | 3 | 0.687 | 2/3 |
| 50% | 3 | 0.593 | 1/3 |
| 25% | 3 | 0.455 | 0/3 |
| 0% (nazorat) | 1 | 0.033 | 0/1 |

**B yurgizish** — 80 ply, 5 o'yin/daraja:

| Dvigatel yordami | Skorlangan o'yin | O'rtacha skor | Chegaradan oshgan |
|---|---|---|---|
| 100% | 4 | 0.697 | 3/4 |
| 50% | 5 | **0.742** | 5/5 |
| 25% | 3 | 0.296 | 1/3 |
| 0% (nazorat) | 5 | 0.149 | 0/5 |

## Buni qanday o'qish kerak

**1. Eng muhim natija: 100% dvigatel yordami HAR DOIM ham
belgilanmaydi.**

Ikkala yurgizishda ham har yurishini dvigateldan olgan o'yinchi
chegaradan o'tib ketdi (A: 1/3, B: 1/4). Alohida o'yin skorlari:
0.513, 0.587 — chegaradan past. Ya'ni **eng qo'pol chit ham
sezilmasligi mumkin**.

**2. Skor o'yindan o'yinga JUDA tarqoq — darajalarni ajratib
bo'lmaydi.**

B yurgizishda 50% yordam 100% dan YUQORI skor oldi (0.742 va 0.697).
Bu "yarim yordam ko'proq shubhali" degani emas — bu **namuna kichik va
dispersiya katta** degani. n = 3–5 da darajalar orasidagi farqni
o'lchab bo'lmaydi.

Shu sababli quyidagi xulosa **qilinmaydi**: "chegarani X ga tushirish
kerak". Buning uchun kattaroq namuna VA yolg'on-pozitiv narxi kerak.

**3. Qilinadigan xulosa:** `0.6` raqami dalilsiz tanlangan va shunday
bo'lib qolmoqda. Endi hech bo'lmasa buni **o'lchov bilan aytish**
mumkin — ilgari faqat taxmin qilinardi.

**4. Nazorat qatori — halol odam EMAS.**

0% qatori zaif dvigatel (depth 1). U detektor hamma narsani
belgilamasligini ko'rsatadi, xolos; yolg'on-pozitiv darajasi deb
o'qish **xato**. B yurgizishda nazorat o'yinlari 0.328 va 0.416 gacha
chiqdi — ya'ni u nolga yaqin ham emas.

**5. Skor umuman chiqmaydigan o'yinlar bor.**

Bir qancha o'yin `skor=yo'q` berdi. Sabab: pozitsiya tez "hal bo'ladi"
(|eval| > 500 cp) va bunday pozitsiyalar `docs/08 §2.1` bo'yicha
chiqariladi; qolgan namuna `ENGINE_MIN_SAMPLE = 20` dan kam bo'ladi.
Bir tomonlama yutuqli o'yinlarda detektor **xulosa chiqarmaydi** — bu
to'g'ri xatti-harakat, lekin uni bilish kerak: qisqa, tez yutilgan
o'yinda chit qilgan odam umuman tekshirilmaydi.

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
