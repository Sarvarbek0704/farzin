# Arxitektura qarorlari (ADR)

**ADR** — Architecture Decision Record. Har bir muhim texnik qaror shu yerda yoziladi: **nima** qaror qilindi, **nega**, va **nima evaziga**.

## Nega ADR yoziladi

Olti oydan keyin siz (yoki jamoaga qo'shilgan yangi odam) "nega bu shunday qilingan?" deb so'raysiz. ADR bo'lmasa javob yo'q — va odam qarorni "yomon" deb hisoblab, o'zgartirib qo'yadi. Keyin o'sha muammoga qaytadan duch keladi.

ADR **niyatni** saqlaydi, kod esa faqat **natijani** saqlaydi.

## Format

Har bir ADR quyidagilarni beradi:

| Bo'lim | Nima uchun |
|---|---|
| **Kontekst** | Qanday sharoitda bu savol tug'ildi |
| **Qaror** | Nima qilindi — aniq va qisqa |
| **Sabablar** | Nega aynan shu. Alternativalar nega rad etildi |
| **Oqibatlar** | Ijobiy **va salbiy**. Salbiysiz ADR — reklama |
| **Qachon qayta ko'riladi** | Qaysi signal bu qarorni bekor qiladi |

**Salbiy oqibatlar bo'limi majburiy.** Har qaror narxga ega. Narxi ko'rsatilmagan qaror — o'ylanmagan qaror.

## Holat

- **Taklif** — muhokamada
- **Qabul qilingan** — amalda
- **Bekor qilingan** — endi amal qilmaydi, lekin **o'chirilmaydi** (tarix qimmatli)
- **Almashtirilgan** — yangi ADR bilan (havola bilan)

ADR **o'zgartirilmaydi**. Qaror o'zgarsa — yangi ADR yoziladi va eskisi "Almashtirilgan" deb belgilanadi. Bu tarixni saqlaydi.

## Ro'yxat

| # | Qaror | Holat | Nima evaziga |
|---|---|---|---|
| [0001](./0001-modular-monolith.md) | Modular monolith, mikroservis emas | Qabul qilingan | Chegara yemirilishi xavfi → CI bilan majburlanadi |
| [0002](./0002-postgres-primary-store.md) | PostgreSQL yagona asosiy manba | Qabul qilingan | Single point of failure → replica + PITR |
| [0003](./0003-glicko2-over-elo.md) | Glicko-2, Elo emas | Qabul qilingan | Batch hisoblash, real-time emas |
| [0004](./0004-argon2id-over-bcrypt.md) | Argon2id, bcrypt emas | Qabul qilingan | Har login ~19 MiB xotira |
| [0005](./0005-uuid-v7-primary-keys.md) | UUID v7 primary key | Qabul qilingan | 16 bayt vs 4/8, URL uzun |
| [0006](./0006-money-as-bigint-tiyin.md) | Pul: BigInt, tiyinda | Qabul qilingan | JSON serializatsiya qo'lda, kod shovqinli |
| [0007](./0007-blossom-matching-for-pairing.md) | Blossom matching (juftlashtirish) | Qabul qilingan | Murakkab, tayyor kutubxona yaroqsiz |
| [0008](./0008-transactional-outbox.md) | Transactional outbox | Qabul qilingan | Kechikish, har handler idempotent bo'lishi shart |

## Yangi ADR qachon yoziladi

Qaror **qaytarish qimmat** bo'lsa:

- Ma'lumotlar bazasi yoki asosiy framework tanlash
- Ma'lumot modelining tuzilmaviy qarori (PK tipi, pul ifodasi)
- Domen algoritmi tanlash (reyting formulasi, juftlashtirish)
- Xavfsizlik mexanizmi (hash, token strategiyasi)
- Modul chegarasini o'zgartirish
- Tashqi bog'liqlik qo'shish (yangi servis, yangi infra)

**ADR kerak emas:** kutubxona versiyasini yangilash, papka nomini o'zgartirish, kod uslubi (bular linter ishi).

Shubha bo'lsa — yozing. Yozilmagan ADR ning narxi yozilganidan yuqori.

## Yangi ADR yaratish

```bash
cp docs/adr/TEMPLATE.md docs/adr/00XX-qisqa-nom.md
```

Raqam ketma-ket. Nom `kebab-case`, qaror mazmunini bildirsin (`0009-redis-cluster.md`, `0009-new-decision.md` emas).
