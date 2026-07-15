# ADR-0005 — Primary key sifatida UUID v7

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15

## Kontekst

Har bir jadval uchun PK tanlash kerak. Variantlar: `SERIAL`/`BIGSERIAL` (auto-increment), UUID v4, UUID v7, ULID.

Eski `chess` loyihasida auto-increment INTEGER ishlatilgan:

```js
id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
```

## Qaror

**UUID v7** — barcha jadvallarda.

```prisma
id String @id @default(uuid(7)) @db.Uuid
```

Talab: **Prisma ≥ 5.14**.

## Sabablar

### Auto-increment nima uchun yaramaydi

**1. Ma'lumot sizdiradi.** `/api/v1/tournaments/47` — raqib bizda atigi 47 ta turnir borligini biladi. Ertaga `48` chiqsa, o'sish tezligini ham biladi. Bu **German tank problem** — biznes ma'lumoti bepul tarqaladi.

**2. Enumeration hujumi.** `/api/v1/players/1`, `/2`, `/3`... — butun bazani ketma-ket o'qib chiqish mumkin. Avtorizatsiya bo'lsa ham, mavjudlik faktining o'zi ma'lumot (404 va 403 farqi — [04-api-spec.md §2.6](../04-api-spec.md#26-status-kodlari)).

**3. ID ni oldindan bilib bo'lmaydi.** Client-side'da bog'langan obyektlar yaratish uchun round-trip kerak. Offline-first (arbiter console) uchun bu jiddiy to'siq.

**4. Merge/import muammosi.** Ikki bazani birlashtirish yoki tashqi turnir import qilish — ID konflikti.

### UUID v4 nima uchun yaramaydi

UUID v4 — **to'liq tasodifiy**. Yangi qator B-tree index'ning tasodifiy joyiga tushadi:

```
Index sahifalari:  [1..100] [101..200] [201..300]
Yangi UUID v4:         ↓         ↓          ↓
                   tasodifiy joyga → sahifa bo'linadi (page split)
```

Natija:
- Yozuv sekinlashadi (har insert sahifa bo'linishiga olib kelishi mumkin)
- Index shishadi (sahifalar to'liq to'lmaydi — fragmentatsiya)
- Cache samarasiz (yangi qatorlar butun index bo'ylab tarqaladi)

Katta jadvallarda (`moves`, `audit_logs`) bu sezilarli.

### UUID v7 nima qiladi

UUID v7 tuzilishi (RFC 9562):

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        unix_ts_ms (48 bit)                    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  ver  |          rand_a       |var|         rand_b            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          rand_b (62 bit)                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

Birinchi 48 bit — Unix timestamp (millisekundda). Ya'ni **UUID v7 vaqt bo'yicha tartiblanadi**.

Natija: yangi qatorlar index **oxiriga** ketma-ket tushadi — auto-increment kabi. Sahifa bo'linishi yo'q, fragmentatsiya yo'q, cache samarali.

Va shu bilan birga: 74 bit tasodifiy → taxmin qilib bo'lmaydi, enumeration ishlamaydi, ma'lumot sizmaydi.

**Bonus:** `ORDER BY id` = `ORDER BY created_at` (millisekund aniqligida). Cursor pagination bevosita ishlaydi ([04-api-spec.md §4](../04-api-spec.md#4-pagination--cursor-offset-emas)).

### Nega ULID emas

ULID ham vaqt bo'yicha tartiblangan. Lekin:
- UUID v7 — **RFC 9562 standarti** (2024-yilda rasmiylashtirilgan). ULID — de-fakto spetsifikatsiya
- PostgreSQL'da native `uuid` tipi bor (16 bayt). ULID `text` yoki `bytea` sifatida saqlanadi
- Prisma UUID v7'ni native qo'llab-quvvatlaydi
- Ekotizim qo'llab-quvvatlashi kengroq

ULID'ning yagona ustunligi — qisqaroq matn ko'rinishi (26 vs 36 belgi). Bu yetarli sabab emas.

## Oqibatlar

**Ijobiy:**
- Ma'lumot sizmaydi, enumeration ishlamaydi
- Index samarali (v4'dan farqli)
- ID client-side'da generatsiya qilinishi mumkin → offline-first uchun yo'l ochiq
- `ORDER BY id` = vaqt tartibi
- Merge/import konfliktsiz

**Salbiy:**
- **16 bayt** vs 4/8 bayt. `moves` jadvalida 100M qator → ~1.2 GB qo'shimcha (PK + FK). Sezilarli, lekin qabul qilinadi
- URL uzun: `/tournaments/019839c2-7b3a-7000-8000-000000000001`
- Odam o'qishi qiyin — debug va support suhbatida noqulay
- **Yaratilish vaqti ID'da ko'rinadi** — bu ma'lumot sizdirishi mumkin (qachon yaratilgani). Farzin'da bu maxfiy emas (`created_at` baribir ochiq)
- Prisma ≥ 5.14 talabi

## Havolalar

- [03-data-model.md §1.1](../03-data-model.md#11-nega-uuid-v7-uuid-v4-emas)
- RFC 9562 — UUIDv7
- Buzz Andersen — "The problem with UUID v4 as a primary key"
