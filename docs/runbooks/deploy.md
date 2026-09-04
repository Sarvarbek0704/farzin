# Deploy — production

> Stack: `docker-compose.prod.yml` · Muhit: `.env.prod` (commit QILINMAYDI)

Bu runbook **birinchi deploy** va **keyingi yangilanishlar** uchun. Har
qadam nima uchun kerakligi bilan yozilgan — buyruqni ko'chirib qo'yish
emas, nima bo'layotganini tushunish uchun.

---

## Deploy'dan oldin: QAROR TALAB QILADIGAN uchta narsa

Kod tayyor, lekin quyidagilarni **odam hal qiladi** — ular server va
biznes qarori, texnik emas.

### 1. Domen

`.env.prod` dagi uchta maydon shundan kelib chiqadi va **noto'g'ri
bo'lsa jimgina buziladi**: email havolalari ishlamaydi, WebSocket
ulanmaydi.

**A variant — ikki domen** (runbook shu variantga yozilgan):

```env
APP_URL=https://farzin.uz
PUBLIC_API_URL=https://api.farzin.uz
CORS_ORIGINS=https://farzin.uz
```

**B variant — bitta domen, `/api` yo'li bilan:**

```env
APP_URL=https://farzin.uz
PUBLIC_API_URL=https://farzin.uz
CORS_ORIGINS=https://farzin.uz
```

B variantda nginx `/api/` va `/socket.io/` ni backendga, qolganini
frontendga uzatadi (§3 dagi ikkinchi konfiguratsiya). B'ning afzalligi —
bitta sertifikat va CORS umuman ishlamaydi (hammasi bir origin).

### 2. SMTP

`SMTP_HOST` bo'sh bo'lsa ilova **ishlaydi**, lekin tasdiqlash va parol
tiklash xatlari **yuborilmaydi** — ya'ni yangi foydalanuvchi hisobini
tasdiqlay olmaydi. Birinchi superadmin uchun bu to'siq emas (§4 da
vosita bor), oddiy foydalanuvchilar uchun — to'siq.

### 3. Fair-play worker'i

Default'da **ko'tarilmaydi** (`profiles: [fairplay]`). Sabab —
docker-compose.prod.yml dagi izoh. Yoqish kerak bo'lsa §2 ga qarang.

---

## 0. Oldindan tekshirish

Server bitta va unda **ko'p loyiha** ishlaydi. Shuning uchun deploy'dan
oldin uch narsa tekshiriladi: **port bo'shmi**, **disk yetarlimi** va
**xotira qolganmi**.

```bash
# Portlar band emasmi (.env.prod dagi qiymatlar bilan solishtiring)
ss -tlnp | grep -E ':(3110|3111)\b' || echo "bo'sh ✓"

# Nom to'qnashuvi bo'lmasin
docker ps -a --format '{{.Names}}' | grep '^farzin-' || echo "toza ✓"

# Disk: image'lar ~3 GB, build esa vaqtincha yana shuncha oladi
df -h / | tail -1

# Xotira: stack ~700 MB oladi (postgres 150 + redis 30 + api 200 + web 150)
free -m | head -2
```

**Joy yetmasa** — build keshi odatda eng katta zaxira:

```bash
docker builder prune -f     # faqat QURISH keshi; image/konteyner/volume TEGILMAYDI
```

> **2026-09-04 holati:** shu buyruq bilan 29.41 GB bo'shatildi
> (disk 84% → 48%, 40 GB bo'sh). 38 ta boshqa konteyner ishlashda
> davom etdi. Portlar: 3110 va 3111 **bo'sh**, 3100 esa **band**.
> Xotira: 1.2 GB bo'sh + 2.2 GB swap — stack sig'adi, lekin zaxira kam.
>
> **Compose fayli o'sha serverda tekshirilgan** (`config --services`):
> default'da `postgres · migrate · redis · app · web`, `--profile
fairplay` bilan `worker` ham qo'shiladi. Sir berilmasa compose
> **ataylab yiqiladi** (`required variable REDIS_PASSWORD is missing`) —
> jimgina bo'sh parol bilan ko'tarilmaydi.

`farzin-*` konteynerlari allaqachon bo'lsa — bu **yangilanish**, 5-bo'limga
o'ting.

---

## 1. Kod va muhit

```bash
cd /opt/farzin            # yoki loyiha papkangiz
git pull

cp .env.prod.example .env.prod
chmod 600 .env.prod       # faqat root o'qiy olsin
```

`.env.prod` ni to'ldiring. **Sirlar generatsiyasi:**

```bash
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 32   # REDIS_PASSWORD
openssl rand -base64 64   # JWT_ACCESS_SECRET
openssl rand -base64 64   # JWT_REFRESH_SECRET   ← access'dan BOSHQA
openssl rand -hex 32      # TOTP_ENCRYPTION_KEY  ← aynan 64 hex belgi
openssl rand -base64 48   # METRICS_TOKEN
```

⚠️ **`DATABASE_URL` ichidagi parol `POSTGRES_PASSWORD` bilan bir xil
bo'lishi kerak** — ular ikki alohida maydon va mos kelmasa `app`
konteyneri ishga tushmaydi, `postgres` esa sog'lom ko'rinaveradi.

⚠️ **Zaif kalit ilovani ISHGA TUSHIRMAYDI.** `configuration.ts` prod'da
`CHANGE_ME`, `secret`, `password` kabi qiymatlarni rad etadi. Bu ataylab:
jimgina zaif kalit bilan ishlab turgandan ko'ra, ishga tushmagani yaxshi.

---

## 2. Qurish va ko'tarish

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Tartib avtomatik: `postgres` + `redis` sog'lom bo'ladi → `migrate`
ishlaydi va **tugaydi** → `app` va `worker` ko'tariladi → `app` sog'lom
bo'lgach `web`.

**Migratsiya alohida xizmat** — u app entrypoint'ida bo'lsa, ko'p
replikada ikki konteyner bir vaqtda migratsiya qilishga urinardi.

```bash
# Migratsiya muvaffaqiyatli tugaganini KO'RING (exit 0)
docker compose -f docker-compose.prod.yml --env-file .env.prod logs migrate

docker ps --filter name=farzin- --format '{{.Names}}\t{{.Status}}'
```

Kutilgan: `farzin-postgres`, `farzin-redis`, `farzin-app`,
`farzin-web` — hammasi `Up (healthy)`.
`farzin-migrate` — `Exited (0)`, bu **to'g'ri**.

`farzin-worker` ro'yxatda **yo'q** — u ataylab profil ortida. Fair-play
tahlilini yoqish kerak bo'lsa:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  --profile fairplay up -d
```

Worker'siz tahlil ishlari **yo'qolmaydi** — ular navbatda to'planib
turadi va worker ko'tarilgach qayta ishlanadi (API faqat PRODUCER).

---

## 3. Reverse proxy

Konteynerlar `127.0.0.1` ga bog'langan — internetga to'g'ridan-to'g'ri
chiqmaydi. TLS va domen proxy darajasida.

Ikki manzil kerak:

| Domen           | Ichki manzil     | Nima     |
| --------------- | ---------------- | -------- |
| `farzin.uz`     | `127.0.0.1:3111` | frontend |
| `api.farzin.uz` | `127.0.0.1:3110` | API      |

⚠️ **WebSocket majburiy.** O'yin soati va jonli taxta `/socket.io` orqali
ishlaydi. Proxy `Upgrade` va `Connection` sarlavhalarini o'tkazmasa,
sahifa ochiladi-yu, taxta abadiy "Ulanilmoqda" holatida qoladi.

Nginx uchun minimal blok:

```nginx
location / {
    proxy_pass http://127.0.0.1:3110;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;   # ← WebSocket
    proxy_set_header Connection "upgrade";       # ← WebSocket
    proxy_set_header Host       $host;
    proxy_set_header X-Real-IP  $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # O'yin soketi uzoq yashaydi — default 60s uni uzib qo'yardi.
    proxy_read_timeout 3600s;
}
```

`X-Forwarded-For` **kerak**: usiz rate limiting hamma so'rovni bitta IP
deb ko'radi va bitta foydalanuvchi butun serverni bloklab qo'yishi mumkin.

### B variant — BITTA domen

Bitta `server` bloki, uchta `location`. **Tartib muhim**: aniqroq yo'llar
oldin turadi, aks holda `/` hammasini o'ziga oladi.

```nginx
server {
    server_name farzin.uz;

    # WebSocket — ENG BIRINCHI. Socket.IO `/socket.io/` yo'lini
    # ishlatadi va u API'ga borishi kerak, frontendga EMAS.
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3110;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3110;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3111;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

⚠️ B variantda ham `PUBLIC_API_URL=https://farzin.uz` bo'ladi — brauzer
soketi shu domenga ulanadi va nginx uni `/socket.io/` bo'yicha API'ga
uzatadi.

⚠️ Frontend konteyneri o'z ichida `/api/*` ni `FARZIN_API_URL` ga
uzatadi (Next rewrite). Ya'ni B variantda so'rov ikki marta proksilanishi
mumkin — bu ishlaydi, lekin nginx `/api/` ni to'g'ridan-to'g'ri backendga
yuborgani tezroq va shu sababli yuqoridagi tartib tanlangan.

---

## 4. Birinchi superadmin

**Tovuq va tuxum:** rol berish uchun superadmin kerak, toza bazada esa
birorta yo'q. Tugun serverda kesiladi.

1. Ilovada **odatdagidek ro'yxatdan o'ting** (`https://farzin.uz`).
2. Emailingizni tasdiqlang (SMTP sozlangan bo'lsa xat keladi).
3. Serverda:

```bash
docker exec farzin-app node dist/tools/grant-role.js siz@example.uz SUPER_ADMIN
```

Vosita **parol so'ramaydi** — u mavjud hisobni ko'taradi. Sabab: parolni
buyruq satriga yozish uni shell tarixiga, `ps` chiqishiga va konteyner
inspeksiyasiga chiqarardi.

Amal **idempotent**: rol allaqachon bo'lsa hech narsa o'zgarmaydi.

4. Ilovaga qayting → konsolda **"Ma'muriyat"** bo'limi paydo bo'ladi.
   Ko'rinmasa — 1 daqiqa kuting: rollar 60 soniya keshlanadi
   (`AuthzService`).

Bundan keyin qolgan hamma rol **panel orqali** beriladi va har biri
sabab bilan audit'ga tushadi.

---

## 5. Yangilanish

```bash
cd /opt/farzin
git pull

docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Migratsiya natijasini TEKSHIRING — u jimgina yiqilishi mumkin
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=50 migrate
```

⚠️ **`PUBLIC_API_URL` o'zgargan bo'lsa** `web` image'ini qayta qurish
SHART: bu qiymat build vaqtida brauzer bundle'iga yoziladi. `up -d`
o'zi yetarli emas — `build` kerak.

---

## 6. Tekshirish (deploy'dan keyin har safar)

```bash
# Sog'liq
curl -s https://api.farzin.uz/health/live
curl -s https://api.farzin.uz/health/ready    # DB + Redis ulanishi

# Frontend
curl -s -o /dev/null -w '%{http_code}\n' https://farzin.uz

# Xatolar
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 app | grep -i error
```

**Qo'lda tekshiriladigan yo'l** (bir necha daqiqa, lekin u avtomatik
testlar ushlamaydigan narsalarni ochadi):

1. Ro'yxatdan o'tish → xat keldimi?
2. Kirish → konsol ochiladimi?
3. Ikki brauzerda navbatga turish → juftlik topiladimi, taxta jonlimi?
4. Yurish → raqibda darhol ko'rinadimi? (bu WebSocket va proxy sinovi)

---

## 7. Ortga qaytarish (rollback)

⚠️ **Migratsiya avtomatik qaytarilmaydi.** Prisma'da `migrate down` yo'q.
Sxema o'zgarishi bo'lgan release'ni qaytarish — alohida ish
(docs/11-infrastructure.md §8 expand-contract).

Sxema o'zgarmagan bo'lsa:

```bash
git checkout <oldingi-tag>
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

## 8. Zaxira nusxa

```bash
# Bazani olish
docker exec farzin-postgres pg_dump -U farzin farzin | gzip > farzin-$(date +%F).sql.gz
```

⚠️ **`pg_dump --clean` bilan TO'LIQ restore QILMANG** ishlab turgan
bazaga: foydalanuvchilar, reyting tarixi va audit loglar o'chib ketadi.
Kerakli qatorlarni tanlab ko'chiring.

`audit_logs` jadvali DB trigger'i bilan himoyalangan — UPDATE va DELETE
rad etiladi. Bu restore paytida ham ishlaydi.

---

## Ma'lum cheklovlar (deploy'dan oldin biling)

Bular **xato emas**, ongli holat — lekin ular bilan yashash kerak:

| Nima                                                       | Oqibat                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O'yin taymerlari **bitta instansiyada** (`game-timers.ts`) | `app` ni bir nechta replikada ishlatib bo'lmaydi: taymer o'sha konteynerda yashaydi. Supurgich (`sweepExpiredFlags`) eng og'ir oqibatni yopadi, lekin gorizontal masshtab hali yo'q |
| To'lov provayderlari **ulanmagan**                         | Pulli turnir ro'yxati invoys yaratadi, lekin to'lash yo'li yo'q. Manual to'lov (admin tasdig'i) ishlaydi                                                                            |
| SMTP bo'lmasa xat **yuborilmaydi**                         | Foydalanuvchi emailini tasdiqlay olmaydi va parolni tiklay olmaydi. Log'da ogohlantirish chiqadi, ilova ishlayveradi                                                                |
| `METRICS_TOKEN` bo'lmasa `/metrics` **ochiq**              | Route inventari, so'rov hajmi va ledger holati oshkor bo'ladi                                                                                                                       |
| Fair-play **yolg'on-pozitiv darajasi o'lchanmagan**        | Shubha skori komissiyaga ko'rinadi, avtomatik jazo YO'Q (docs/08 §0). Qaror har doim odamniki                                                                                       |
