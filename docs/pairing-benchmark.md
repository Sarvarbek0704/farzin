# Juftlashtirish tezligi — o'lchov natijalari

> Vosita: `src/tools/pairing-benchmark.ts`
> O'lchov: **2026-09-03**, Node v22.17.0 · x64 (ishlab chiqish mashinasi)

## Nima uchun bu hujjat bor

`docs/AUDIT.md` ikkita bandni ochiq qoldirgan edi:

| Faza 3 DoD bandi | Auditdagi holat |
|---|---|
| 100 o'yinchida p95 < 10 s | 🟡 «O'lchov yo'q. 11 o'yinchida 0–3 ms, lekin 100/500 sinalmagan» |
| 500 o'yinchida tugaydi, vaqt hujjatlangan | ❌ «O'lchanmagan» |

Endi ikkalasi ham **o'lchandi**.

## Usul

Har hajm uchun 9 turlik turnir 5 xil urug' bilan simulyatsiya qilinadi.
Natijalar Elo kutilmasi bo'yicha tarqatiladi (kuchliroq ko'proq yutadi),
ya'ni ochko guruhlari realistik shakllanadi. Har turda
`SwissDutchEngine.pair()` chaqiruvi o'lchanadi.

**O'lchov sof yadro** — HTTP, DB va navbat kirmaydi. Ya'ni bu SLO
«bajarildi» degan isbot emas, yadroning **quyi chegarasi**. To'liq
o'lchov klaster va k6 bilan bo'ladi (AUDIT 17-band, hali ochiq).

C1–C3 absolyut kriteriyalarni qayta tekshirish vaqti o'lchovga
**kiradi** — production'da ham u har juftlashtirishdan keyin ishlaydi.

## Natija

| O'yinchi | Namuna | min | median | p95 | max | 9 tur jami (median) |
|---|---|---|---|---|---|---|
| 20 | 45 | 0.1 ms | 1.3 ms | 4.1 ms | 7.0 ms | ~11 ms |
| 50 | 45 | 0.2 ms | 2.8 ms | 8.2 ms | 12.3 ms | ~25 ms |
| **100** | 45 | 0.5 ms | **10.6 ms** | **55.3 ms** | 61.9 ms | ~96 ms |
| 200 | 45 | 2.2 ms | 112.8 ms | 483.6 ms | 530.3 ms | ~1.0 s |
| **500** | 45 | 19.4 ms | **2.05 s** | **13.04 s** | 13.43 s | ~18.4 s |

### Tur bo'yicha taqsimot (n = 500)

| Tur | median | max |
|---|---|---|
| 1 | 23.1 ms | 28.4 ms |
| **2** | **13.04 s** | **13.43 s** |
| 3 | 6.08 s | 6.53 s |
| 4 | 3.91 s | 4.17 s |
| 5 | 2.41 s | 2.58 s |
| 6 | 2.05 s | 2.36 s |
| 7 | 1.68 s | 1.78 s |
| 8 | 1.49 s | 1.56 s |
| 9 | 1.45 s | 2.51 s |

## Xulosalar

**1. 100 o'yinchi uchun SLO bajariladi — katta zaxira bilan.**

p95 = 55 ms, chegara 10 s. Ya'ni ~180 barobar zaxira. Bu band yopiq
deb hisoblanadi (yadro darajasida).

**2. 500 o'yinchida tugaydi, lekin p95 = 13 s.**

Turnir yakunlanadi (juftlashtirish muvaffaqiyatli), ammo bitta tur 13
soniyagacha oladi. SLO rasman ≤100 o'yinchi uchun yozilgan, shuning
uchun bu **buzilish emas** — lekin sig'im rejasi uchun bilinishi shart:
500 kishilik seksiyada hakam tugmani bosgach ~13 soniya kutadi.

**3. Eng og'ir tur — 2-tur, oxirgisi emas.**

Bu intuitiv emas va aynan shu sababli o'lchov qimmatli. Sabab: 1-turdan
keyin barcha o'yinchi atigi uchta ochko guruhiga tushadi (1 / ½ / 0) va
eng kattasi ~200 kishilik bo'ladi. Blossom moslashtirish narxi guruh
hajmiga kub bog'liq, ya'ni bitta ulkan guruh butun turni belgilaydi.
Keyingi turlarda guruhlar maydalanadi va narx **monoton kamayadi**.

Amaliy natija: optimallashtirish kerak bo'lsa, u **erta turlarga**
qaratilishi kerak; «oxirgi tur eng og'ir» degan taxmin noto'g'ri.

**4. O'sish superchiziqli.**

100 → 200: ~10×. 200 → 500: ~18×. Bu blossom algoritmining kutilgan
xulqi. 1000 o'yinchilik yagona seksiya hozirgi kod bilan amalda
qiyin bo'ladi — lekin bunday seksiya shaxmatda deyarli uchramaydi
(500+ turnirlar seksiyalarga bo'linadi).

## O'lchov aniqligi haqida ogohlantirish

Ikki yurgizish orasida 500 o'yinchi uchun p95 **9.89 s** va **13.04 s**
chiqdi — bir xil urug'lar bilan. Farq mashina shovqinidan (o'lchov
paytida boshqa jarayonlar ishlagan). Ikkala yurgizish ham bir xil
**shakl**ni beradi: 2-tur cho'qqi, keyin monoton kamayish, 100
o'yinchida katta zaxira.

Shuning uchun bu raqamlar **kattalik tartibi** sifatida o'qilsin, aniq
qiymat sifatida emas. Barqaror raqam uchun ajratilgan CI mashinasi
kerak.

## Vositani ishga tushirish

```bash
pnpm build
node dist/tools/pairing-benchmark.js

# Ko'proq urug' — barqarorroq median (sekinroq):
BENCH_SEEDS=15 node dist/tools/pairing-benchmark.js
```

Natijalar deterministik: urug'langan PRNG, dvigatelning o'zida tasodif
yo'q (`docs/05-pairing-engine.md` talabi).
