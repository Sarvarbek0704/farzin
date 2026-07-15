# 04 — API spetsifikatsiyasi

> **Hujjat maqomi:** Tasdiqlangan · **Oxirgi yangilanish:** 2026-07-15
> **Haqiqat manbai:** ishga tushgan servisdagi `/api/docs` (OpenAPI 3.1, avtomatik generatsiya).
> Bu hujjat **tamoyillarni** belgilaydi; endpoint ro'yxati OpenAPI'dan olinadi.

---

## 1. Nega REST, GraphQL emas

| Mezon | REST | GraphQL |
|---|---|---|
| Mijozlar soni | 6-7 ta, hammasi bizniki | Ko'p va noma'lum bo'lsa foydali |
| So'rovlar oldindan ma'lummi | Ha | Yo'q bo'lsa foydali |
| HTTP cache | Ishlaydi | Murakkab |
| Rate limiting | Endpoint bo'yicha oddiy | Query cost analysis kerak |
| Frontend tiplari | OpenAPI'dan generatsiya | Schema'dan generatsiya |
| N+1 xavfi | Kam | DataLoader kerak |

Farzin'da mijozlar cheklangan va so'rovlar oldindan ma'lum. GraphQL bu yerda faqat murakkablik qo'shadi.

**WebSocket alohida** — real-time uchun ([07-realtime-and-clock.md](./07-realtime-and-clock.md)). REST va WS aralashtirilmaydi: REST — holat o'zgartirish va o'qish, WS — jonli oqim.

---

## 2. Umumiy konvensiyalar

### 2.1. Versiyalash

```
/api/v1/tournaments
```

- Buzuvchi o'zgarish → `/api/v2/`. Eski versiya kamida 6 oy yashaydi.
- Qo'shuvchi o'zgarish (yangi maydon, yangi endpoint) → versiya o'zgarmaydi.
- **Buzuvchi deb hisoblanadi:** maydon o'chirish, tip o'zgartirish, majburiy qilish, enum qiymatini olib tashlash, xatolik kodini o'zgartirish.

### 2.2. Resurs nomlari

- Ko'plik, `kebab-case`: `/api/v1/tournament-sections`
- Ichma-ich joylashuv **maksimum 2 daraja**: `/api/v1/rounds/{roundId}/pairings` ✅, `/api/v1/tournaments/{id}/sections/{id}/rounds/{id}/pairings` ❌
- Chuqurroq kerak bo'lsa — filter: `/api/v1/pairings?roundId=...`

### 2.3. HTTP metodlari

| Metod | Ma'no | Idempotent |
|---|---|---|
| `GET` | O'qish. **Hech qachon holat o'zgartirmaydi** | Ha |
| `POST` | Yaratish yoki harakat | Yo'q (`Idempotency-Key` bilan — ha) |
| `PATCH` | Qisman yangilash | Yo'q |
| `PUT` | To'liq almashtirish (kam ishlatiladi) | Ha |
| `DELETE` | O'chirish | Ha |

### 2.4. Javob formati

Muvaffaqiyat — **konvert yo'q**, resurs to'g'ridan-to'g'ri:

```json
{
  "id": "019839c2-7b3a-7000-8000-000000000001",
  "name": "Toshkent ochiq chempionati 2026",
  "status": "REGISTRATION_OPEN"
}
```

Nega konvert (`{ "data": {...}, "message": "..." }`) yo'q: HTTP status kodi allaqachon holatni bildiradi. Qo'shimcha qatlam faqat shovqin. Eski `chess` loyihasida har javob `{ message: "Round fetched successfuly", data: ... }` edi — `message` hech kimga kerak emas edi va imlo xatosi bilan.

Ro'yxat — pagination bilan:

```json
{
  "items": [ { "id": "...", "name": "..." } ],
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "eyJpZCI6IjAxOTgzOWMyIn0"
  }
}
```

### 2.5. Xatolik formati — RFC 9457 (Problem Details)

```json
{
  "type": "https://farzin.uz/errors/pairing-impossible",
  "title": "Juftlashtirish imkonsiz",
  "status": 422,
  "code": "PAIRING_IMPOSSIBLE",
  "detail": "Barcha imkoniyatlar tekshirildi, C1 kriteriysi buzilmasdan juftlik topilmadi",
  "instance": "/api/v1/rounds/019839c2-7b3a-7000-8000-000000000001/pairings",
  "traceId": "0af7651916cd43dd8448eb211c80319c"
}
```

Validatsiya xatosi — maydon darajasida:

```json
{
  "type": "https://farzin.uz/errors/validation-failed",
  "title": "Validatsiya xatosi",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "traceId": "0af7651916cd43dd8448eb211c80319c",
  "errors": [
    { "field": "startDate", "code": "MUST_BE_FUTURE", "message": "Boshlanish sanasi kelajakda bo'lishi kerak" },
    { "field": "totalRounds", "code": "OUT_OF_RANGE", "message": "1 dan 23 gacha bo'lishi kerak" }
  ]
}
```

**Qoidalar:**
- `code` — mashina uchun, `SCREAMING_SNAKE_CASE`, hech qachon o'zgarmaydi
- `title` va `message` — odam uchun, `Accept-Language` ga qarab tarjima qilinadi
- `traceId` — har doim bor. Foydalanuvchi shuni aytadi, biz log'dan topamiz
- 500 xatosida **hech qachon** ichki detal (stack, SQL, fayl yo'li) chiqmaydi

### 2.6. Status kodlari

| Kod | Qachon |
|---|---|
| 200 | OK |
| 201 | Yaratildi (+ `Location` header) |
| 202 | Qabul qilindi, background job (masalan juftlashtirish) |
| 204 | O'chirildi |
| 400 | Validatsiya xatosi |
| 401 | Autentifikatsiya yo'q yoki yaroqsiz |
| 403 | Autentifikatsiya bor, lekin ruxsat yo'q |
| 404 | Topilmadi **yoki ko'rish huquqi yo'q** (ma'lumot sizdirmaslik uchun) |
| 409 | Konflikt (masalan turnir allaqachon boshlangan) |
| 422 | Domen qoidasi buzildi (sintaksis to'g'ri, mantiq noto'g'ri) |
| 429 | Rate limit |
| 500 | Ichki xato |

**400 va 422 farqi:** 400 — "`startDate` sana emas". 422 — "sana to'g'ri, lekin turnir allaqachon boshlangan, o'zgartirib bo'lmaydi".

**403 va 404 farqi:** boshqaning shaxsiy turnirini so'rasangiz — **404**, 403 emas. 403 "bu resurs bor, lekin sizga ruxsat yo'q" deb ma'lumot sizdiradi.

---

## 3. Autentifikatsiya

```http
Authorization: Bearer <access_token>
```

- **Access token** — JWT, ~15 daqiqa, javob body'sida qaytadi, mijozda **xotirada** saqlanadi (localStorage emas — XSS)
- **Refresh token** — opaque, ~30 kun, **httpOnly + Secure + SameSite=Strict** cookie'da
- Refresh rotation + reuse detection — [10-security.md](./10-security.md)

Batafsil oqim: [02-architecture.md §9](./02-architecture.md#9-autentifikatsiya-oqimi).

### 3.1. Access token payload

```ts
interface AccessTokenPayload {
  sub: string;        // userId (UUID v7)
  jti: string;        // token ID — bekor qilish uchun
  roles: Array<{
    role: Role;
    scopeType: string | null;
    scopeId: string | null;
  }>;
  iat: number;
  exp: number;
}
```

**Muhim:** token'da rol bor, lekin bu **yetarli emas**. Guard baribir resurs darajasida tekshiradi — klub admini faqat o'z klubini boshqaradi. Token'dagi rol faqat birinchi filtr.

Eski `chess` loyihasida bu bo'lmagan: `roleGuard(["Admin"])` faqat rolni tekshirar edi, resursni emas.

---

## 4. Pagination — cursor, offset emas

```http
GET /api/v1/tournaments?first=20&after=eyJpZCI6IjAxOTgzOWMyIn0
```

**Nega offset emas:**
1. `OFFSET 100000` — PostgreSQL 100 000 qatorni o'qib tashlab yuboradi. Sekin.
2. Yangi qator qo'shilsa, sahifalar suriladi — foydalanuvchi bir elementni ikki marta ko'radi yoki umuman ko'rmaydi.

Cursor — oxirgi element ID'si (base64). UUID v7 vaqt bo'yicha tartiblangani uchun cursor to'g'ridan-to'g'ri ishlaydi:

```sql
WHERE id > $cursor ORDER BY id LIMIT $first + 1
```

`first + 1` — `hasNextPage` ni aniqlash uchun.

**Istisno:** turnir jadvali (`standings`) — offset ruxsat etiladi, chunki u cheklangan (500 o'yinchi) va rank bo'yicha sakrash kerak.

---

## 5. Idempotentlik

```http
POST /api/v1/invoices/{id}/payments
Idempotency-Key: 019839c2-7b3a-7000-8000-000000000001
```

**Majburiy** quyidagilarda:
- Har qanday to'lov operatsiyasi
- Natija kiritish (`PATCH /pairings/{id}/result`)
- Juftlashtirish ishga tushirish

Server kalitni saqlaydi. Bir xil kalit bilan takroriy so'rov → **birinchi javob qaytariladi**, operatsiya qayta bajarilmaydi.

Kalit yashash muddati: 24 soat.

```ts
// Konflikt: bir xil kalit, boshqacha body → 422
{
  "code": "IDEMPOTENCY_KEY_REUSE",
  "detail": "Bu Idempotency-Key boshqa so'rov uchun ishlatilgan"
}
```

---

## 6. Rate limiting

Har javobda:

```http
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 42
```

429 bo'lsa `Retry-After` ham.

| Endpoint | Limit | Kalit |
|---|---|---|
| `POST /auth/login` | 5 / 15 daqiqa | IP + email |
| `POST /auth/register` | 3 / soat | IP |
| `POST /auth/password-reset` | 3 / soat | IP + email |
| `POST /auth/refresh` | 30 / soat | userId |
| `GET /*` (autentifikatsiyalangan) | 300 / daqiqa | userId |
| `GET /*` (anonim) | 60 / daqiqa | IP |
| `POST /pairings:generate` | 10 / soat | tournamentId |
| WebSocket `game:move` | 1 / 100ms | userId + gameId |

Implementatsiya: Redis sliding window. Batafsil: [10-security.md](./10-security.md).

---

## 7. Filtrlash, tartiblash, tanlash

```http
GET /api/v1/tournaments
  ?status=REGISTRATION_OPEN
  &regionId=019839c2-...
  &startDate[gte]=2026-08-01
  &sort=-startDate,name
  &first=20
```

- Filter — query param, operator kvadrat qavsda: `[gte]`, `[lte]`, `[in]`, `[contains]`
- Sort — vergul bilan, `-` = kamayish tartibida
- **Ruxsat etilgan maydonlar oq ro'yxatda (whitelist).** Ixtiyoriy maydon bo'yicha sort/filter — SQL injection va performance xavfi

---

## 8. Asosiy endpoint'lar

To'liq ro'yxat — `/api/docs`. Bu yerda faqat asosiylari va **nozik joylari**.

### 8.1. Identity

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh          → cookie'dan o'qiydi, body'da hech narsa yo'q
POST   /api/v1/auth/logout
POST   /api/v1/auth/verify-phone     → Eskiz SMS OTP
POST   /api/v1/auth/totp/enable
GET    /api/v1/auth/me
```

### 8.2. Tournament

```
GET    /api/v1/tournaments
POST   /api/v1/tournaments
GET    /api/v1/tournaments/{id}
PATCH  /api/v1/tournaments/{id}
POST   /api/v1/tournaments/{id}/sections
POST   /api/v1/sections/{id}/registrations
DELETE /api/v1/registrations/{id}          → chiqish (withdrawal)
```

### 8.3. Pairing — bu yerda nozik joy bor

```
POST   /api/v1/rounds/{id}/pairings:generate   → 202 Accepted
GET    /api/v1/rounds/{id}/pairings
PATCH  /api/v1/pairings/{id}                    → qo'lda tuzatish (hakam)
```

**Nega `202`, `201` emas:** juftlashtirish 500 o'yinchi uchun sekundlar oladi va BullMQ job sifatida bajariladi. HTTP so'rovi javobni kutmaydi.

```json
// 202 Accepted
{
  "jobId": "019839c2-7b3a-7000-8000-000000000001",
  "status": "PAIRING_IN_PROGRESS",
  "pollUrl": "/api/v1/rounds/019839c2-.../pairings"
}
```

Mijoz natijani WebSocket orqali oladi (`round:paired` event) yoki `pollUrl` ni so'raydi.

**Nega `:generate` (RPC uslubi), `POST /pairings` emas:** bu resurs yaratish emas, **harakat**. Juftlashtirish algoritmi ishga tushadi va natijada N ta `Pairing` paydo bo'ladi. RESTda bunga toza mos keladigan shakl yo'q — Google AIP-136 (Custom Methods) yondashuvi ishlatiladi.

**Hakam qo'lda tuzatishi (`PATCH /pairings/{id}`):** bu **majburiy** funksiya. Algoritm mukammal emas, va FIDE qoidalari hakamga oxirgi so'zni beradi. Lekin har bir qo'lda o'zgarish `AuditLog` ga yoziladi — kim, qachon, nima uchun.

### 8.4. Arbiter

```
PATCH  /api/v1/pairings/{id}/result     → Idempotency-Key MAJBURIY
POST   /api/v1/rounds/{id}:complete
POST   /api/v1/appeals
```

Natija kiritish idempotent bo'lishi shart: hakam tugmani ikki marta bossa yoki tarmoq uzilsa, natija ikki marta yozilmasligi kerak.

### 8.5. Rating

```
GET    /api/v1/players/{id}/ratings
GET    /api/v1/players/{id}/rating-history?environment=OTB&timeCategory=CLASSICAL
GET    /api/v1/ratings/leaderboard?environment=OTB&timeCategory=CLASSICAL&first=50
POST   /api/v1/rating-periods/{id}:compute    → 202, faqat SUPER_ADMIN
```

`rating-history` javobida `inputGames` bor — "reytingim nega tushdi?" savoliga javob ([03-data-model.md §3.4](./03-data-model.md#34-reyting-playerrating-joriy-vs-ratinghistory-ozgarishlar)).

### 8.6. Play

REST faqat o'yin yaratish va tarixni o'qish uchun. **O'yinning o'zi WebSocket orqali** ([07-realtime-and-clock.md](./07-realtime-and-clock.md)).

```
POST   /api/v1/play/matchmaking:join
DELETE /api/v1/play/matchmaking
GET    /api/v1/games/{id}
GET    /api/v1/games/{id}/pgn           → text/plain, PGN formatida
```

### 8.7. Billing

```
POST   /api/v1/invoices/{id}/payments     → Idempotency-Key MAJBURIY
POST   /api/v1/webhooks/click             → imzo tekshiriladi, auth yo'q
POST   /api/v1/webhooks/payme
```

Webhook'lar `Authorization` header'siz keladi — himoya **imzo tekshiruvi** orqali ([09-payments-and-billing.md](./09-payments-and-billing.md)).

---

## 9. Ko'p tillilik

```http
Accept-Language: uz-Latn, ru;q=0.8, en;q=0.5
```

Qo'llab-quvvatlanadi: `uz-Latn` (default), `uz-Cyrl`, `ru`, `en`.

Tarjima qilinadi: `title`, `detail`, `message`, validatsiya matnlari.
Tarjima **qilinmaydi**: `code`, enum qiymatlari, resurs nomlari (foydalanuvchi kiritgan).

---

## 10. OpenAPI va mijoz generatsiyasi

NestJS `@nestjs/swagger` bilan OpenAPI 3.1 avtomatik generatsiya qilinadi.

```
GET /api/docs        → Swagger UI (faqat non-prod)
GET /api/docs-json   → OpenAPI JSON
```

Frontend tiplari **qo'lda yozilmaydi**:

```bash
pnpm openapi:generate   # openapi-typescript + orval
```

Sabab: qo'lda yozilgan tip backend bilan farqlanib ketadi va buni hech kim sezmaydi. Generatsiya qilingan tip esa CI da tekshiriladi — API o'zgarsa frontend build yiqiladi. Bu **yaxshi**.

CI'da: OpenAPI diff tekshiriladi. Buzuvchi o'zgarish PR'da belgilanadi.

---

## 11. Nima YO'Q va nega

| Yo'q | Sabab |
|---|---|
| `PUT` bilan to'liq almashtirish | `PATCH` yetarli, `PUT` xato bilan maydon o'chiradi |
| Batch endpoint (`POST /pairings/batch`) | Kerak bo'lganda qo'shiladi. Hozircha YAGNI |
| `?include=sections,rounds` (eager loading) | N+1 ni yashiradi. Kerak bo'lsa alohida endpoint |
| Soft delete API'da ko'rinishi | O'chirilgan resurs 404. `deleted_at` — ichki detal |
| `GET` bilan holat o'zgartirish | Hech qachon. Crawler bosib ketadi |

---

## 12. Acceptance criteria

- [ ] Har bir endpoint OpenAPI'da hujjatlashtirilgan (`@ApiOperation`, `@ApiResponse`)
- [ ] Har bir DTO `class-validator` bilan validatsiya qilinadi, `whitelist: true` va `forbidNonWhitelisted: true`
- [ ] Har bir xatolik RFC 9457 formatida va `traceId` bor
- [ ] 500 javobida ichki detal yo'q — test bilan tekshiriladi
- [ ] Boshqaning resursi so'ralganda 404 (403 emas) — test bilan tekshiriladi
- [ ] To'lov va natija endpoint'lari `Idempotency-Key` talab qiladi
- [ ] Rate limit header'lari har javobda
- [ ] Cursor pagination ishlaydi va `hasNextPage` to'g'ri
- [ ] Sort/filter faqat oq ro'yxatdagi maydonlarda
- [ ] OpenAPI'dan frontend tiplari generatsiya qilinadi va CI'da tekshiriladi
- [ ] `GET` hech qachon holat o'zgartirmaydi — arxitektura testi bilan

---

## 13. Ochiq savollar

1. **Webhook retry siyosati** — Click/Payme necha marta va qanday oraliqda qayta yuboradi? Rasmiy hujjatdan aniqlanishi kerak → [09-payments-and-billing.md](./09-payments-and-billing.md)
2. **Public API kerakmi** — uchinchi tomon (masalan Chess-Results) Farzin ma'lumotini olishi kerakmi? Agar ha — API key, quota, alohida versiyalash.
3. **Turnir eksport formati** — Swiss-Manager `.trf` (TRF16) formatini qo'llab-quvvatlash kerakmi? Bu migratsiya uchun muhim bo'lishi mumkin (mavjud turnirlarni import qilish).
