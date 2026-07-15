# 00 — Vizyon va bozor tahlili

> **Hujjat maqomi:** Tasdiqlangan · **Oxirgi yangilanish:** 2026-07-15
> **Egasi:** Sarvarbek Sodiqov

---

## 1. Bir gapda

**Farzin** — O'zbekiston shaxmatining raqamli infratuzilmasi: turnir boshqaruvi, milliy reyting, onlayn o'yin va maktab shaxmati bitta platformada.

## 2. Nima uchun bu loyiha

### 2.1. Mamlakatda shaxmat ko'tarilishda

Bir necha real fakt bir vaqtda to'g'ri keldi:

- O'zbekiston terma jamoasi **2022-yilgi Chennai Shaxmat Olimpiadasida oltin medal** oldi. Bu sport voqeasidan ko'ra ko'proq narsa edi — milliy g'urur nuqtasiga aylandi.
- **Nodirbek Abdusattorov** 2021-yilda jahon rapid chempioni bo'ldi va dunyo top-10 o'yinchilari qatoriga kirdi. Mamlakatda uni tanimaydigan odam kam.
- Maktablarda shaxmat davlat dasturi doirasida o'qitiladi.
- Toshkent xalqaro FIDE tadbirlarini qabul qilmoqda.

Ya'ni talab bor, iste'dod bor, davlat qiziqishi bor.

### 2.2. Lekin raqamli infratuzilma yo'q

Shu paytda turnirlar qanday boshqariladi:

- Juftlashtirish — **Swiss-Manager** (Avstriyada yozilgan, faqat Windows, pullik, cloud emas, UI 2000-yillardan qolgan).
- Ro'yxatga olish — Telegram guruhida ism yozish yoki qog'ozda.
- Natijalar — Excel fayl, keyin rasm qilib Telegram kanalga tashlanadi.
- Milliy reyting — markazlashgan onlayn bazasi yo'q. O'yinchi o'z reytingini bilish uchun kimdandir so'rashi kerak.
- To'lov — start puli naqd yoki karta orqali qo'lma-qo'l.

Bu ish qiladi, lekin miqyoslashmaydi va shaffof emas. Turnir natijasi bo'yicha nizo chiqsa, tekshiradigan audit izi yo'q.

### 2.3. Farzin nima qiladi

Yuqoridagi zanjirning har bir bo'g'inini bitta tizimga bog'laydi: o'yinchi ro'yxatdan o'tadi va to'laydi → hakam juftlashtiradi → natija kiritiladi → reyting avtomatik yangilanadi → hammasi ochiq va audit qilinadigan.

---

## 3. Bozor: halol baho

Bu bo'lim ataylab pessimistik. Loyihani o'zimizga sotmaymiz.

### 3.1. Bozor hajmi

| Ko'rsatkich | Baho | Ishonch |
|---|---|---|
| O'zbekiston aholisi | ~37 mln | Yuqori |
| Shaxmat bilan qiziquvchilar | Aniq ma'lumot yo'q | — |
| FIDE reytingiga ega o'zbek o'yinchilari | Bir necha ming | O'rta |
| Rasmiy turnirlar (yiliga) | Aniqlanishi kerak | Past |
| Shaxmat klublari | Aniqlanishi kerak | Past |

**Yuqoridagi bo'sh kataklar ataylab bo'sh.** Bu raqamlarni bilmayman va to'qib chiqarmayman. Faza 0 dan oldin O'zbekiston Shaxmat Federatsiyasi bilan bog'lanib aniqlash kerak. Agar rasmiy turnirlar soni yiliga 50 tadan kam bo'lsa — B2B modelining asosi zaif va strategiyani qayta ko'rish kerak.

### 3.2. Realistik shift

Boshidanoq ochiq aytamiz: **"millionlab foydalanuvchi" bu bozorda realistik emas.**

Realistik baho:
- **100–300 ming** ro'yxatdan o'tgan foydalanuvchi (bir necha yil ichida, yaxshi holatda)
- shundan **10–30 ming** oylik faol
- **B2C obunadan pul kelmaydi** — Lichess bepul va reklama ham qo'ymaydi, Chess.com esa 150 mln+ foydalanuvchiga ega. O'zbek foydalanuvchisi onlayn o'ynash uchun pul to'lamaydi, chunki bepul va yaxshiroq alternativa bir klik narida.

Pul **B2B/B2G** tomonda: federatsiya, klub, maktab, turnir tashkilotchisi. Bular kichikroq, lekin real to'laydigan mijozlar. Ular hozir Swiss-Manager litsenziyasiga va qo'lda ishga vaqt sarflayapti.

### 3.3. Raqiblar

| Raqib | Kuchli tomoni | Zaif tomoni | Farzin farqi |
|---|---|---|---|
| **Swiss-Manager** | FIDE de-fakto standarti, hakamlar o'rgangan | Windows-only, cloud emas, UI eskirgan, o'zbek tili yo'q, to'lov integratsiyasi yo'q | Cloud, mobil, o'zbek tili, to'lov |
| **Chess-Results.com** | Deyarli hamma turnir natijasi shu yerda | Faqat natija hosting, boshqaruv yo'q, dizayn 2000-yillardan | To'liq oqim, nafaqat natija |
| **Tornelo** | Zamonaviy cloud, yaxshi UX — **eng jiddiy raqib** | Mahalliy to'lov yo'q, o'zbek tili yo'q, mahalliy reyting bazasi yo'q, narx dollarda | Mahalliylashtirish |
| **Vega, Chessmanager** | Bepul/arzon | Cheklangan, kichik jamoa | Qamrov |
| **Chess.com / Lichess** | 20 yillik ustunlik, ulkan auditoriya | Turnir boshqaruvi va milliy reyting yo'q | Farzin bu bozorda raqobatlashmaydi |

**Eng katta xavf — Tornelo.** Ular allaqachon zamonaviy cloud turnir platformasi qurgan. Farzin'ning ustunligi faqat mahalliylashtirish: o'zbek/rus tili, Click/Payme, mahalliy reyting bazasi, maktab moduli, mahalliy narx. Bu himoya devori (moat) juda baland emas — Tornelo ertaga o'zbek tilini qo'shsa, ustunlikning yarmi yo'qoladi.

Bu xavfni yashirmaslik kerak. Haqiqiy himoya — federatsiya bilan rasmiy hamkorlik va milliy reyting bazasining rasmiy maqomi. Texnologiya emas, munosabat himoya qiladi.

### 3.4. Nega Chess.com/Lichess bilan raqobatlashmaymiz

Ochiq aytamiz: **bu urushda g'alaba qilib bo'lmaydi.**

- Lichess — bepul, ochiq kodli, reklamasiz, xayriya bilan ishlaydi. Undan arzonroq bo'lish imkonsiz.
- Chess.com — 150 mln+ foydalanuvchi, 20 yillik kontent, eng kuchli murabbiylar.

Farzin'da onlayn o'yin **bor**, lekin u daromad manbai emas — foydalanuvchini jalb qilish va milliy reyting uchun ma'lumot yig'ish vositasi. Buni mahsulot strategiyasida ochiq belgilaymiz.

---

## 4. Pul modeli

Bepul (jalb qilish uchun):
- Onlayn o'yin, puzzle, profil, reyting ko'rish, turnir kalendari

Pullik (daromad):

| # | Oqim | Mijoz | Model | Ustuvorlik |
|---|---|---|---|---|
| 1 | **Club/Federation SaaS** | Klub, federatsiya | Oylik/yillik obuna | **Asosiy** |
| 2 | **School module** | Maktab, vazirlik | Shartnoma (B2G) | Yuqori |
| 3 | **Turnir start puli** | Tashkilotchi | Tranzaksiya komissiyasi | O'rta |
| 4 | **Coach marketplace** | Murabbiy | Komissiya | Past |
| 5 | **Broadcast homiyligi** | Homiy | Reklama/sponsorlik | Past |

Birinchi daromad #1 va #2 dan kutiladi. #3 hajm bo'lgandan keyin mantiqiy. #4 va #5 — keyingi bosqich.

---

## 5. Nima uchun bu texnik jihatdan qiziq

Bu loyiha CRUD emas. Ichida haqiqiy muhandislik masalalari bor:

1. **FIDE Dutch Swiss juftlashtirish** ([05-pairing-engine.md](./05-pairing-engine.md)) — graf nazariyasidagi weighted matching masalasi, o'nlab FIDE qoidasi og'irlik funksiyasiga aylanadi. Bu loyihaning eng qiyin qismi.
2. **Glicko-2 reyting** ([06-rating-system.md](./06-rating-system.md)) — iterativ volatility hisobi, rating period, idempotent qayta hisoblash.
3. **Server-authoritative taymer** ([07-realtime-and-clock.md](./07-realtime-and-clock.md)) — monotonic clock, lag kompensatsiya, millisekund aniqligi.
4. **Anti-chit statistikasi** ([08-fair-play.md](./08-fair-play.md)) — ehtimollik modeli, false positive narxi juda yuqori (odamning sport karyerasi).
5. **Double-entry ledger** ([09-payments-and-billing.md](./09-payments-and-billing.md)) — pul bilan ishlash, idempotentlik, reconciliation.

---

## 6. Muvaffaqiyat mezonlari

Faza bo'yicha o'lchanadigan maqsadlar ([14-roadmap.md](./14-roadmap.md)):

| Mezon | Maqsad | Qachon |
|---|---|---|
| Birinchi real turnir Farzin'da o'tkazildi | 1 ta | Faza 2 oxiri |
| Swiss juftlashtirish Swiss-Manager natijasi bilan mos | Golden testda 100% | Faza 2 |
| Pullik klub | 1 ta | Faza 4 |
| Federatsiya bilan rasmiy hamkorlik | Shartnoma | Faza 3–5 oralig'i |
| Maktab moduli pilot | 1 maktab | Faza 7 |

**Eng muhim mezon — birinchisi.** Agar bitta ham hakam Farzin'da real turnir o'tkazishga rozi bo'lmasa, qolgan hamma narsa ahamiyatsiz.

---

## 7. Asosiy taxminlar va ularni tekshirish

Har bir taxmin xato bo'lishi mumkin. Tekshirilmaguncha bu loyiha faraz ustiga qurilgan.

| # | Taxmin | Xato bo'lsa nima bo'ladi | Qanday tekshiriladi |
|---|---|---|---|
| T1 | Hakamlar Swiss-Manager'dan voz kechishga tayyor | Butun B2B model qulaydi | 5 ta hakam bilan suhbat |
| T2 | Klublar obunaga pul to'laydi | Daromad yo'q | 3 ta klub rahbari bilan suhbat, narx testi |
| T3 | Federatsiya hamkorlikka ochiq | Rasmiy maqom yo'q → Tornelo bilan farq yo'qoladi | Rasmiy murojaat |
| T4 | Maktab moduli uchun byudjet bor | B2G oqimi yo'q | Vazirlik/maktab bilan suhbat |
| T5 | Turnirlar soni yiliga 50+ | Bozor juda kichik | Federatsiya kalendari |

**T1 va T2 — kritik.** Bularni Faza 0 boshlanishidan oldin tekshirish kerak. Kod yozishdan oldin 5 ta telefon qo'ng'irog'i.

---

## 8. Non-goals — Farzin nima qilmaydi

- Chess.com/Lichess bilan onlayn o'yin bozorida raqobatlashish
- Shaxmat dvigateli (engine) yozish — Stockfish ishlatiladi
- Shaxmat taxtasi rendereri yozish — chessground ishlatiladi
- FIDE reytingini hisoblash — bu FIDE ning ishi; Farzin faqat oyna (mirror) saqlaydi
- Boshqa sport turlariga kengayish (dastlabki bosqichda)

---

## 9. Keyingi hujjatlar

| Hujjat | Nima haqida |
|---|---|
| [01-product-spec.md](./01-product-spec.md) | Personalar, user story, RBAC |
| [02-architecture.md](./02-architecture.md) | Tizim arxitekturasi |
| [03-data-model.md](./03-data-model.md) | Ma'lumotlar modeli |
| [14-roadmap.md](./14-roadmap.md) | Yo'l xaritasi va xavflar |
