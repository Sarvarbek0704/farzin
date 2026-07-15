# ADR-0003 — Milliy reyting uchun Glicko-2, Elo emas

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15

## Kontekst

Farzin milliy reyting yuritadi. Bu tizimning eng nozik qismi: reyting o'yinchining sport karyerasiga ta'sir qiladi — terma jamoaga tanlov, unvon, stipendiya.

Tanlov: Elo (FIDE ishlatadi), Glicko, Glicko-2, TrueSkill.

## Qaror

**Glicko-2**, sistema konstantasi `τ` boshlang'ich qiymati **0.5** (backtest bilan qayta ko'riladi).

**FIDE Elo hisoblanmaydi** — u FIDE ning ishi. Farzin faqat oyna (mirror) sifatida saqlaydi ([06-rating-system.md §6](../06-rating-system.md)).

## Sabablar

### Elo'ning kamchiliklari

Elo bitta sonni saqlaydi: reyting. Lekin u **ishonch darajasini** bilmaydi.

Ikki o'yinchi, ikkalasining reytingi 1600:
- A — 500 ta o'yin o'ynagan, har hafta o'ynaydi
- B — 5 ta o'yin o'ynagan, 3 yil oldin

Elo ularga **bir xil muomala qiladi**. Bu noto'g'ri: B ning haqiqiy kuchi 1600 atrofida bo'lishi ehtimoli ancha past.

Elo buni K-factor bilan yamashga urinadi (yangi o'yinchiga K=40, tajribaliga K=10). Lekin K qo'lda tanlanadi va faollikni hisobga olmaydi.

### Glicko-2 nima qo'shadi

| Parametr | Ma'no |
|---|---|
| `r` — rating | Kuch bahosi (Elo kabi) |
| `RD` — rating deviation | Bahoning **noaniqligi**. Kam o'ynagan → RD yuqori |
| `σ` — volatility | Natijalarning **beqarorligi**. Kutilmagan natijalar → σ o'sadi |

Buning amaliy natijasi:
- Yangi o'yinchi tez to'g'ri reytingga yetadi (RD yuqori → katta o'zgarish)
- Tajribali o'yinchi barqaror (RD past → kichik o'zgarish)
- **Uzoq o'ynamagan o'yinchining RD'si o'sadi** — tizim "men bu odam haqida endi kam bilaman" deydi. Bu Elo'da umuman yo'q
- Kutilmagan natija ketma-ketligi σ'ni oshiradi → reyting tezroq moslashadi

### Nega Glicko-1 emas

Glicko-2 = Glicko-1 + volatility. Volatility "o'yinchi formasi o'zgardimi yoki bu tasodifmi?" savolini hal qiladi. Qo'shimcha murakkablik faqat volatility iteratsiyasida (Illinois algoritmi) — bu bir marta yoziladi va test bilan qopiladi.

### Nega TrueSkill emas

TrueSkill (Microsoft) — jamoaviy va ko'p o'yinchili o'yinlar uchun. Shaxmat — 1v1. TrueSkill bu yerda ortiqcha murakkablik va patent masalasi bor.

### Nega FIDE Elo hisoblanmaydi

FIDE reytingi FIDE tomonidan hisoblanadi va e'lon qilinadi. Farzin uni hisoblasa:
- Natija FIDE'nikidan farq qilishi mumkin → chalkashlik
- Rasmiy maqomga ega bo'lmaydi
- Foydasi yo'q

Farzin FIDE ro'yxatini oyda bir marta sinxronlaydi va o'yinchi profilida ko'rsatadi. Xolos.

## Oqibatlar

**Ijobiy:**
- Reyting adolatliroq va ishonchliroq
- Faollikni hisobga oladi
- Lichess ham Glicko-2 ishlatadi — ya'ni katta miqyosda sinovdan o'tgan
- RD bilan "provisional" (dastlabki) statusni tabiiy ifodalash mumkin

**Salbiy:**
- **Batch hisoblash talab qiladi** — rating period. Real-time emas. O'yinchi o'yin tugagach reytingi darhol o'zgarganini ko'rmaydi
- Volatility iteratsiyasi nozik — noto'g'ri implementatsiya jimgina xato beradi
- Tushuntirish qiyinroq: "RD nima?" degan savol keladi
- Uchta parametr saqlanadi, bitta emas

**Eng katta xavf — noto'g'ri implementatsiya.** Formula murakkab va xato jimgina o'tadi (reyting "o'xshash" chiqadi, lekin noto'g'ri).

**Yumshatish:** Glickman'ning rasmiy misolidagi test vektori bilan tekshirish ([06-rating-system.md §12](../06-rating-system.md)).

> **Eslatma:** hujjatni yozishda test vektori Node'da sonli tekshirildi. To'liq float aniqligida natija `r' = 1464.05`, Glickman'ning maqolasidagi `1464.06` emas — farq maqoladagi yaxlitlangan oraliq qiymatlardan (`v`: 1.7790 vs 1.7785). Ya'ni `±0.001` tolerantlik qo'yilsa **to'g'ri implementatsiya testdan o'tmaydi**. Tolerantlik `±0.01` bo'lishi kerak. Bu aynan shu ADR nazarda tutgan "jimgina xato" turi.

## Ochiq savol

`τ` qiymati **yakuniy emas**. 0.5 — Glickman'ning tavsiyasi (0.3–1.2 oralig'ida). To'g'ri qiymat real ma'lumotda backtest bilan aniqlanadi. Kichik `τ` → reyting barqaror lekin sekin moslashadi; katta `τ` → tez moslashadi lekin shovqinli.

Bu Faza 3 da hal qilinadi ([14-roadmap.md](../14-roadmap.md)).

## Havolalar

- [06-rating-system.md](../06-rating-system.md)
- Glickman, M. (2012) — "Example of the Glicko-2 system"
- Glickman, M. (1999) — "Parameter estimation in large dynamic paired comparison experiments"
