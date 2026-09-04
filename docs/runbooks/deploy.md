# Deploy — production

> Stack: `docker-compose.prod.yml` · Muhit: `.env.prod` (commit QILINMAYDI)

Bu runbook **birinchi deploy** va **keyingi yangilanishlar** uchun. Har
qadam nima uchun kerakligi bilan yozilgan — buyruqni ko'chirib qo'yish
emas, nima bo'layotganini tushunish uchun.

---

## 0. Oldindan tekshirish

Server bitta va unda **ko'p loyiha** ishlaydi. Shuning uchun deploy'dan
oldin ikki narsa tekshiriladi: **port bo'shmi** va **disk yetarlimi**.

```bash
# Portlar band emasmi (.env.prod dagi qiymatlar bilan solishtiring)
ss -tlnp | grep -E ':(3100|3101)\b' || echo "bo'sh ✓"

# Nom to'qnashuvi bo'lmasin
docker ps -a --format '{{.Names}}' | grep '^farzin-' || echo "toza ✓"

# Disk (image'lar ~2 GB oladi)
df -h / | tail -1
```

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
`farzin-worker`, `farzin-web` — hammasi `Up (healthy)`.
`farzin-migrate` — `Exited (0)`, bu **to'g'ri**.

---

## 3. Reverse proxy

Konteynerlar `127.0.0.1` ga bog'langan — internetga to'g'ridan-to'g'ri
chiqmaydi. TLS va domen proxy darajasida.

Ikki manzil kerak:

| Domen           | Ichki manzil     | Nima     |
| --------------- | ---------------- | -------- |
| `farzin.uz`     | `127.0.0.1:3101` | frontend |
| `api.farzin.uz` | `127.0.0.1:3100` | API      |

⚠️ **WebSocket majburiy.** O'yin soati va jonli taxta `/socket.io` orqali
ishlaydi. Proxy `Upgrade` va `Connection` sarlavhalarini o'tkazmasa,
sahifa ochiladi-yu, taxta abadiy "Ulanilmoqda" holatida qoladi.

Nginx uchun minimal blok:

```nginx
location / {
    proxy_pass http://127.0.0.1:3100;
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
