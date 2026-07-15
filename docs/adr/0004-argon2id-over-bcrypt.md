# ADR-0004 — Parol hash uchun Argon2id, bcrypt emas

- **Holat:** Qabul qilingan
- **Sana:** 2026-07-15

## Kontekst

Farzin foydalanuvchi parollarini saqlaydi. Baza o'g'irlansa, parollar qanchalik himoyalangan bo'lishi kerak?

Loyihaning oldingi versiyasida (`chess`) **bcrypt** ishlatilgan, cost factor **7** bilan:

```js
const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 7);
```

Cost 7 — 2026-yil uchun **juda past**. Va bu yerda ikkinchi xato ham bor: refresh token bcrypt bilan hash qilingan, bu keraksiz sekin (quyida).

## Qaror

**Parollar uchun: Argon2id.**

Boshlang'ich parametrlar (OWASP tavsiyasi asosida, **benchmark bilan tasdiqlanishi kerak**):

```ts
{
  type: argon2.argon2id,
  memoryCost: 19456,   // 19 MiB
  timeCost: 2,
  parallelism: 1,
}
```

**Refresh tokenlar uchun: SHA-256** (Argon2 emas, bcrypt emas).

## Sabablar

### Nega Argon2id

bcrypt (1999) — o'z davri uchun yaxshi edi. Muammosi: u **CPU-og'ir, lekin xotira-yengil**. Zamonaviy GPU va ASIC minglab bcrypt hash'ini parallel hisoblaydi, chunki har biri juda kam xotira talab qiladi.

Argon2 (2015, Password Hashing Competition g'olibi) — **memory-hard**. Har bir hash uchun sozlanadigan hajmda xotira kerak. GPU'da 10 000 ta parallel hash uchun 190 GB xotira kerak bo'ladi — bu iqtisodiy jihatdan hujumni o'ldiradi.

`argon2id` varianti — `argon2i` (side-channel himoyasi) va `argon2d` (GPU qarshiligi) ning gibridi. OWASP aynan shuni tavsiya qiladi.

| Xususiyat | bcrypt | Argon2id |
|---|---|---|
| CPU-og'ir | Ha | Ha |
| Memory-hard | **Yo'q** | **Ha** |
| GPU qarshiligi | Zaif | Kuchli |
| Parol uzunligi cheklovi | **72 bayt** (jimgina kesiladi!) | Yo'q |
| Sozlanuvchi parametrlar | 1 (cost) | 3 (memory, time, parallelism) |
| OWASP 2026 tavsiyasi | Faqat legacy uchun | **Birinchi tanlov** |

**bcrypt'ning 72-bayt cheklovi** alohida xavfli: undan uzun parol **jimgina kesiladi**. Foydalanuvchi 100 belgili parol qo'ysa, faqat birinchi 72 tasi hisobga olinadi va u buni bilmaydi.

### Nega cost 7 xavfli edi

bcrypt cost — logarifmik. Cost 7 = 2⁷ = 128 iteratsiya. 2026-yilda OWASP minimum **cost 10** tavsiya qiladi (2¹⁰ = 1024 iteratsiya, 8 baravar ko'p).

Cost 7 bilan hash'langan parollar zamonaviy GPU'da amalda **himoyasiz**.

### Nega refresh token uchun SHA-256

Bu nozik nuqta va ko'p loyihada xato qilinadi.

Parol — **past entropiyali** (odam o'ylab topgan, lug'at hujumiga ochiq). Shuning uchun sekin hash kerak: har urinish qimmatga tushsin.

Refresh token — **yuqori entropiyali** (256 bit tasodifiy). Uni brute-force qilish imkonsiz — hash qanchalik tez bo'lishidan qat'i nazar. Bu yerda sekin hash **hech qanday himoya bermaydi**, faqat har `POST /auth/refresh` so'rovini sekinlashtiradi.

Eski loyihada `bcrypt.hash(refreshToken, 7)` — har token yangilanishida keraksiz CPU sarfi. Va bu DoS vektori: hujumchi refresh endpoint'ini bombardimon qilib serverni bo'g'adi.

To'g'risi: SHA-256. Tez, va bu holatda **yetarli**.

## Oqibatlar

**Ijobiy:**
- Baza o'g'irlansa ham parollar amalda ochilmaydi
- Parol uzunligida cheklov yo'q
- Refresh endpoint tez va DoS'ga chidamli
- OWASP 2026 tavsiyasiga mos

**Salbiy:**
- Har login ~19 MiB xotira talab qiladi. 100 ta parallel login = ~2 GB. **Bu hisobga olinishi kerak** — rate limiting va sizing
- `argon2` npm paketi **native binding** — build muhitida kompilyator kerak. Docker image'da bu hisobga olinadi (multi-stage build)
- Parametrlar server quvvatiga bog'liq — **benchmark qilish shart**

**Benchmark maqsadi:** bitta hash ~50–100ms (prod hardware'da). Bu foydalanuvchi sezmaydigan, lekin hujumchini o'ldiradigan oraliq. O'lchanmaguncha yuqoridagi parametrlar **taxminiy**.

## Migratsiya

Eski `chess` loyihasidan foydalanuvchi ko'chirilmaydi (real foydalanuvchi yo'q edi). Shuning uchun migratsiya rejasi kerak emas.

Agar kelajakda kerak bo'lsa — standart yondashuv: login paytida eski hash bilan tekshirish, muvaffaqiyatli bo'lsa yangi algoritm bilan qayta hash qilish.

## Havolalar

- [10-security.md](../10-security.md)
- OWASP Password Storage Cheat Sheet
- RFC 9106 — Argon2
- Password Hashing Competition (2015)
