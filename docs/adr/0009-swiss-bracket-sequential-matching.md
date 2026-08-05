# ADR-0009 — Swiss Dutch: bracket-ketma-ket BigInt vaznli matching

- **Holat:** Qabul qilingan
- **Sana:** 2026-08-05
- **Munosabat:** [ADR-0007](0007-blossom-matching-for-pairing.md) ni **aniqlashtiradi**
  (bekor qilmaydi). 0007 dagi asosiy qarorlar — blossom (maximum weight matching,
  general graf) va `BigInt` og'irliklar — o'z kuchida qoladi; bu ADR matchingni
  aynan QAYERDA va QANDAY qo'llashni, hamda FIDE matnidan qaysi nuqtalarda ongli
  chekinish borligini qayd etadi.

## Kontekst

FIDE C.04.3 (2026-02-01 redaksiyasi, verbatim matn:
[docs/references/fide-c0403-dutch-2026-02.md](../references/fide-c0403-dutch-2026-02.md))
juftlashtirishni **bracket-ma-bracket** (Article 1.9.2) va bracket ichida
**nomzodlarni qat'iy ketma-ketlikda sanash** (Article 3.6/3.7, 4.2–4.4) orqali
ta'riflaydi. Bu ketma-ketlikning to'g'ridan-to'g'ri implementatsiyasi faktorial
(05-pairing-engine.md §2.6) — kompyuter uchun yaroqsiz.

ADR-0007 blossom matchingni tanlagan, lekin "butun turga bitta matchingmi yoki
har bracketga alohidami", C4/C8 (to'liqlik/lookahead) va PAB tanlovi qanday
bajarilishini ochiq qoldirgan edi.

## Qaror

1. **Bracket-ketma-ket ishlov** (Article 1.9.2 bilan aynan mos): scoregroup'lar
   yuqoridan pastga; juftlashmaganlar keyingi bracketga MDP bo'lib tushadi.

2. **Har bracket — bitta maximum weight matching** (blossom, `BigInt`):
   - qirra faqat C1/C3 ga mos juftlik uchun (absolyut kriteriylar — graf
     strukturasi, og'irlik emas);
   - og'irlik darajalari (yuqoridan pastga): C6 (juftlik soni) → C5 (PAB
     ochkosi, dummy qirra) → C7 (floater ochkolari, eksponensial) → SD
     (juftlik ichidagi ochko farqi — tarkibiy yaqinlashish, quyida) → C9 →
     C10…C21 → TB (kanonik ketma-ketlik darajasi). Aralash radiks kodlash:
     har daraja bazasi quyi darajalar jami diapazonidan qat'iy katta
     (`src/core/pairing/swiss/bracket-weights.ts`);
   - "kamayish tartibida taqqoslanadigan" kriteriylar (C7, C18–C21) uchun
     eksponensial qiymatlar `(n+1)^ochko` — multiset-leksikografik semantika
     yig'indiga aniq kodlanadi.

3. **PAB — dummy tugun** oxirgi bracketda (toq sonda): qirra faqat C2 bo'yicha
   haqli o'yinchilarга, og'irligi C5 + C9 ni kodlaydi. Dummy bilan juftlashgan
   o'yinchi PAB oladi. C5 aniq bajariladi: dummy qirra C5 darajasida barcha
   sifat kriteriylaridan ustun.

4. **C4 (to'liqlik) — merge-kaskadi:** oxirgi bracket yopilmasa, oxirgi ikki
   scoregroup birlashtirilib qайта uriniladi; kaskad yuqoriga davom etadi.
   **Isbot eskizi:** eng yomon holatda hamma o'yinchi BITTA bracketga tushadi;
   unda C6-dominant og'irlikli matching — global maksimal kardinallik
   matchingi; demak C1–C3 ostida to'liq juftlashtirish mavjud bo'lsa, u
   ALBATTA topiladi; mavjud bo'lmasa — `PairingImpossibleError`
   (Article 1.9.3 — hakam hal qiladi). Terminatsiya: har kaskad qadamida
   guruhlar soni kamayadi.

5. **"Perfect candidate" qisqa yo'li** (Article 3.4.1): homogen, juft sonli
   bracketda to'g'ridan-to'g'ri S1[i]–S2[i] nomzodi hech qanday kriteriyni
   buzmasa — matchingsiz qabul qilinadi (isbot: barcha jarimalar 0 va TB
   darajasida to'g'ri nomzod qat'iy minimal). 1-turdagi katta bracket shu
   yo'ldan o'tadi — ADR-0007 dagi «1-tur worst case O(N³)» xavfi yo'qoladi.

## Halol chegaralar (FIDE matnidan ongli chekinishlar)

| # | Chekinish | Sabab / xavf |
|---|---|---|
| 1 | **C8 (downfloater lookahead)** to'liq emas: keyingi bracketda C1–C7 bajarilishi faqat QATTIQ yiqilish (C4) darajasida — merge-kaskad orqali kafolatlanadi; C8 ning *sifat* darajasidagi tanlovi kodlanmagan. | C8 lokal qirra og'irligiga sig'maydi (kelajak bracket natijasiga bog'liq). Ta'siri: kam uchraydigan holatlarda JaVaFo boshqa floaterni tanlashi mumkin. |
| 2 | **Nomzodlar ketma-ketligi (Article 3.8.1 "earlier in the sequence")** TB og'irlik darajasi bilan yaqinlashtirilgan: transpozitsiya tartibi (4.2.2) aniq mos, exchange tartibi (4.3) — yo'nalish bo'yicha mos, batafsil taqqoslash qoidalari emas. | To'liq ketma-ketlik semantikasi qirra-ajraladigan og'irlikka matematik jihatdan sig'maydi. Teng-sifatli nomzodlar ichida tanlov DETERMINISTIK, lekin JaVaFo bilan farq qilishi mumkin. |
| 3 | **SD darajasi** (juftlik ichidagi ochko farqini minimallashtirish) — rasmiy kriteriy emas, birlashtirilgan (merge) bracketlarda FIDE'ning bracket-tuzilish semantikasini almashtiradigan tarkibiy yaqinlashish. Sof (birlashtirilmagan) bracketlarda neytral. | Merge faqat C4 yiqilishida ishlaydi — kam uchraydi. |
| 4 | **MDP×MDP juftlik** birlashtirilgan bracketda nazariy jihatdan mumkin (FIDE strukturasida S1=MDP, S2=resident). C7/SD darajalari uni tabiiy ravishda jazolaydi. | Faqat merge holatlarida; to'liqlik uchun taqiqlash xavfli. |
| 5 | **C13 talqini:** "strong colour preference" — aynan 1.7.2 (CD=±1) ma'nosida; buzilgan absolyut afzalliklar C10/C11 darajasида hisoblanadi, C13 da emas. | Matn bir talqinni majburlamaydi; hujjatlangan tanlov. |

**Yumshatish** (o'zgarmagan, ADR-0007 dagi kabi): yagona ishonchli tekshiruv —
golden solishtirish. Hozircha bor: qo'lda, qoida-ma-qoida hisoblangan
ssenariylar + property-testlar + brute-force matching oracle. JaVaFo/TRF
golden to'plami — Faza 2 davomi; ishlab chiqarishda ishonishdan oldin
**shadow-mode** majburiy (dvigatel sarlavhasidagi halol bayon).

## Oqibatlar

**Ijobiy:**
- Bracket ichida optimallik kafolati (blossom) + C4 to'liqlik kafolati (kaskad isboti).
- C5/C2/C9 PAB semantikasi to'liq va aniq (dummy tugun).
- Determinizm: barcha tartiblar total order; TB darajasi teng nomzodlarni ham deterministik ajratadi.
- 1-tur qisqa yo'li — performance xavfining eng katta qismini olib tashlaydi.

**Salbiy:**
- JaVaFo bilan bit-mosligi KAFOLATLANMAYDI (yuqoridagi 1–2 chekinishlar) — bu
  Faza 2 DoD'ga zid emas, lekin sertifikatsiya uchun keyingi ish.
- Og'irliklar katta (yuz-minglab bit) — BigInt arifmetikasi sekin; katta
  bracketlarda (merge kaskadi) O(V³·bit) his qilinadi. Byudjet: 500 o'yinchi
  < 2 s — hali O'LCHANMAGAN (ADR-0007 dagi ogohlantirish o'z kuchida).

## Havolalar

- [ADR-0007](0007-blossom-matching-for-pairing.md) — blossom + BigInt qarori
- [docs/references/fide-c0403-dutch-2026-02.md](../references/fide-c0403-dutch-2026-02.md) — normativ matn
- `src/core/pairing/swiss/` — implementatsiya
- van Rantwijk, J. — `mwmatching.py` (blossom referensi)
