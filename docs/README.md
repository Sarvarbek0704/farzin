# Farzin — Texnik topshiriq (TZ)

> O'zbekiston shaxmatining raqamli infratuzilmasi.
> Bu papka loyihaning to'liq texnik topshirig'i. **Kod yozishdan oldin o'qiladi.**

---

## Qayerdan boshlash

Kim ekaningizga qarab:

| Siz | O'qing |
|---|---|
| **Loyiha bilan endi tanishyapsiz** | [00-vision-and-market.md](./00-vision-and-market.md) → [02-architecture.md](./02-architecture.md) |
| **Kod yozishni boshlayapsiz** | [02-architecture.md](./02-architecture.md) → [03-data-model.md](./03-data-model.md) → [adr/](./adr/) |
| **Mahsulot qarorini qidiryapsiz** | [01-product-spec.md](./01-product-spec.md) |
| **"Nega bu shunday?" deb so'ramoqchisiz** | [adr/](./adr/) |
| **Keyingi ish nima ekanini bilmoqchisiz** | [14-roadmap.md](./14-roadmap.md) |

---

## Hujjatlar

### Poydevor

| # | Hujjat | Nima haqida |
|---|---|---|
| 00 | [Vizyon va bozor](./00-vision-and-market.md) | Nima uchun bu loyiha. Bozor **halol** bahosi, raqiblar, pul modeli, tekshirilmagan taxminlar |
| 01 | [Mahsulot spetsifikatsiyasi](./01-product-spec.md) | Personalar, user story, foydalanuvchi oqimlari, RBAC matritsasi, ko'p tillilik |
| 02 | [Arxitektura](./02-architecture.md) | Tizim ko'rinishi, modul xaritasi, qatlamlar, event oqimi, masshtablash yo'li |
| 03 | [Ma'lumotlar modeli](./03-data-model.md) | ER diagramma, kritik dizayn qarorlari, index, partitioning, saqlash muddati |
| 04 | [API spetsifikatsiyasi](./04-api-spec.md) | REST konvensiyalari, xatolik formati, pagination, idempotentlik, rate limit |

### Domen — loyihaning "go'shti"

| # | Hujjat | Nima haqida |
|---|---|---|
| 05 | [Juftlashtirish dvigateli](./05-pairing-engine.md) | **FIDE Dutch Swiss.** Eng qiyin qism. Blossom matching, og'irlik funksiyasi, tie-break, golden test |
| 06 | [Reyting tizimi](./06-rating-system.md) | **Glicko-2.** To'liq matematika, volatility iteratsiyasi, rating period, qayta hisoblash |
| 07 | [Real-time va taymer](./07-realtime-and-clock.md) | Server-authoritative taymer, WebSocket kontrakti, move validatsiya, durang qoidalari, matchmaking |
| 08 | [Fair play](./08-fair-play.md) | Anti-chit: engine korrelyatsiya, timing tahlili. **Ehtimollik, isbot emas** |

### Platforma

| # | Hujjat | Nima haqida |
|---|---|---|
| 09 | [To'lov va billing](./09-payments-and-billing.md) | Click/Payme/Uzum, idempotentlik, double-entry ledger, refund, reconciliation |
| 10 | [Xavfsizlik](./10-security.md) | STRIDE, Argon2id, refresh rotation + reuse detection, RBAC, **bolalar ma'lumoti**, OWASP |
| 11 | [Infratuzilma](./11-infrastructure.md) | Docker, Kubernetes, CI/CD, backup, zero-downtime migration, hosting |
| 12 | [Frontend spetsifikatsiyasi](./12-frontend-spec.md) | Texnologiya va arxitektura. **Dizayn hal qilinmagan** — §13 dagi savollar |
| 13 | [Test strategiyasi](./13-testing-strategy.md) | Piramida, Testcontainers, property-based, golden test, load test |
| 14 | [Yo'l xaritasi](./14-roadmap.md) | 11 faza, tayyorlik mezonlari, **xavflar registri**, vaqt bahosi |
| 15 | [Kuzatuv](./15-observability.md) | Logging, metrics, tracing, SLO, alerting |

### Qarorlar

| Papka | Nima haqida |
|---|---|
| [adr/](./adr/) | **Arxitektura qarorlari.** Nima, nega, va **nima evaziga**. 8 ta qaror |

---

## Bu TZ ni qanday o'qish kerak

### Halollik shartnomasi

Bu hujjatlar ataylab **pessimistik**. Ular loyihani sotmaydi.

Har bir hujjatda topasiz:
- **"Ochiq savollar"** bo'limi — hal qilinmagan narsalar
- **"Tekshirilishi kerak"** belgisi — tasdiqlanmagan raqam yoki faraz
- **Salbiy oqibatlar** — har ADR'da majburiy bo'lim
- **Yuridik masalalar** — maslahat sifatida EMAS, ochiq savol sifatida

Agar biror joyda raqam ko'rsangiz va yonida manba yoki "taxminiy" belgisi bo'lmasa — bu **xato**, uni tuzatish kerak.

### Eng muhim uchta haqiqat

**1. "Millionlab foydalanuvchi" realistik emas.**
O'zbekiston shaxmat bozori kichik. Realistik shift: 100–300k ro'yxatdan o'tgan, 10–30k oylik faol. Pul B2C'dan emas, **B2B/B2G**'dan keladi. → [00-vision-and-market.md §3.2](./00-vision-and-market.md#32-realistik-shift)

**2. Eng katta xavf — texnik emas, bozor.**
Agar hakamlar Swiss-Manager'dan voz kechmasa, butun B2B model qulaydi. Bu **kod yozishdan oldin** 5 ta telefon qo'ng'irog'i bilan tekshirilishi kerak. → [00-vision-and-market.md §7](./00-vision-and-market.md#7-asosiy-taxminlar-va-ularni-tekshirish)

**3. Bir kishi uchun bu 1.5–2.5 yil.**
Yo'l xaritasi ~66–114 hafta baho beradi. Bu **baho, kafolat emas**. Eng katta xavflar: charchash, bus factor = 1. → [14-roadmap.md](./14-roadmap.md)

---

## Bloklovchi ochiq savollar

Bular hal qilinmaguncha tegishli modul **prod'ga chiqmaydi**:

| Savol | Kimga | Bloklaydi |
|---|---|---|
| Bolalar ma'lumoti bilan ishlash qonuniy talablari | **Yurist** | `school` moduli |
| Ma'lumot lokalizatsiyasi (fuqarolar ma'lumoti mamlakat ichida?) | **Yurist** | Hosting tanlovi |
| Fiskal chek / soliq talablari | **Yurist** | `billing` moduli |
| **chessground GPL-3.0 litsenziyasi** tijorat mahsulotga mos keladimi | **Yurist** | Frontend |
| ~~FIDE Handbook C.04.3 amaldagi matnini verbatim olish~~ **HAL QILINDI (2026-08-05):** [references/fide-c0403-dutch-2026-02.md](./references/fide-c0403-dutch-2026-02.md) — 2026-02-01 redaksiyasi, handbook.fide.com'dan | Dasturchi | `pairing` moduli |
| `τ` (Glicko-2) qiymati — backtest | Dasturchi | `rating` moduli |
| Hakamlar Swiss-Manager'dan ko'chadimi | **Bozor tekshiruvi** | **Butun loyiha** |

---

## TZ ni yangilash

Bu hujjatlar **tirik**. Ular kod bilan birga o'zgaradi.

- Qaror o'zgarsa → **yangi ADR**, eskisi "Almashtirilgan" deb belgilanadi. Eski ADR **o'chirilmaydi**
- Schema o'zgarsa → [03-data-model.md](./03-data-model.md) yangilanadi
- Ochiq savol hal bo'lsa → javob yoziladi va savol ro'yxatdan o'chiriladi

Kod va TZ farq qilsa — **bu bug**. Ikkisidan biri xato.

---

## Manba fayllar

Ba'zi hujjatlar kodni **tushuntiradi**, almashtirmaydi. Ziddiyat bo'lsa kod g'olib:

| Hujjat | Haqiqat manbai |
|---|---|
| [03-data-model.md](./03-data-model.md) | [`prisma/schema.prisma`](../prisma/schema.prisma) |
| [04-api-spec.md](./04-api-spec.md) | `/api/docs` (OpenAPI, avtomatik generatsiya) |
| [02-architecture.md](./02-architecture.md) §5 | [`.dependency-cruiser.js`](../.dependency-cruiser.js) — chegaralar CI'da majburlanadi |
