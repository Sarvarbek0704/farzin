# ADR-0001 — Modular monolith, mikroservis emas

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15
- **Qaror qabul qildi:** Sarvarbek Sodiqov

## Kontekst

Farzin 16 ta funksional moduldan iborat ([02-architecture.md §5](../02-architecture.md#5-modul-xaritasi)). Ularning yuklama profili turlicha:

- `play` — ko'p WebSocket ulanishi, uzoq yashaydigan holat
- `fairplay` — Stockfish NNUE, CPU-og'ir, batch
- `tournament`, `rating` — oddiy CRUD + og'ir hisob-kitob
- `analytics` — ko'p o'qish, kam yozish

Bu farq "har biri alohida servis bo'lsin" degan fikrni tug'diradi.

Boshlang'ich sharoit: **loyihani bir kishi yozadi**. Foydalanuvchi soni nol. Bozor hajmi realistik bahoda 100–300k ro'yxatdan o'tgan foydalanuvchi ([00-vision-and-market.md §3.2](../00-vision-and-market.md#32-realistik-shift)).

## Qaror

**Modular monolith.** Bitta deploy qilinadigan ilova, ichida qat'iy chegaralangan modullar.

Chegara majburlanadi:
- Har modul o'z papkasida, o'z `*.module.ts` faylida
- Modul boshqa modulning service'iga to'g'ridan-to'g'ri murojaat qilmaydi — faqat `*.port.ts` interfeysi orqali
- Modul boshqa modulning jadvaliga so'rov yubormaydi
- Bu qoidalar **ESLint** (`import/no-restricted-paths`) va **dependency-cruiser** bilan CI'da tekshiriladi — niyat bilan emas

## Sabablar

**Mikroservis nimani hal qiladi:**
1. Mustaqil deploy (jamoalar bir-birini bloklamaydi)
2. Mustaqil masshtablash
3. Texnologiya xilma-xilligi
4. Xatolik izolyatsiyasi

**Farzin'da hozir:**
1. Jamoa — **bir kishi**. Bloklanadigan hech kim yo'q
2. Yuklama — **nol**. Masshtablash muammosi yo'q
3. Hammasi TypeScript. Xilma-xillik kerak emas
4. Foydalanuvchi yo'q. Izolyatsiya kimni himoya qiladi?

**Mikroservis nimani qo'shadi:**
- Distributed tranzaksiya (saga, compensation) — to'lov va reyting uchun bu jiddiy murakkablik
- Tarmoq xatosi har chaqiruvda mumkin → retry, circuit breaker, timeout
- Deploy: 16 ta pipeline, 16 ta versiya, moslik matritsasi
- Lokal dev: 16 ta servis ko'tarish
- Kuzatuv: distributed tracing majburiy bo'ladi
- Ma'lumot: har servis o'z DB'siga → JOIN yo'q → API composition yoki CQRS

Bularning **hech biri** hozir hal qilinishi kerak bo'lgan muammoni hal qilmaydi. Hammasi yangi muammo qo'shadi.

Martin Fowler'ning "Monolith First" tamoyili: mikroservisga o'tish uchun **domen chegaralarini bilish** kerak. Farzin'da ular hali nazariy. Noto'g'ri chegara bilan ajratilgan servislarni qayta birlashtirish — monolitni ajratishdan qiyinroq.

## Oqibatlar

**Ijobiy:**
- Bitta deploy, bitta log oqimi, bitta debug sessiyasi
- Tranzaksiya oddiy: `prisma.$transaction()` ishlaydi
- Refactoring arzon — IDE butun kodni ko'radi
- Lokal dev: `docker compose up`

**Salbiy:**
- Butun ilova birga deploy bo'ladi → kichik o'zgarish ham to'liq CI
- Bitta modul xotira yeb qo'ysa — hammasi yiqiladi
- Chegarani buzish oson — shuning uchun CI tekshiruvi **majburiy**, tavsiya emas
- Masshtablash faqat butun ilova darajasida (dastlab)

**Xavf:** chegara vaqt o'tishi bilan yemiriladi ("big ball of mud"). Yumshatish: CI tekshiruvi + har PR'da arxitektura testi. Agar bu test o'chirilsa yoki chetlab o'tilsa — ADR buzilgan hisoblanadi.

## Qachon qayta ko'riladi

Quyidagilardan **kamida bittasi** ro'y berganda:

| Signal | O'lchov |
|---|---|
| Jamoa 8+ kishi | Deploy navbati muammo bo'ladi |
| `play` moduli alohida masshtablashni talab qiladi | WebSocket ulanishlari boshqa modullarni siqib chiqarsa |
| `fairplay` CPU'ni yeb qo'yadi | Stockfish tahlili API javob vaqtiga ta'sir qilsa |
| Deploy chastotasi bloklanadi | Bitta modul CI'ni doim yiqitsa |

Birinchi ajratish nomzodlari: **`play`** (WebSocket, boshqa yuklama profili) va **`fairplay`** (CPU-og'ir, batch).

Chegara toza bo'lgani uchun ajratish **mumkin bo'ladi** — bu ADR ning asosiy maqsadi.

## Alternativalar

| Variant | Nega rad etildi |
|---|---|
| **Mikroservis** | Yuqorida asoslangan — muammosiz murakkablik |
| **Serverless** | WebSocket va uzoq yashaydigan taymer serverless'ga mos kelmaydi. Stockfish tahlili timeout'ga tushadi |
| **Oddiy monolit** (modulsiz) | Bugun tezroq, 6 oydan keyin qimmatroq. Chegara keyin qo'yilmaydi |

## Havolalar

- [02-architecture.md](../02-architecture.md)
- Martin Fowler — "MonolithFirst" (2015)
- Simon Brown — "Modular Monoliths"
