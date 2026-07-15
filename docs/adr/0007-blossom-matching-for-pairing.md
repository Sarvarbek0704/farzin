# ADR-0007 — Juftlashtirish uchun blossom (maximum weight matching)

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15

## Kontekst

FIDE Dutch Swiss tizimi ([05-pairing-engine.md](../05-pairing-engine.md)) o'nlab kriteriyani **leksikografik tartibda** qanoatlantiradigan juftlashtirishni talab qiladi: avval absolyut kriteriylar (C1–C3), keyin completion (C4), PAB (C5), so'ng sifat kriteriylari (C6–C21).

"Leksikografik" — ya'ni C6 ni bir birlikka yaxshilash uchun C7 ni qanchalik buzish mumkin bo'lsa ham arziydi. Kriteriylar teng emas, qat'iy ierarxiyada.

Muammo: 500 o'yinchi uchun mumkin bo'lgan juftlashtirishlar soni astronomik. Barchasini tekshirib bo'lmaydi.

## Qaror

**Maximum weight perfect matching, blossom algoritmi (Edmonds).**

Og'irliklar **`BigInt`** bilan hisoblanadi, `number` bilan emas.

Graf — **general** (bipartite emas).

## Sabablar

### Nega naive backtracking emas

Dastlabki fikr: rekursiv ravishda juftliklarni sinab ko'rish, konflikt bo'lsa orqaga qaytish.

Muammo: eng yomon holatda eksponensial. FIDE qoidalari transposition va exchange'ga ruxsat beradi, ya'ni qidiruv fazosi juda katta. 500 o'yinchili turnirda bu **soatlab** ishlashi mumkin.

Va eng yomoni — u **optimal yechim topishni kafolatlamaydi**, faqat birinchi topilgan yaroqli yechimni beradi. FIDE esa "eng yaxshi" juftlashtirishni talab qiladi.

### Nega matching masalasi

Juftlashtirishni graf sifatida modellashtirsak:
- **Tugun** — o'yinchi
- **Qirra** — mumkin bo'lgan juftlik (ikkalasi hali uchrashmagan)
- **Og'irlik** — bu juftlik FIDE kriteriylariga qanchalik mos

Unda "eng yaxshi juftlashtirish" = **maximum weight perfect matching**. Bu klassik va **yechilgan** masala.

Edmonds'ning blossom algoritmi (1965) buni **O(V³)** da yechadi. 500 o'yinchi → 500³ = 1.25×10⁸ operatsiya → zamonaviy CPU'da sekundlar. Qabul qilinadi.

**Va u optimal yechimni kafolatlaydi.**

### Nega general graph, bipartite emas

Bu nozik va oson xato qilinadigan joy.

Dutch tizimi score group'ni ikkiga bo'ladi: **S1** (yuqori yarim) va **S2** (quyi yarim), keyin S1[i] ni S2[i] bilan juftlashtiradi. Bu bipartite grafga o'xshaydi → Hungarian algoritmi (O(V³), soddaroq) ishlatish mumkindek tuyuladi.

**Lekin ishlamaydi.** FIDE qoidalari **exchange** mexanizmiga ruxsat beradi — S1 va S2 orasida o'yinchilarni almashtirish. Ya'ni S1 dagi ikki o'yinchi bir-biri bilan juftlashishi mumkin.

Exchange S1/S2 chegarasini **buzadi** → graf bipartite bo'lishdan to'xtaydi → Hungarian algoritmi noto'g'ri javob beradi.

General graph matching (blossom) kerak. U qimmatroq va murakkabroq, lekin **to'g'ri**.

### Nega BigInt og'irliklar — kritik detal

Leksikografik tartibni bitta songa joylashning standart usuli — bazali og'irliklar:

```
weight = C6 × B⁰ + C7 × B¹ + C8 × B² + ... + C21 × B¹⁵
```

Bu yerda `B` — har bir kriteriyning maksimal qiymatidan katta baza.

Muammo: JavaScript `number` — IEEE 754 double, mantissa **53 bit**.

16 ta kriteriyni leksikografik joylash uchun kerak bo'lgan bit soni 53 dan **oshib ketadi**. Natijada past darajali kriteriylar **jimgina yo'qoladi** — algoritm ishlaydi, xato bermaydi, lekin **noto'g'ri juftlashtirish** qaytaradi.

Bu eng xavfli xato turi: hech qanday alomat yo'q, faqat natija noto'g'ri. Va buni faqat golden test bilan (real turnir natijasi bilan solishtirish) aniqlash mumkin.

Yechim: **`BigInt`**. Aniqlik cheklovi yo'q.

**Oqibat:** tayyor npm blossom paketlari (`blossom`, `edmonds-blossom`) `number` bilan ishlaydi → **ular yaroqsiz**. Algoritmni `BigInt` bilan o'zimiz implementatsiya qilishimiz yoki mavjud implementatsiyani adaptatsiya qilishimiz kerak.

Bu jiddiy ish hajmi va u [14-roadmap.md](../14-roadmap.md) Faza 2 ga kiritilgan.

## Oqibatlar

**Ijobiy:**
- Optimal yechim **kafolatlangan** — "eng yaxshi juftlashtirish" da'vosi asosli
- O(V³) — bashorat qilinadigan vaqt
- Determinstik: bir xil input → bir xil output (tie-break stable sort bilan)
- Yaxshi o'rganilgan algoritm, adabiyot ko'p

**Salbiy:**
- **Blossom algoritmi murakkab.** Implementatsiya nozik, xato qilish oson
- `BigInt` arifmetikasi `number` dan sekinroq (~2-5×). O(V³) da bu sezilarli
- Og'irlik funksiyasini qurish — bu yerda haqiqiy qiyinchilik. Har bir FIDE kriteriysi to'g'ri og'irlikka aylanishi kerak
- Tayyor kutubxona ishlatib bo'lmaydi (BigInt sababli)
- Debug qiyin: "nega bu juftlik tanlandi?" savoliga javob berish uchun og'irlik hisobini ochish kerak

**Eng katta xavf — og'irlik funksiyasidagi xato.** Algoritm to'g'ri ishlaydi, lekin noto'g'ri masalani yechadi.

**Yumshatish:** golden test — real turnirlarning Swiss-Manager/Chess-Results natijalari bilan solishtirish. Bu **yagona ishonchli tekshiruv**. Unit test bu yerda yetarli emas.

## Performance

Maqsad: **500 o'yinchi < 2 soniya**.

> **Bu maqsad, o'lchov emas.** Hali benchmark qilinmagan. `BigInt` sekinlashuvi hisobga olinsa, real natija bundan yomonroq bo'lishi mumkin. Faza 2 da o'lchanadi.

Shuning uchun juftlashtirish **BullMQ job** sifatida bajariladi va HTTP `202 Accepted` qaytaradi ([04-api-spec.md §8.3](../04-api-spec.md#83-pairing--bu-yerda-nozik-joy-bor)).

## Alternativalar

| Variant | Nega rad etildi |
|---|---|
| **Naive backtracking** | Eksponensial, optimallik kafolati yo'q |
| **Hungarian (bipartite)** | Exchange mexanizmi S1/S2 chegarasini buzadi → noto'g'ri model |
| **ILP solver** (CBC, Gurobi) | Optimal, lekin og'ir bog'liqlik va litsenziya masalasi. Blossom yetarli |
| **JaVaFo** (FIDE'ning rasmiy tasdiqlangan dasturi) | Java, litsenziya noaniq. **Lekin golden test manbai sifatida qimmatli** — [05-pairing-engine.md §14](../05-pairing-engine.md) da ochiq savol |
| **Tayyor npm blossom** | `number` aniqligi yetmaydi (yuqorida) |

## Havolalar

- [05-pairing-engine.md](../05-pairing-engine.md)
- Edmonds, J. (1965) — "Paths, Trees, and Flowers"
- Galil, Z. (1986) — "Efficient algorithms for finding maximum matching in graphs"
- FIDE Handbook C.04.3 — Dutch System (amaldagi redaksiya: 2026-fevral)
