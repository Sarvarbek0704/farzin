# ADR-0002 — PostgreSQL yagona asosiy ma'lumot manbai

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15

## Kontekst

Farzin'ning ma'lumoti bir necha xil:

| Ma'lumot | Tabiati |
|---|---|
| Turnir → seksiya → tur → juftlik → natija | Qat'iy relyatsion, chuqur bog'langan |
| Reyting tarixi | Immutable, vaqt qatori |
| Yurishlar (`moves`) | Ko'p yoziladi, ketma-ket |
| To'lov, ledger | Tranzaksiya **majburiy** |
| Puzzle mavzulari | Massiv, ichidan qidirish |
| Fair-play dalillari | Yarim-strukturali (JSON) |
| Faol o'yin taymeri | Efemer, sekundiga minglab yangilanish |

Bu xilma-xillik "har biri uchun mos baza" (polyglot persistence) fikrini tug'diradi.

## Qaror

**PostgreSQL 17 — yagona asosiy manba (system of record).**

Redis **faqat** efemer ma'lumot uchun: cache, navbat, pub/sub, faol taymer, rate limit hisoblagichi.

Redis'da **hech qachon**: pul, audit log, reyting, turnir natijasi, yoki Redis yo'qolsa tiklab bo'lmaydigan biror narsa.

## Sabablar

### Nega PostgreSQL yetarli

- **Relyatsion ma'lumot** — asosiy oqim (turnir → natija → reyting) qat'iy bog'langan. Bu relyatsion bazaning aynan o'zi
- **Tranzaksiya** — to'lov va reyting uchun ACID muzokara qilinmaydi
- **JSONB** — yarim-strukturali ma'lumot (`inputGames`, `evidence`, `multiStageConfig`) uchun yetarli, va u index qilinadi (GIN)
- **Massiv + GIN** — `puzzles.themes` uchun ishlaydi
- **Partitioning** — `moves`, `audit_logs` vaqt bo'yicha bo'linadi
- **`NUMERIC`** — pul va reyting uchun aniq arifmetika

### Nega MongoDB emas

- Asosiy oqim relyatsion. Hujjat bazasida bu JOIN'larni qo'lda yozish demak
- Ko'p-hujjatli tranzaksiya bor, lekin PostgreSQL'nikidan zaifroq va qimmatroq
- Schema yo'qligi bu domenda **kamchilik** — turnir natijasi qat'iy struktura talab qiladi
- Farzin'ning hech bir muammosini MongoDB yaxshiroq hal qilmaydi

### Nega vaqt qatori bazasi (TimescaleDB/ClickHouse) emas

`moves` va `rating_history` vaqt qatoriga o'xshaydi. Lekin:
- Hajm hali kichik. PostgreSQL partitioning yetarli
- Ular boshqa jadvallar bilan JOIN qilinadi — alohida bazada bu qiyin
- Yangi infra, yangi backup, yangi monitoring — o'zini oqlamaydi

TimescaleDB — PostgreSQL kengaytmasi, kerak bo'lsa **keyin** qo'shiladi. Bu eshik ochiq.

### Nega faol taymer Redis'da

Bu **ataylab qilingan istisno** va uni asoslash kerak.

Faol o'yinda taymer sekundiga bir necha marta yangilanadi. 1000 ta faol o'yin → sekundiga minglab yozuv. PostgreSQL'ga bu yozuvlarni yozish:
- WAL'ni to'ldiradi
- Vacuum'ni bosadi
- Replikatsiyani sekinlashtiradi
- Va bu ma'lumot **hech kimga kerak emas** — faqat joriy sekundda

Shuning uchun taymer Redis'da. O'yin tugagach yakuniy holat PostgreSQL'ga.

**Xavf:** Redis yo'qolsa faol o'yinlar zarar ko'radi.

**Yumshatish:** Redis AOF persistence (`appendfsync everysec`) + **har yurish PostgreSQL'ga yoziladi** (`moves` jadvali). Redis yo'qolsa o'yinni yurishlar tarixidan tiklash mumkin — faqat qolgan vaqt taxminiy bo'ladi.

Bu **mukammal emas**. Lekin trade-off ochiq va ongli: 1000 ta o'yinning taymeri buzilishi (yiliga bir marta bo'lishi mumkin bo'lgan hodisa) — sekundiga minglab keraksiz yozuvdan arzonroq.

Batafsil: [07-realtime-and-clock.md](../07-realtime-and-clock.md).

## Oqibatlar

**Ijobiy:**
- Bitta baza — bitta backup, bitta monitoring, bitta migration tizimi
- JOIN ishlaydi. Hisobot yozish oddiy
- Tranzaksiya kafolati butun domenda
- Operatsion yuk minimal (bir kishilik jamoa uchun muhim)

**Salbiy:**
- PostgreSQL — yagona nuqta (single point of failure). Yumshatish: replica + PITR backup
- Redis'dagi taymer PostgreSQL bilan sinxron emas — yuqorida asoslangan
- Kelajakda analytics og'irlashsa, read replica yoki alohida OLAP kerak bo'ladi

## Qachon qayta ko'riladi

| Signal | Ehtimoliy chora |
|---|---|
| `moves` 100M+ qator va so'rov sekin | Partitioning → keyin TimescaleDB |
| Analytics asosiy bazani sekinlashtiradi | Read replica → keyin ClickHouse |
| Full-text qidiruv murakkablashadi | `pg_trgm` yetmasa → Meilisearch/Elastic |

Har bir qadam **o'lchov bilan**, oldindan emas.

## Havolalar

- [03-data-model.md](../03-data-model.md)
- [ADR-0001](./0001-modular-monolith.md)
