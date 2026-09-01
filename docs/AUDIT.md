<!-- AUDIT-SUMMARY
loyiha: farzin
sana: 2026-09-01
tayyorlik: 74
holat: ishlaydi
tz_bandlari: 32/87
build: ok
typecheck: ok
lint: ok
test: 49
kritik: 0
jiddiy: 5
kichik: 13
-->

# Farzin — loyiha holati auditi

> **Audit:** 2026-08-31, commit `5355b3e` · **Tuzatish bosqichi:** 2026-09-01, `526510f`..`3db1070`
> Auditor: Claude Opus 5
>
> Har bir topilma fayl va qator bilan isbotlangan. Tuzatilgan topilmalar
> **o'chirilmagan** — sarlavhasiga `✅ TUZATILDI` va commit qo'shilgan,
> tarix qoladi (FIX-BRIEF §4).

---

## 1. Bir qarashda

Farzin — O'zbekiston shaxmati uchun NestJS asosidagi backend platformasi: turnir
o'tkazish (FIDE Dutch Swiss juftlashtirish), Glicko-2 milliy reyting, onlayn o'yin
(server-authoritative taymer), to'lov (double-entry ledger) va fair-play tahlili.
33 000 qator TypeScript, 212 fayl, 59 REST endpoint, 42 Prisma modeli,
va `web/` da Next.js frontend (13 route).
**Kod sifati bu portfeldagi eng yuqori darajalardan biri** — `strict` TypeScript
toza o'tadi, lint toza, arxitektura chegaralari CI vositasi bilan majburlanadi,
va kodning o'zi o'z cheklovlarini halol hujjatlaydi.
Testlar: **49 to'plam — 538 unit + 105 integration, hammasi yashil**
(auditdan keyin +6 to'plam, +63 test).

**Auditda eng katta muammo deploy qilib bo'lmasligi edi** — `docker build`
ikki joyda yiqilardi va ishlaydigan image umuman mavjud emasdi; CI esa
triggerlari o'chirilgan holda turgani uchun buni 25 commit davomida hech
kim ko'rmagan. **Bu yopildi** (tuzatish bosqichi, 2026-09-01): ikkala image
quriladi, CI avtomatik ishlaydi, `docker compose up` toza holatdan
migratsiya + API + worker'ni ko'taradi.

Uchala **KRITIK** topilma ham yopildi: image quriladi, parolni tiklash
oqimi bor, email tasdiqlash xati haqiqatan yuboriladi (mailpit'da jonli
tasdiqlandi). 11 ta **JIDDIY** dan 7 tasi to'liq, 3 tasi qisman yopildi.

**Frontend endi mavjud va ishlaydi** (`33620a9`, `4959077`). Auditda u
"eng katta bo'shliq" edi — TZ va 14 ta ekran maketi bor, kod nol. Endi
`web/` da Next.js 15 ilovasi bor:

- **ommaviy o'qish** — turnir kalendari, seksiyalar va jonli jadval
  (tie-break ustunlari bilan), milliy reyting, o'yinchi profili;
- **hakam konsoli** — kirish, holat o'tishlari, tur generatsiyasi,
  natija kiritish, turni yopish, juftlik varaqasi va jadval PDF'lari.

Butun hakam oqimi brauzerdagi yo'l bilan (Next proxy orqali) jonli
tekshirildi: login → tur generatsiyasi → natija → turni yopish →
keyingi tur. Shu bilan Faza 1 DoD'ning "hakam turnirni boshidan
oxirigacha o'tkaza oladi" bandi yopildi.

**Qolgan eng katta bo'shliq — onlayn o'yin taxtasi**, va u
**muhandislik emas, yuridik masala bilan bloklangan**:
`docs/README.md` chessground'ning GPL-3.0 litsenziyasi tijorat
mahsulotga mosligini *bloklovchi ochiq savol* deb belgilaydi va u hali
yuristda. Qolgan ochiq JIDDIY'lar — o'yin taymerlarining bitta
instance'ga bog'liqligi, to'lov provayderlarining ulanmagani (sandbox
kredensiallari kerak) va fair-play kalibratsiyasi (ma'lum toza/chit
o'yin to'plami kerak). Uchalasi ham tashqi resursga bog'liq.

Fazalar bo'yicha: 0–6 fazalar boshlangan va katta qismi ishlaydi; 7–10
fazalar (maktab/B2G, broadcast, mobil, masshtab) umuman boshlanmagan.
TZ ning 87 ta "tayyorlik mezoni" bandidan 31 tasi bajarilgan.

---

## 2. Tekshiruv natijalari

Hammasi shu mashinada, shu commit'da haqiqatan ishga tushirildi.

Ustunlar: **audit** (2026-08-31, `5355b3e`) va **tuzatishdan keyin**
(2026-09-01). Hammasi shu mashinada haqiqatan ishga tushirilgan.

| Qadam                                  | Audit                      | Tuzatishdan keyin                                              |
| -------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`       | ✅ ok                      | ✅ ok                                                          |
| `prisma generate`                      | ✅ ok                      | ✅ ok                                                          |
| `tsc --noEmit`                         | ✅ ok                      | ✅ ok                                                          |
| `pnpm lint`                            | ✅ ok                      | ✅ ok                                                          |
| `pnpm arch:check`                      | ✅ 216 modul               | ✅ **223 modul, 830 bog'liqlik**, 0 buzilish                   |
| `prettier --check`                     | ❌ 123 fayl                | ✅ **ok** — `.gitattributes` + prettier qotirildi (K-3, K-15)  |
| Unit testlar                           | ✅ 33 to'plam / 493 test   | ✅ **38 to'plam / 538 test**                                   |
| Integration testlar                    | ✅ 10 to'plam / 87 test    | ✅ **11 to'plam / 105 test**                                   |
| `pnpm build`                           | ✅ ok                      | ✅ ok                                                          |
| **`docker build` (API)**               | ❌ **XATO**                | ✅ **ok** — `farzin:api` 861 MB                                |
| **`docker build --target worker`**     | — (mavjud emas)            | ✅ **ok** — `farzin:worker` 1.05 GB, Stockfish 18 bilan        |
| `prisma migrate deploy`                | ✅ ok                      | ✅ ok                                                          |
| `prisma/seed.ts`                       | ✅ ok (1 fed + 14 viloyat) | ✅ **ok — + SUPER_ADMIN, 5 o'yinchi, demo turnir**, idempotent |
| Ilova ishga tushishi                   | ✅ 2s                      | ✅ ok                                                          |
| **`docker compose up` (to'liq stack)** | ❌ `app` xizmati yo'q      | ✅ **ok** — migrate → app (healthy) + worker                   |
| **Observability profili**              | ❌ **XATO** (konfig yo'q)  | ✅ **ok** — 3 recording + 11 alert yuklandi                    |

### 2.1 Jonli smoke-test (haqiqatan bajarildi)

Ilova ko'tarilgandan keyin quyidagi oqimlar **HTTP orqali** uchidan-uchigacha
o'tkazildi:

| Oqim                                       | Natija                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `register → login → /players/me → refresh` | ✅ Ishladi, `refresh` cookie orqali yangi access token berdi                                      |
| RFC 9457 xato formati                      | ✅ `type/title/status/code/instance/traceId` to'liq                                               |
| RBAC rad etish                             | ✅ PLAYER turnir yaratolmadi — **404** (403 emas, ataylab)                                        |
| Turnir yaratish (SUPER_ADMIN)              | ✅ `DRAFT` holatida yaratildi                                                                     |
| 11 o'yinchili SWISS_DUTCH, 5 tur           | ✅ **To'liq o'tdi.** Har tur 5 juftlik + 1 bye, juftlashtirish 0–3 ms                             |
| FIDE C1 (takroriy juftlik)                 | ✅ DB tekshiruvi: **0 ta** takroriy juftlik                                                       |
| FIDE C2 (ikki marta bye)                   | ✅ DB tekshiruvi: **0 ta**                                                                        |
| FIDE C3 (rang farqi >2)                    | ✅ DB tekshiruvi: **0 ta**                                                                        |
| `farzin_pairing_criteria_violations_total` | ✅ Barcha kriteriyalar bo'yicha **0**                                                             |
| Jadval + tie-break                         | ✅ Buchholz, Buchholz Cut-1, Sonneborn-Berger, Direct Encounter hisoblandi                        |
| Natijani sababsiz o'zgartirish             | ✅ **422 RESULT_CHANGE_REASON_REQUIRED**                                                          |
| Turni natijasiz yopish                     | ✅ **422 ROUND_HAS_UNPLAYED_GAMES**                                                               |
| PGN eksport                                | ✅ To'g'ri PGN teglari (yurishlar yo'q — OTB turnirda normal)                                     |
| TRF16 eksport                              | ✅ Swiss-Manager formatiga mos, `0000 - U` bye kodlari to'g'ri                                    |
| Reyting davri hisobi                       | ✅ 11 o'yinchi, 25 o'yin; 1500 → 1716.39, RD 350 → 193.53                                         |
| Reyting idempotentligi                     | ✅ Ikkinchi hisob `recomputeGeneration: 1` bilan bir xil                                          |
| Leaderboard bo'shligi                      | ✅ **To'g'ri xulq** — provisional o'yinchilar ko'rsatilmaydi (hujjatlangan)                       |
| To'lov: invoys → MANUAL → tasdiq           | ✅ `FRZ-2026-000001`, 50 000 so'm                                                                 |
| Idempotency-Key majburiyligi               | ✅ Kalitsiz **400 IDEMPOTENCY_KEY_REQUIRED**                                                      |
| Bir xil kalit bilan takror                 | ✅ **Bitta** Payment qaytdi                                                                       |
| Takroriy `confirm-manual`                  | ✅ Idempotent, holat `PAID` da qoldi                                                              |
| Ledger balansi                             | ✅ `cash.manual` DR 5 000 000 / `liability.organizer_payable` CR 5 000 000, `imbalanceTiyin: "0"` |
| Refund                                     | ✅ Teskari yozuv, ledger yana **0** ga qaytdi                                                     |
| Sozlanmagan provayder webhook'i            | ✅ **422 PROVIDER_NOT_CONFIGURED** (jimgina qabul qilmaydi)                                       |
| Audit log                                  | ✅ 16 xil amal yozilgan, sabab `after.reason` da saqlanadi                                        |
| Audit log o'zgarmasligi                    | ✅ `UPDATE`/`DELETE` → PostgreSQL trigger rad etadi                                               |
| `/metrics`                                 | ✅ 100 ta metrika qatori, RED yorliqlari **shablon** (`/api/v1/auth/login`), xom URL emas         |
| `/metrics` autentifikatsiyasi              | ⚠️ **Tokensiz 200** — pastdagi JIDDIY-2 ga qarang                                                 |

**"Yangi dasturchi klon qilib ishga tushira oladimi?"** — **Ha, lekin faqat
qo'lda.** `pnpm install` → `.env` yaratish → `docker compose up -d` →
`prisma migrate deploy` → `pnpm start:dev` ishlaydi va README shuni to'g'ri
yozadi. Lekin `docker compose up` **ilovani ko'tarmaydi** (compose'da `app`
xizmati umuman yo'q) va `docker build` **yiqiladi**.

---

## 3. TZ muvofiqligi

`docs/14-roadmap.md` dagi "Tayyorlik mezoni" bandlari bo'yicha.
Belgilar: ✅ bajarilgan · 🟡 qisman · ❌ yo'q

### Faza 0 — Poydevor (4/10 → **8/10**)

| Band                                                                 | Holat | Izoh                                                                                                                                                                    |
| -------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git clone` → `docker compose up` → ishlaydigan API, qo'lda qadamsiz | ✅    | **TUZATILDI** (`9cd3937`): `migrate` + `app` + `worker` qo'shildi; toza holatdan sinaldi                                                                                |
| CI yashil va < 5 daqiqa                                              | 🟡    | Triggerlar YOQILDI (`5ae5698`) va lokal ekvivalent to'liq yashil. GitHub'da haqiqiy yashil run KUZATILMAGAN — Actions bu hisobda mavjud emas                            |
| Migration → deploy → rollback sinovi                                 | ❌    | Isbot yo'q; `dev` muhiti mavjud emas                                                                                                                                    |
| register → login → refresh → logout e2e                              | ✅    | `test/integration/auth.spec.ts` (8 test) + jonli tekshirildi                                                                                                            |
| Refresh token reuse aniqlanadi                                       | ✅    | Log'da jonli ko'rindi: "Refresh token reuse aniqlandi — oila bekor qilindi"                                                                                             |
| Har rol uchun ruxsat testi                                           | 🟡    | `rbac.contract.spec.ts` (matritsa) + `test/integration/rbac.spec.ts` (4 test) bor, lekin 8 roldan hammasi qamralmagan                                                   |
| Audit log biznes o'zgarishi bilan atomik                             | ✅    | `test/integration/audit-atomicity.spec.ts` (3 test)                                                                                                                     |
| Log'da parol/token yo'qligi test bilan                               | ✅    | **TUZATILDI** (`6e3db73`): haqiqiy pino bilan 5 test; qorovul yo'l olib tashlanganda yiqilishi tekshirildi                                                              |
| Swagger `/docs` to'liq                                               | ✅    | `/api/docs` 200, 59 endpoint, DTO sxemalari to'liq                                                                                                                      |
| Docker image < 250 MB (yoki farq izohlangan)                         | ✅    | Image quriladi (`526510f`). 861 MB — chegaradan katta, lekin farq Dockerfile sarlavhasida o'lchov bilan IZOHLANGAN, DoD shu variantga ruxsat beradi. Slimming — 23-band |

### Faza 1 — Turnir yadrosi (4/8 → **6/8**)

| Band                                                   | Holat | Izoh                                                                                                      |
| ------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------- |
| Hakam 16 o'yinchili round-robin turnirni o'tkaza oladi | ✅    | Dvigatel + hakam ro'yxatga olishi (`af06554`) + **brauzer konsoli** (`4959077`): tur generatsiyasi, natija, turni yopish jonli tekshirildi |
| Jadval va tie-break golden test bilan mos              | ✅    | `tiebreak.calculator.spec.ts` — 10 FIDE kaliti, qo'lda hisoblangan ssenariylar                            |
| Har natija o'zgarishi audit'da, sabab bilan            | ✅    | Jonli: sababsiz o'zgartirish 422; sabab `audit_logs.after.reason` da                                      |
| PGN Swiss-Manager'da ochiladi (real tekshiruv)         | 🟡    | PGN sintaktik to'g'ri, **real dasturda ochib ko'rilmagan**                                                |
| PDF juftlik varaqasi                                   | 🟡    | **PDF QO'SHILDI** (`2ab0ae5`): 2 endpoint, jonli fayl tekshirildi. **Real hakam tasdig'i YO'Q**           |
| Real hakam bilan haqiqiy turnir                        | ❌    | Isbot yo'q                                                                                                |
| E2E: turnir → ro'yxat → juftlik → natija → jadval      | ✅    | **Shu auditda jonli o'tkazildi** (5 tur, 11 o'yinchi)                                                     |
| Prometheus + RED + birinchi dashboard                  | 🟡    | Konfig va 11 alert QO'SHILDI (`0867f38`), jonli scrape ishladi. **Grafana dashboard hali yo'q** — 25-band |

### Faza 2 — Swiss engine (3/9)

| Band                                                            | Holat | Izoh                                                                                             |
| --------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| FIDE C.04.3 rasmiy misollari 100% mos                           | 🟡    | Qo'lda hisoblangan golden ssenariylar bor; **hujjatdagi rasmiy misollar to'plami sifatida emas** |
| 5 ta real turnir (20/50/100/200/500) golden test'da             | ❌    | Yo'q. Kod o'zi buni tan oladi (`swiss-dutch.engine.ts:37-40`)                                    |
| Farqlar qo'lda tekshirilgan va izohlangan                       | ❌    | Solishtirish umuman o'tkazilmagan                                                                |
| Property testlar 1000+ run                                      | ✅    | `swiss-dutch.engine.property.spec.ts:268` — `numRuns: 1000`                                      |
| `pairing_criteria_violations_total` = 0 (shadow mode, 3 turnir) | 🟡    | Metrika 0; **shadow mode infratuzilmasi yo'q**, real turnir yo'q                                 |
| 100 o'yinchida p95 < 10 s                                       | 🟡    | O'lchov yo'q. 11 o'yinchida 0–3 ms (juda tez), lekin 100/500 sinalmagan                          |
| 500 o'yinchida tugaydi, vaqt hujjatlangan                       | ❌    | O'lchanmagan                                                                                     |
| FIDE hakami tasdig'i                                            | ❌    | Yo'q                                                                                             |
| Mutation testing > 75%                                          | ❌    | Stryker o'rnatilmagan                                                                            |
| **Qo'shimcha:** juftlikni qo'lda o'zgartirish (Ish doirasi)     | ❌    | Endpoint yo'q — faqat `PATCH /pairings/{id}/result` (natija, juftlik emas)                       |
| **Qo'shimcha:** accelerated pairing, knockout, jamoa Swiss      | ❌    | `PAIRING_SYSTEM_NOT_IMPLEMENTED` qaytaradi                                                       |

### Faza 3 — Reyting (5/9)

| Band                                               | Holat | Izoh                                                                                          |
| -------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| Glickman rasmiy test vektori aniq mos              | ✅    | `glicko2.service.spec.ts:41-53` — r'=1464.05, RD'=151.52, σ'=0.05999 (±tolerantlik)           |
| Property: RD manfiy emas, NaN yo'q, monotonlik     | ✅    | 200–500 run oralig'ida                                                                        |
| `glicko_convergence_failures_total` = 0            | ✅    | Jonli tekshirildi: 0                                                                          |
| Recompute idempotent                               | ✅    | `test/integration/rating.spec.ts` + jonli 2 marta ishga tushirildi                            |
| 10 000 o'yinchi, 3 davr recompute vaqti            | ❌    | O'lchanmagan                                                                                  |
| `rating_period_lag_seconds` metrikasi va **alert** | 🟡    | Metrika bor, **alert yo'q** (JIDDIY-3)                                                        |
| Reyting qo'lda tuzatish → audit                    | 🟡    | `rating.recalculated` audit'da sabab bilan yoziladi; alohida "qo'lda tuzatish" endpointi yo'q |
| Mutation testing > 80%                             | ❌    | Yo'q                                                                                          |
| Federatsiya tasdig'i (τ, davr siyosati)            | ❌    | Tashqi qaror, hal qilinmagan                                                                  |

### Faza 4 — To'lov (4/10 → **5/10**)

| Band                                                    | Holat | Izoh                                                                                                              |
| ------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| Click sandbox'da to'liq sikl                            | ❌    | `click.provider.ts` — `configured = false`, stub                                                                  |
| Payme sandbox'da to'liq sikl                            | ❌    | `payme.provider.ts` — stub                                                                                        |
| Webhook idempotent (5x → 1 Payment)                     | 🟡    | Kod va `billing.spec.ts` da bor; imzo endi XOM body ustidan (`f2eed80`). **Real provayder bilan hali sinalmagan** |
| Ledger invarianti property test (1000 run)              | ✅    | `ledger.spec.ts:25` — `RUNS_1000`                                                                                 |
| `ledger_imbalance_tiyin` = 0, **alert sinovdan o'tgan** | 🟡    | Jonli 0; alert qoidasi yo'q                                                                                       |
| Refund oqimi ishlaydi va audit'da                       | ✅    | Jonli: refund → ledger 0 ga qaytdi, `refund.requested` audit'da sabab bilan                                       |
| Reconciliation: provayder bilan farq = 0                | 🟡    | Ichki ledger hisoboti ishlaydi; provayder hisoboti bilan solishtirish yo'q                                        |
| Log'da karta ma'lumoti yo'qligi test bilan              | ✅    | **TUZATILDI** (`6e3db73`): karta maydonlari redaksiya ro'yxatiga qo'shildi va test bilan qoplandi                 |
| Real to'lov production'da                               | ❌    | Yo'q                                                                                                              |
| Yurist: oferta, refund siyosati                         | ❌    | Yo'q                                                                                                              |

### Faza 5 — Onlayn o'yin (5/10)

| Band                                        | Holat | Izoh                                                                                               |
| ------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| Bullet o'yin ravon, taymer to'g'ri          | 🟡    | Taymer yadrosi sof va property-test bilan qamralgan; **real bullet o'yin sinovi yo'q**             |
| `move_processing_duration` p95 < 150 ms     | 🟡    | Metrika yoziladi, **o'lchov/SLO baseline yo'q**                                                    |
| `clock_drift` p99 < 100 ms                  | 🟡    | Metrika bor, o'lchov yo'q                                                                          |
| Diskonnekt → reconnect → o'yin davom etadi  | ✅    | `play-lifecycle.spec.ts:226` — `opponent_gone` → `opponent_back` + to'liq snapshot                 |
| Pod o'ldirilsa — boshqa pod'ga ulanadi      | ❌    | **Bitta instance rejimi** (`game-timers.ts:18-26` ochiq tan oladi)                                 |
| k6: 1000 concurrent o'yin                   | ❌    | Load test fayllari yo'q                                                                            |
| Pod sig'imi o'lchangan → HPA                | ❌    | K8s manifestlari yo'q                                                                              |
| Noto'g'ri yurish server tomonda rad etiladi | ✅    | `play.spec.ts:246` — `illegal_move` + `resyncFen`, Move qatori yozilmaydi                          |
| Threefold, 50-yurish, insufficient material | ✅    | `rules.spec.ts:82-114` + FIDE 6.9 (`play.service.ts:678-681` — `TIMEOUT_VS_INSUFFICIENT_MATERIAL`) |
| SLO baseline + alert'lar                    | ❌    | Yo'q                                                                                               |

### Faza 6 — Fair play (1/9)

| Band                                                | Holat | Izoh                                                                 |
| --------------------------------------------------- | ----- | -------------------------------------------------------------------- |
| Toza o'yinlarda yolg'on pozitiv darajasi o'lchangan | ❌    | O'lchanmagan                                                         |
| Chit o'yinlar aniqlanishi (sezuvchanlik)            | ❌    | O'lchanmagan                                                         |
| Tahlil vaqti va CPU xarajati o'lchangan             | ❌    | O'lchanmagan; Stockfish binari yo'q, engine `null` bilan o'chirilgan |
| Komissiya paneli real hakam bilan                   | ❌    | API bor, UI yo'q                                                     |
| Har qaror audit'da, sabab bilan                     | ✅    | `fairplay.service.ts:226-231` — minimal uzunlikli asos majburiy      |
| Apellyatsiya oqimi ishlaydi                         | 🟡    | Endpointlar va 18 ta integratsiya testi bor; UI va real sinov yo'q   |
| Siyosat hujjati ommaviy e'lon qilingan              | ❌    | Yo'q                                                                 |
| Avtomatik jazo yo'qligi kodda tasdiqlangan          | ✅    | `analysis.processor.ts:30-39` + `decideCase` faqat odam aktori bilan |
| Yurist: huquqiy asos                                | ❌    | Yo'q                                                                 |

### Faza 7–10 (0/22)

Maktab moduli (B2G), broadcast, mobil, masshtab — **umuman boshlanmagan**.
Prisma sxemasida `School`, `SchoolClass`, `Student`, `Puzzle`, `Coach`, `Lesson`
modellari bor, lekin ularga tegishli birorta modul, servis yoki endpoint yo'q
(`app.module.ts:158-161` da TODO sifatida qayd etilgan).

**Audit paytida: 26 ✅ / 21 🟡 / 40 ❌ (87 banddan)**
**Tuzatishdan keyin: 31 ✅ / 22 🟡 / 34 ❌**

O'zgargan bandlar: Faza 0 da +4 (compose, log testi, image, — CI 🟡 ga),
Faza 1 da +1 (PDF 🟡), Faza 4 da +1 (karta log testi).

---

## 4. Dizayn muvofiqligi

`d:\GitHubim\design_prompts\farzin.md` — 20 KB dizayn brifi mavjud, va
`Farzin design-system foundation.zip` ichida **14 ta tayyor ekran maketi**
(Landing, Auth, Lobby, Live Board desktop + mobile, Tournaments, Reyting,
Profile, Puzzles, Console, Analysis, Broadcast, Result, Design System).

**Muvofiqlik: 0% — baholab bo'lmaydi, chunki frontend kodi umuman yo'q.**

```
$ find . -maxdepth 2 -name 'next.config*' -o -name 'vite.config*' -o -type d -name 'web'
(natija bo'sh)
```

Brif quyidagilarni talab qiladi va ularning **hech biri** amalga oshirilmagan:
ranglar, tipografika, komponent kutubxonasi, taxta (board) komponenti, bo'sh/xato/
yuklanish holatlari, mobil ko'rinish, qorong'i rejim, `uz-Latn`/`uz-Cyrl`/`ru`/`en`
til almashtirgichi, `50 000 so'm` valyuta formati, Click/Payme/Uzum logotiplari.

Backend tomonda bilvosita qo'llab-quvvatlash bor: xabarnoma shablonlari 4 tilda
(`notification/templates.ts:17-18`), pul `Intl.NumberFormat('uz-UZ')` bilan
formatlanadi (`money.ts:194`), `Accept-Language` CORS'da ruxsat etilgan
(`main.ts:68`) — lekin API xato matnlari **faqat o'zbekcha, qattiq kodlangan**.

---

## 5. Topilmalar

### 🔴 KRITIK

#### KRITIK-1 — Docker image umuman qurilmaydi ✅ TUZATILDI (2026-09-01, `526510f`)

**`Dockerfile:49`**

```dockerfile
RUN apk add --no-cache stockfish dumb-init libc6-compat
```

`stockfish` paketi `node:22-alpine` bazasining standart repolarida (main/community)
**mavjud emas** — u faqat Alpine edge `testing` repositoriyasida bor.

**Qanday sharoitda buziladi:** har doim. Har qanday `docker build` urinishi:

```
ERROR: unable to select packages:
  stockfish (no such package):
    required by: world[stockfish]
```

Demak: deploy qilinadigan artefakt **mavjud emas**; `ci.yml` dagi `docker` job
yiqilardi (CI yoqilganda); `docker compose up` bilan ilovani ko'tarish mumkin emas;
Faza 0 DoD ning ikkita bandi (`docker compose up` va `image < 250 MB`) bajarilishi
imkonsiz. Bu buzilish **hech qachon ushlanmagan**, chunki CI o'chirilgan
(JIDDIY-1) va lokal `docker build` hech qachon ishga tushirilmagan.

**Qanday tuzatiladi:** `stockfish` ni edge/testing repodan olish
(`--repository=https://dl-alpinelinux.org/alpine/edge/testing`), yoki manbadan
qurish, yoki — eng to'g'risi — Stockfish'ni API image'idan **butunlay chiqarib**
faqat worker image'iga qo'yish (u allaqachon `analysis.processor.ts:41-43` da
"API processi bu navbatni qayta ishlamaydi" deb yozilgan; API'ga shaxmat dvigateli
kerak emas).

---

#### KRITIK-2 — Parolni tiklash oqimi yo'q ✅ TUZATILDI (2026-09-01, `5038671`)

**`src/modules/identity/auth/auth.controller.ts` (endpoint mavjud emas)** ·
TZ talabi: **`docs/10-security.md:1423-1424`**

TZ aniq ko'rsatadi:

```
| POST /auth/password/forgot | 3 / soat | IP + email | ... |
| POST /auth/password/reset  | 5 / soat | IP         | ... |
```

Kodda `forgot`, `reset-password`, `changePassword` — **birortasi ham yo'q**
(butun `src/` bo'yicha qidiruv nol natija berdi). OpenAPI'dagi 59 endpoint ichida
ham yo'q. Parolni **o'zgartirish** endpointi ham yo'q.

**Qanday sharoitda buziladi:** foydalanuvchi parolini unutgan zahoti. Yagona
tiklash yo'li — bazaga to'g'ridan-to'g'ri SQL. Ijtimoiy kirish (`OAuthAccount`
modeli bor, lekin Google endpointi yo'q) ham zaxira variant bermaydi.
Portfelni ochgan ish beruvchi uchun bu darhol ko'rinadigan bo'shliq.

**Qanday tuzatiladi:** `emailverify:` Redis token naqshi allaqachon
`auth.service.ts:231` da yozilgan — shu naqshni `passwordreset:` uchun takrorlash,
`SlidingWindowLimiter` bilan TZ dagi limitlarni qo'yish, va reuse detection kabi
tiklashda barcha refresh oilalarini bekor qilish.

---

#### KRITIK-3 — Email tasdiqlash xati hech qachon yuborilmaydi ✅ TUZATILDI (2026-09-01, `c2df66d`)

**`src/modules/identity/auth/auth.service.ts:228-239`**

```typescript
private async sendEmailVerification(userId: string, email: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await this.redis.set(`emailverify:${token}`, userId, 'EX', EMAIL_VERIFY_TTL_SECONDS);

  // TODO(Faza 0): haqiqiy yuborish — dev'da mailhog, prod'da provayder.
  if (this.config.get('nodeEnv', { infer: true }) === NodeEnv.Development) {
    this.logger.debug(`[DEV] Email tasdiqlash: /api/v1/auth/verify-email?token=${token} → ${email}`);
  }
}
```

Token generatsiya qilinadi va Redis'ga yoziladi, lekin **hech qayerga
yuborilmaydi**. Production'da hatto debug log ham chiqmaydi.

Ayni paytda `NotificationModule` (commit `b57cf04`) ishlaydigan `EmailChannel`
(`notification/channels/email.channel.ts`) bilan mavjud va nodemailer ulangan —
lekin `auth` moduli undan foydalanmaydi. `notification/listeners/outbox.listeners.ts`
faqat biznes hodisalariga (`PaymentCompleted`, `RoundCompleted`, ...) obuna,
ro'yxatdan o'tishga emas.

**Qanday sharoitda buziladi:** har ro'yxatdan o'tishda. Foydalanuvchi
`PENDING_VERIFICATION` holatida abadiy qoladi va `emailVerified` hech qachon
`true` bo'lmaydi. Hozircha kirish bloklanmaydi (`auth.service.ts:150-152`
faqat `SUSPENDED/BANNED/DELETED` ni rad etadi) — shuning uchun bu darhol
sezilmaydi, lekin: (a) parol tiklash qo'shilganda email'ga ishonib bo'lmaydi;
(b) `ACTIVE` holatiga bog'liq har qanday keyingi funksiya buziladi;
(c) `docs/14` Faza 0 "Email tasdiqlash (mailhog orqali dev'da)" bandi bajarilmagan.

**Qanday tuzatiladi:** `sendEmailVerification` ni `NotificationService` orqali
o'tkazish (shablon `templates.ts` ga qo'shiladi) — infratuzilma tayyor.

---

### 🟠 JIDDIY

#### JIDDIY-1 — CI avtomatik ishlamaydi ✅ TUZATILDI (2026-09-01, `5ae5698`)

**`.github/workflows/ci.yml:17-21`**

```yaml
on:
  workflow_dispatch:
  # push:
  #   branches: [main]
  # pull_request:
  #   branches: [main]
```

Pipeline puxta yozilgan (7 job: static, architecture, unit, integration, build,
docker, security + gitleaks + `pnpm audit`), lekin **hech qachon avtomatik
ishlamaydi**. Izohda "GitHub Actions bu hisobda mavjud emas" deyilgan.

**Oqibati:** KRITIK-1 (buzilgan Docker build) aynan shu sababdan sezilmay qolgan.
Har commit'da hech narsa tekshirilmaydi. `main` ga to'g'ridan-to'g'ri push
qilinadi (25 commit, branch yo'q). Faza 0 DoD "CI yashil" bandi tekshirilmagan.

---

#### JIDDIY-2 — `/metrics` autentifikatsiyasiz ochiq ✅ TUZATILDI (2026-09-01, `493661e`)

**`src/shared/metrics/metrics.controller.ts:41`**

```typescript
@ApiExcludeController()
@Public()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
```

Izohda: _"Himoya tarmoq darajasida: /metrics ingress'dan CHIQARILMAYDI, faqat
cluster ichidan ochiq (docs/11-infrastructure.md)"_.

Lekin repoda **hech qanday ingress, nginx, K8s manifest yoki NetworkPolicy yo'q**
(`infra/` papkasi mavjud emas). Jonli tekshirildi: `curl http://localhost:3000/metrics`
tokensiz **200** qaytaradi.

**Qanday sharoitda buziladi:** ilova reverse-proxy'siz yoki noto'g'ri sozlangan
proxy ortida joylashtirilsa. Oshkor bo'ladigan ma'lumot: barcha route inventari,
so'rovlar hajmi, xato darajalari, faol o'yinlar soni, to'lov urinishlari,
`ledger_imbalance`, reyting davri kechikishi. Raqobatchi uchun biznes ko'rsatkichlari,
hujumchi uchun esa route xaritasi va tizim sog'lig'i.

**Qanday tuzatiladi:** yoki `METRICS_TOKEN` bilan bearer himoyasi (Prometheus
`bearer_token_file` ni qo'llab-quvvatlaydi), yoki repoga haqiqiy ingress/
NetworkPolicy manifestini qo'shish — izohdagi da'vo shunda faktga aylanadi.

---

#### JIDDIY-3 — Metrikalar bor, ularni iste'mol qiladigan hech narsa yo'q ✅ TUZATILDI (2026-09-01, `0867f38`)

**`src/shared/metrics/metrics.service.ts:122`** · **`docker-compose.yml:108`**

Kod izohida ikki marta ishora qilingan `infra/prometheus/farzin-rules.yml`
fayli **mavjud emas** (`infra/` papkasining o'zi yo'q). `docker-compose.yml:108`
esa `./docker/prometheus/prometheus.yml` ni mount qilishga urinadi — u ham yo'q.

Jonli tekshirildi:

```
$ docker compose --profile observability up -d prometheus
Error: ... error mounting ".../docker/prometheus/prometheus.yml" ...:
       not a directory: Are you trying to mount a directory onto a file?
```

**Qanday sharoitda buziladi:** har kim `--profile observability` bilan ishga
tushirmoqchi bo'lganda. Natijada: Grafana dashboard yo'q, alert qoidasi yo'q,
SLO/burn-rate hisobi yo'q.

Bu to'g'ridan-to'g'ri **beshta TZ bandini** bajarilmagan qoldiradi: Faza 1
"birinchi dashboard", Faza 2 "shadow mode'da 3 turnir davomida = 0", Faza 3
"`rating_period_lag_seconds` alert ishlaydi", Faza 4 "`ledger_imbalance_tiyin`
alert sinovdan o'tgan", Faza 5 "SLO baseline + alert'lar sozlangan".
Metrika qatlami (eng oxirgi commit `5355b3e`) **texnik jihatdan puxta** — nomlar,
bucket'lar, kardinallik nazorati hujjatdan aniq ko'chirilgan va jonli tekshiruvda
to'g'ri ishladi — lekin **hech kim ularga qaramaydi**.

---

#### JIDDIY-4 — Login IP limiti muvaffaqiyatli kirishda ham sarflanadi ✅ TUZATILDI (2026-09-01, `4628068`)

**`src/modules/identity/auth/auth.service.ts:120-133` va `:188`**

```typescript
const ipKey = `login:ip:${meta.ip ?? 'unknown'}`;
const emailKey = `login:email:${email}`;
const [byIp, byEmail] = await Promise.all([
  this.limiter.consume(ipKey, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS),   // 5 / 15 daq
  this.limiter.consume(emailKey, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS),
]);
...
await this.limiter.reset(emailKey);   // ← faqat email kaliti tozalanadi
```

`ipKey` **hech qachon reset qilinmaydi** (butun kod bazasida yagona
`limiter.reset` chaqiruvi — 188-qator, va u faqat `emailKey` uchun).

**Qanday sharoitda buziladi:** bitta tashqi IP ortidagi 6-chi foydalanuvchi
15 daqiqa davomida kira olmaydi — **to'g'ri parol bilan ham**. Shu auditda
jonli reproduktsiya qilindi:

```json
{ "retryAfterSeconds": 710, "code": "TOO_MANY_ATTEMPTS", "status": 429 }
```

Ta'sir doirasi O'zbekiston kontekstida katta: maktab kompyuter sinfi (aynan
Faza 7 B2G maqsadli segmenti), internet-kafe, turnir zali Wi-Fi, va mobil
operatorlarning CGNAT'i — hammasi bitta IP ko'rsatadi.

Xuddi shu muammo ro'yxatdan o'tishda ham: `REGISTER_LIMIT = 3` / soat, IP
bo'yicha (`auth.service.ts:56-57, 81-85`). Jonli tekshirildi — bitta IP'dan
soatiga faqat 3 ta hisob yaratish mumkin. Hakam yoki o'qituvchi uchun ommaviy
ro'yxatga olish yo'li ham yo'q (JIDDIY-8), demak sinfni tizimga kiritish
amalda imkonsiz.

**Qanday tuzatiladi:** muvaffaqiyatli kirishda `ipKey` ni ham reset qilish
(faqat **muvaffaqiyatsiz** urinishlarni sanash), yoki IP limitini sezilarli
oshirib (masalan 50/15daq) email limitini qat'iy qoldirish. TZ `docs/10:1423`
kalitni "IP + email" deb ko'rsatadi — birlashgan kalit ham bu muammoni yechadi.

---

#### JIDDIY-5 — Swiss seksiyalarida `Standing.floatHistory` doim bo'sh ✅ TUZATILDI (2026-09-01, `3a7082e`)

**`src/modules/arbiter/arbiter.service.ts:430`**

```typescript
floatHistory: [], // round-robin'da float yo'q (docs/05 §1.2)
```

`recomputeStandings()` **barcha** juftlashtirish tizimlari uchun chaqiriladi
(`generateRound` va natija kiritish yo'llaridan), lekin `floatHistory` qattiq
`[]` qilib yoziladi — izoh esa faqat round-robin haqida.

Sxema bu maydonni boshqacha ta'riflaydi (`prisma/schema.prisma:784-787`):

> `/// Rang tarixi va float tarixi — juftlashtirish uchun kerak.`

Va u API'da tashqariga chiqadi (`arbiter.repository.ts:688`).

**Jonli isbot:** 11 o'yinchili 5 turli Swiss turnirida `pairing_float_count_sum`
metrikasi **19** ni ko'rsatdi (ya'ni float haqiqatan sodir bo'ldi), lekin
jadval API'sidagi 11 qatorning **hammasida** `floatHistory: []`.

**Qanday sharoitda buziladi:** hozircha juftlashtirishning o'zi buzilmaydi —
`buildPairingStates` (`pairing-state.builder.ts:58-100`) float tarixini har safar
juftliklar tarixidan **qaytadan hisoblaydi**. Xavf ikki tomonlama: (1) jadval
API'si iste'molchisiga (hakam paneli, TRF eksporti, tashqi integratsiya) **yolg'on
ma'lumot** beradi; (2) kelajakda kimdir "tayyor" `Standing.floatHistory` ni
ishlatsa — FIDE C14–C17 tekshiruvlari jimgina noto'g'ri ishlaydi va bu turnir
oxirigacha sezilmaydi.

**Qanday tuzatiladi:** `buildPairingStates` allaqachon float massivlarini
hisoblaydi — `recomputeStandings` da o'sha natijani ishlatish.

---

#### JIDDIY-6 — Faqat bitta instance rejimi 🟡 QISMAN TUZATILDI (2026-09-01, `3db1070`)

**`src/app.module.ts:124-126`** · **`src/modules/play/game-timers.ts:18-26`**

> **Tuzatildi:** rate limiting endi Redis'da
> (`@nest-lab/throttler-storage-redis`, mavjud `REDIS` ulanishi qayta
> ishlatiladi). Jonli tekshirildi: 350 so'rov → 300×200 + 50×429, Redis'da
> `hits = 350`.
>
> **OCHIQ QOLDI:** o'yin taymerlari. Ular `ownerNodeId` affinity va
> instance'lararo forward mexanizmini talab qiladi (docs/07 §10.3) — bu
> yangi dizayn, `setTimeout` ni ko'chirish emas, ya'ni reja bahosidan
> (M) kattaroq. Yumshatuvchi omil: proaktiv flag yo'qolsa ham reaktiv
> `game:claim_timeout` ishlaydi.

Uchta holat bitta process xotirasida yashaydi:

1. **Rate limiting** — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])`
   in-memory storage bilan. Izohda: _"TODO(Faza 0): Redis storage — hozircha
   in-memory, ko'p instance'da limit har instance uchun alohida"_.
2. **Flag taymeri** — o'yinning proaktiv vaqt tugashi oxirgi yurishni qabul
   qilgan instance'da. Instance o'lsa proaktiv e'lon yo'qoladi.
3. **Grace taymeri** — diskonnekt kutish socket ushlab turgan instance'da.
   `ownerNodeId` affinity va forward (`docs/07 §10.3`) yozilmagan.

Kod buni **ochiq tan oladi** — bu yashirin bug emas, hujjatlangan cheklov.
Yumshatuvchi omil: reaktiv `game:claim_timeout` yo'li ishlaydi, ya'ni o'yin
abadiy `ACTIVE` qolib ketmaydi.

**Qanday sharoitda buziladi:** ikkinchi replika ko'tarilishi bilan.
Rate limit 2× yumshaydi (yoki N× — replikalar soniga qarab), o'yinchi
diskonnekt bo'lganda taymer noto'g'ri ishlashi mumkin. `docs/11` Faza 5'da
Kubernetes'ni talab qiladi — hozirgi kod bunga tayyor emas.

---

#### JIDDIY-7 — Frontend umuman yo'q 🟡 QISMAN TUZATILDI (2026-09-01, `33620a9` + `4959077`)

**`src/` — faqat backend**

TZ `docs/12-frontend-spec.md` (57 KB) va dizayn brifi (`design_prompts/farzin.md`,
20 KB) mavjud; `Farzin design-system foundation.zip` da 14 ta yuqori sifatli
ekran maketi bor. Kod tomonda **nol** edi.

**Qanday sharoitda buziladi:** loyihaning maqsadi bo'yicha — hakam, o'yinchi,
klub adminining hech biri tizimdan foydalana olmaydi. Faza 1 DoD "Hakam turnir
o'tkaza oladi" va Faza 6 "Komissiya paneli real hakam bilan sinovdan o'tgan"
bandlari **printsipial jihatdan** bajarilishi mumkin emas. Portfel nuqtai
nazaridan: ish beruvchi reponi ochganda ko'radigan narsa yo'q.

**Tuzatildi (qisman):** `web/` da Next.js 15 ilovasi — repo ichida, lekin
**alohida paket** (o'z `package.json`, lockfile, `node_modules`). pnpm
workspace ataylab ishlatilmadi: u root `Dockerfile` dagi
`pnpm install --frozen-lockfile` ni buzib KRITIK-1 tuzatilishini yo'qqa
chiqarardi. `.dockerignore` ga `web/` qo'shildi.

Ikki bo'lak qurildi:

| Bo'lak | Ekranlar | Holat |
|---|---|---|
| Ommaviy o'qish (`33620a9`) | `/`, `/turnirlar`, `/turnirlar/[id]`, `/reyting`, `/oyinchi/[id]` | ✅ ishlaydi |
| Hakam konsoli (`4959077`) | `/konsol/kirish`, `/konsol`, `/konsol/turnir/[id]` | ✅ ishlaydi |

Dizayn tokenlari dizayn tizimidan **aynan** ko'chirildi (taxmin yo'q):
Study (qorong'i, standart) / Editorial (yorug') temalari, emerald aksent,
Playfair + Inter + IBM Plex Mono (uchalasi kirillni qo'llaydi — brifning
qattiq talabi), "taxta motivi" ajratgich, bo'sh/xato holatlari birinchi
darajali ekran sifatida.

Xavfsizlik: access token **faqat xotirada** (localStorage emas — u
httpOnly refresh cookie himoyasini bekor qilardi); CORS umuman yo'q,
chunki `/api/*` Next rewrite orqali bir xil origin'da qoladi.

Jonli tekshirildi (real backend + seed, hammasi Next proxy orqali):
login → refresh → tur generatsiyasi → natija kiritish → turni yopish →
keyingi tur (201, 3 juftlik) → jadval PDF (1842 bayt, `%PDF-`) va
juftlik varaqasi PDF (1731 bayt). Ommaviy sahifa yangilangan jadvalni
darhol ko'rsatadi.

**Nega hali ham QISMAN — nima yo'q:**

- **Onlayn o'yin UI QO'SHILDI** (`/oyin/[id]` + `live-game.tsx`):
  Socket.IO orqali jonli holat, yurish qilish, durang taklifi va
  taslim. Kontrakt jonli tekshirilgan (quyida).

  ~~Qolgani: matchmaking navbati UI va o'yinlar ro'yxati sahifasi —
  hozircha o'yinga faqat to'g'ridan-to'g'ri havola bilan kiriladi.~~
  ✅ QO'SHILDI (`850e0de`) — `/oyin`: navbat (6 preset) va faol
  o'yinlar ro'yxati. Shu bilan birga IKKI kamchilik tuzatildi:
  `/oyin/[id]` da `token={null}` qotirilgan edi (kirgan o'yinchi ham
  yura olmasdi) va yurish huquqi token borligidan hisoblanardi —
  endi u server bergan `viewerRole` dan keladi, ya'ni kirgan
  tomoshabin taxtani sudra olmaydi. Navbat natijasi takroriy
  so'rov bilan emas, `matchmaking:matched` push'i bilan keladi.
  Jonli tekshirildi: queued → matched → push → join ack `white` →
  yurish `ply 1`.

  ⚠️  **chessground GPL-3.0 blokeri YOPILDI.** `docs/README.md` uni
      "tijorat mahsulotga mos keladimi — Yurist" degan *bloklovchi*
      savol deb belgilagan edi. Yechim yuridik emas, muhandislik
      bo'ldi: chessground o'rniga `react-chessboard` (MIT). Frontend
      bog'liqlik daraxti tekshirildi — 289 paket, GPL/AGPL/SSPL/CC-BY-NC
      oilasidan HECH NARSA yo'q (MIT 247, ISC 12, Apache-2.0 10, BSD 12,
      MPL-2.0 3). Ya'ni bu savolni yuristga yubormasa ham bo'ladi.
- ~~Fair-play komissiya paneli~~ ✅ QO'SHILDI (`ad54fdb`) — ishlar
  ro'yxati, signallar, qaror formasi. Uchala qorovul (asos uzunligi,
  sanksiya muddati, takroriy qaror) jonli tekshirilgan.
- **To'lov oqimi UI** — provayderlar ulanmagani uchun (JIDDIY-9) mazmunsiz.
- ~~Til almashtirgich~~ ✅ QO'SHILDI (`e904635`) — to'rt til, lug'at
  to'liqligi 124 test bilan majburlangan. Qolgan cheklov: cookie
  asosida, ya'ni SEO uchun URL prefiksli lokalizatsiya kerak bo'ladi.
- **Mobil ko'rinish** — jadvallar `overflow-x` bilan surilади, lekin
  maketlardagi mobil layout alohida ishlanmagan.
- Frontend testlari QISMAN (`93774f8`, `e904635`, `850e0de`): sof mantiq
  (formatlash, lug'at, vaqt nazorati) 156 test bilan qoplangan. **E2E va
  komponent testlari hali yo'q** — sahifalar jonli smoke-test bilan
  tekshirilgan (navbat oqimi uchun: queued → matched → push → yurish).

---

#### JIDDIY-8 — Hakam tomonidan ro'yxatga olish yo'q ✅ TUZATILDI (2026-09-01, `af06554`)

**`src/modules/tournament/tournament.service.ts:277-281`** ·
**`src/modules/tournament/dto/register.dto.ts:6`**

```
* TODO(Faza 1): hakam tomonidan ro'yxatga olish (dto'da playerId).
```

`POST /sections/{sectionId}/registrations` faqat **o'zini** ro'yxatga olish
uchun ishlaydi (DTO bo'sh, `playerId` maydoni yo'q). Faza 1 Ish doirasi esa
"O'yinchini ro'yxatga olish (**o'zi yoki hakam tomonidan**)" deb yozadi.

**Qanday sharoitda buziladi:** real turnirda — kelib qolgan o'yinchini
(late entry) hakam qo'sha olmaydi; kompyuteri yo'q o'yinchi qatnasha olmaydi;
maktab o'qituvchisi sinfini kirita olmaydi. JIDDIY-4 dagi ro'yxatdan o'tish
limiti (3/soat/IP) bilan birga bu Faza 7 (B2G, asosiy daromad manbai) uchun
bloker.

Kutish ro'yxati (waitlist) ham yo'q — `tournament.service.ts:277`:
_"maxPlayers limiti → SECTION_FULL (kutish ro'yxati — keyinroq)"_.

---

#### JIDDIY-9 — To'lov provayderlari ulanmagan; webhook imzosi 🟡 QISMAN TUZATILDI (2026-09-01, `f2eed80`)

**`src/modules/billing/providers/click.provider.ts:44`** ·
**`src/modules/billing/billing.controller.ts:145-150`**

> **Tuzatildi — eng xavfli qism:** `main.ts` da `rawBody: true` yoqildi va
> `WebhookVerifyInput.rawBody` endi `Buffer`. Imzo XOM baytlar ustidan
> tekshiriladi; parse qilingan body alohida maydonda va imzo uchun
> ishlatilmaydi.
>
> **OCHIQ QOLDI:** Click/Payme adapterlarining o'zi. Ular sandbox
> merchant kredensiallarini talab qiladi (docs.click.uz ro'yxati) —
> bu tashqi bog'liqlik, kod masalasi emas.

Click va Payme adapterlari `configured = false` bilan stub. Bu **halol yechim** —
soxta imzo formulasi o'ylab topilgandan ancha yaxshi, va stub `PROVIDER_NOT_CONFIGURED`
bilan to'lov boshlanishidan **oldin** rad etadi (jonli tekshirildi).

Ammo webhook controlleri hozir **parse qilingan JSON** ni uzatadi:

```
* TODO(billing): real provayder ulanganda imzo XOM body ustidan
* tekshirilishi kerak — main.ts'da NestFactory.create(..., { rawBody: true })
```

**Qanday sharoitda buziladi:** provayder ulangan kunda. `main.ts:39` da
`rawBody: true` yo'q, demak imzo tekshiruvi qayta serializatsiya qilingan
obyekt ustidan bo'ladi va **istalgan JSON kalit tartibi/whitespace o'zgarishi
to'g'ri imzoni rad etadi yoki — yomonroq — soxta imzoni qabul qiladi**.
Bu — pul yo'qotish yo'li. Hozir ta'sir yo'q, chunki adapterlar o'chirilgan,
lekin `main.ts` o'zgarishi **provayder kodidan oldin** kerak.

Amaldagi yagona ishlaydigan yo'l — `MANUAL` (naqd). U to'liq ishlaydi
(jonli tekshirildi: invoys → to'lov → tasdiq → ledger balansi → refund).

---

#### JIDDIY-10 — Fair play tahlili amalda o'chirilgan 🟡 QISMAN TUZATILDI (2026-09-01, `526510f`)

**`src/modules/fairplay/fairplay.module.ts:31-32`** ·
**`src/modules/fairplay/engine/stockfish-uci.adapter.spec.ts:101`**

> **Tuzatildi:** worker image'ida Stockfish 18 bor
> (`/usr/bin/stockfish`, `STOCKFISH_PATH` o'rnatilgan). Jonli
> tekshirildi: worker logi "fairplay worker ishga tushdi
> (engine: UCI engine)" — ya'ni korrelyatsiya yo'li endi FAOL.
>
> **OCHIQ QOLDI:** kalibrlash — yolg'on-pozitiv darajasi va sezuvchanlik
> o'lchovi. Ular ma'lum TOZA va ma'lum CHIT o'yinlar to'plamini talab
> qiladi; bunday ma'lumot loyihada yo'q va uni to'qib bo'lmaydi.

```
* ENGINE GATING: STOCKFISH_PATH yo'q → ANALYSIS_ENGINE = null →
* korrelyatsiya toza o'chirilgan, vaqt tahlili ishlayveradi
```

`STOCKFISH_PATH` sozlanmagan, binar repoda yo'q, va Docker image (KRITIK-1)
uni o'rnatolmaydi. Natijada:

- engine korrelyatsiyasi (Faza 6 ning **asosiy** signali) hech qachon ishlamaydi;
- `stockfish-uci.adapter.spec.ts` dagi testlar `describe.skip` bilan o'tkazib
  yuboriladi (43 to'plamdan 2 ta skip aynan shular);
- Faza 6 DoD ning yolg'on-pozitiv/sezuvchanlik/CPU o'lchov bandlari o'lchanmagan.

Gating naqshi to'g'ri (billing bilan bir xil, degradatsiya toza), lekin modul
amalda faqat **vaqt tahlili** (`timing-analysis.ts`) darajasida ishlaydi.

---

#### JIDDIY-11 — `docker compose up` ilovani ko'tarmaydi ✅ TUZATILDI (2026-09-01, `9cd3937` + `5d46f93`)

**`docker-compose.yml`** (xizmatlar: postgres, redis, minio, mailpit, +
observability profili)

Compose faylida **`app` xizmati yo'q**. Faza 0 DoD ning birinchi bandi:

> `git clone` → `docker compose up` → ishlaydigan API, **hech qanday qo'lda qadam yo'q**

README (`README.md:168-176`) buni to'g'ri va halol hujjatlaydi (5 qadam:
install → .env → compose → migrate → seed → start), ya'ni yashirin da'vo yo'q.
Lekin DoD bandi bajarilmagan, va KRITIK-1 sababli uni bajarish hozir imkonsiz.

Shu bilan bog'liq: `prisma/seed.ts` faqat 1 federatsiya va 14 viloyat yaratadi —
**admin foydalanuvchi yo'q**. Yangi dasturchi tizimga kirsa ham hech narsa
qila olmaydi; SUPER_ADMIN rolini berish uchun bazaga qo'lda `INSERT` kerak
(shu auditda aynan shunday qilindi).

---

### 🟡 KICHIK

| #       | Topilma                                                                                                     | Joy                                            | Ta'sir                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K-1     | `openapi:export` skripti ishlamaydi — `scripts/` papkasi mavjud emas                                        | `package.json:40`                              | `pnpm openapi:export` → ENOENT                                                                                                                                                                                                                                                                                                                           |
| K-2     | 5 ta ustun `@map` siz — DB'da camelCase (`"timeCategory"`, `"pairingSystem"`), qolgan hammasi snake_case    | `prisma/schema.prisma`                         | Xom SQL'da tirnoq talab qiladi, `docs/03` konvensiyasini buzadi                                                                                                                                                                                                                                                                                          |
| K-3 ✅  | `.gitattributes` yo'q → Windows'da `format:check` yiqiladi                                                  | repo ildizi                                    | **TUZATILDI 2026-09-01 (`7100e7f`)** — `* text=auto eol=lf`                                                                                                                                                                                                                                                                                              |
| K-4     | Express 5 uchun eskirgan route naqshi `'*'` — har ishga tushishda 3 ta ogohlantirish                        | `metrics.module.ts:108`, pino, throttler       | Hozir avto-konvertatsiya qilinadi; keyingi major versiyada buziladi                                                                                                                                                                                                                                                                                      |
| K-5 ✅  | PDF eksport yo'q (juftlik varaqasi, jadval, natijalar)                                                      | `src/core/export/`                             | **TUZATILDI 2026-09-01 (`2ab0ae5`)** — `pdf-writer.ts` + 2 endpoint                                                                                                                                                                                                                                                                                      |
| K-6     | Kutish ro'yxati (waitlist) yo'q                                                                             | `tournament.service.ts:277`                    | To'lgan seksiyada `SECTION_FULL`, navbat yo'q                                                                                                                                                                                                                                                                                                            |
| K-7     | Eskirgan TODO: "Faza 2: PairingModule" — Swiss dvigateli allaqachon ulangan                                 | `app.module.ts:157`                            | O'quvchini chalg'itadi (`arbiter.service.ts:86` da ishlaydi)                                                                                                                                                                                                                                                                                             |
| K-8     | TRF eksportida shahar va federatsiya qattiq kodlangan (`022 Tashkent`, `032 UZB`)                           | `export-mapping.ts:20-22`                      | Boshqa shahardagi turnir noto'g'ri eksport qilinadi                                                                                                                                                                                                                                                                                                      |
| K-9     | Audit sababi `after` JSONB ichida saqlanadi, alohida ustun emas                                             | `audit.service.ts:83-88`, `audit_logs` jadvali | Sabab bo'yicha filtrlash/indekslash mumkin emas; `/admin/audit-logs` javobida ko'rinmaydi                                                                                                                                                                                                                                                                |
| K-10    | `OutboxPublisher` shutdown paytida xato log qiladi (`P1017: Server has closed the connection`)              | `outbox.publisher.ts:43,77`                    | Har deploy'da ERROR-darajali shovqin; funksional zarar yo'q                                                                                                                                                                                                                                                                                              |
| K-11    | `dbPoolWaiting` metrikasi ro'yxatdan o'tgan, lekin hech qachon oziqlantirilmaydi (kodda halol qayd etilgan) | `metrics.service.ts:446-455`                   | `docs/11 §6.1` talab qiladi; dashboard'da bo'sh panel                                                                                                                                                                                                                                                                                                    |
| K-12    | HTTP metrikalari `farzin_` prefiksisiz (`http_request_duration_seconds`), qolgan hammasi prefiksli          | `metrics.service.ts:216,224`                   | Ataylab (`docs/15:369` shunday yozadi), lekin nomlash nomuvofiqligi ko'rinadi                                                                                                                                                                                                                                                                            |
| K-13    | Docker image DoD chegarasidan katta: api **829 MB**, worker **1.02 GB** (chegara 250 MB)                    | `Dockerfile`                                   | `pnpm prune --prod` pnpm store'da peer sifatida ushlanib qolgan `prisma` (67 MB) va `typescript` (23 MB) ni olib tashlamaydi; `.bin/prisma` symlink'i esa o'chgani uchun CLI baribir chaqirilmaydi — ~90 MB o'lik yuk. Farq Dockerfile sarlavhasida o'lchov bilan izohlangan (DoD "yoki farq izohlangan" varianti). To'g'ri yechim: `pnpm deploy --prod` |
| K-14    | `docs/runbooks/` papkasi yo'q, lekin 11 ta alert `runbook_url` bilan unga ishora qiladi                     | `infra/prometheus/farzin-rules.yml`            | docs/15 §6.5 4-qoidasi "runbook'siz alert qo'shilmaydi" deydi. Bu qoidadan ONGLI chekinish: alertsiz qolish runbooksiz alertdan yomonroq                                                                                                                                                                                                                 |
| K-15 ✅ | Prettier versiyasi suzuvchi (`^3.4.2` → 3.9.5) — 101 faylda formatlash farqi, CI'da ham yiqilardi           | `package.json`                                 | **TUZATILDI 2026-09-01 (`715515f`)** — qayta formatlandi, versiya aniq qotirildi. Audit "sabab faqat CRLF" degan xulosasi TO'LIQ EMAS edi                                                                                                                                                                                                                |
| K-16 ✅ | Dockerfile HEALTHCHECK `/api/health/live` ga urinardi, haqiqiy yo'l `/health/live`                          | `Dockerfile`                                   | **TUZATILDI 2026-09-01 (`526510f`)** — konteyner abadiy `unhealthy` bo'lardi va compose `depends_on: service_healthy` hech qachon ochilmasdi                                                                                                                                                                                                             |
| K-17 ✅ | `pnpm prune --prod` prune'dan keyin `prepare` (husky) ni qayta chaqirib build'ni yiqitardi                  | `Dockerfile:42`                                | **TUZATILDI 2026-09-01 (`526510f`)** — `--ignore-scripts`. KRITIK-1 ning IKKINCHI to'sig'i edi                                                                                                                                                                                                                                                           |
| K-18 | **WS gateway anonim tomoshabinni RAD ETADI, REST esa qo'llaydi** | `play.gateway.ts:167-172` | `GET /play/games/:id` `@Public` va `viewerRole: 'spectator'` qaytaradi, ya'ni dizayn anonim tomoshabinni nazarda tutadi. Lekin `handleConnection` tokenni SHARTSIZ talab qiladi va tokensiz socket'ni `token_expired` bilan uzadi. Natijada anonim ko'ruvchi jonli yangilanish OLA OLMAYDI. Frontend hozircha buni ochiq aytadi ("statik ko'rinish — jonli yangilanish uchun kiring") va socket'ni umuman ochmaydi. Jonli tekshiruvda aniqlandi (2026-09-01). Tuzatish: gateway'da tokensiz ulanishga FAQAT `spectator` roli bilan ruxsat berish |
| K-19 | **`timeCategory` reyting hovuzini tanlaydi, lekin vaqt bilan solishtirilmaydi** | `matchmaking.service.ts:161`, `matchmaking-join.dto.ts:12-24` | DTO `timeCategory` ni faqat ro'yxatdan (`BULLET\|BLITZ\|RAPID\|CLASSICAL`) tekshiradi, `baseTimeSeconds` bilan MOSLIGINI tekshirmaydi. Ayni shu qiymat bilan `getCurrentRating(playerId, 'ONLINE', timeCategory)` chaqiriladi, ya'ni u reyting hovuzini tanlaydi. Natija: klient 30 daqiqalik o'yinni `BULLET` deb yuborib, bullet reytingini o'ynab olishi mumkin — docs/06 §5 kategoriyalarni ataylab ajratganiga zid. Frontend o'z tomonidan kategoriyani vaqtdan hisoblaydi (`web/lib/time-control.ts`), lekin bu **klient tomonidagi qoida** — API'ni to'g'ridan-to'g'ri chaqirgan odamni to'xtatmaydi. Tuzatish: DTO/servisda kategoriyani `base + 60×inc` dan hisoblab, kelgan qiymat bilan solishtirish (mos kelmasa 422) yoki umuman klientdan qabul qilmay, serverda hisoblash |

### ✅ Yaxshi bajarilgan joylar (qisqacha)

Halollik uchun: bu loyihaning **kuchli tomonlari haqiqiy va o'lchangan**.
Sof yadro (`src/core/`) framework'siz va determinstik — soat `Date.now()` ni
chaqirmaydi, `nowMs` tashqaridan beriladi; Glicko-2 rasmiy test vektorini aniq
takrorlaydi; ledger property-test bilan 1000 run'da balansda qoladi; audit log
PostgreSQL trigger'i bilan o'zgarmas; RBAC "noaniqlik = rad" printsipida
(`rbac.service.ts:96-100`) va ruxsat yo'qligini 404 bilan yashiradi; refresh
token reuse detection grace period'siz ishlaydi; Swiss dvigateli har natijadan
keyin FIDE absolyut kriteriylarini **majburiy** qayta tekshiradi. Eng muhimi —
kod o'z cheklovlarini yashirmaydi: `swiss-dutch.engine.ts:31-40`, `game-timers.ts:18-26`
va `click.provider.ts:17-38` dagi izohlar TZ auditidan **oldin** yozilgan halol
bayonlar, va ular audit natijalari bilan to'liq mos chiqdi.

---

## 6. Yetishmayotgan funksiyalar (muhimlik tartibida)

Tuzatish bosqichidan KEYINGI holat. Yopilganlar ~~chizilgan~~.

1. **Frontend** — butun UI qatlami. Dizayn maketlari tayyor, kod yo'q. (JIDDIY-7)
2. ~~Parolni tiklash va o'zgartirish~~ ✅ `5038671`
3. ~~Ishlaydigan Docker image va deploy quvuri~~ ✅ `526510f`, `5ae5698`
4. ~~Email yetkazish~~ ✅ `c2df66d`
5. ~~Hakam tomonidan ro'yxatga olish~~ ✅ `af06554` (CSV _profil yaratish_ — huquqiy blokerda)
6. ~~PDF eksport~~ ✅ `2ab0ae5`
7. ~~Alert qatlami~~ ✅ `0867f38` (**Grafana dashboard** hali yo'q — 25-band)
8. **Real ma'lumot bilan validatsiya** — Swiss-Manager solishtirish, FIDE
   hakami tasdig'i, real turnir. Bu **kod emas, jarayon** — Faza 2 ni
   yopishning boshqa yo'li yo'q.
9. **Click/Payme integratsiyasi** — sandbox kredensiallari kerak. (JIDDIY-9)
10. **O'yin taymerlarining multi-instance ishlashi** — 22-band. (JIDDIY-6)
11. **Fair-play kalibratsiyasi** — ma'lum toza/chit o'yin to'plami kerak. (JIDDIY-10)
12. **Maktab moduli (Faza 7)** — sxemada modellar bor, kod yo'q. B2G daromad yo'li.
13. **Load test va K8s manifestlari** — Faza 5 DoD ning 4 bandi shunga bog'liq.
14. **Masalalar (puzzles)** — dizayn brifida "5 ta narsadan biri", kod yo'q.

### Raqobat konteksti — nima yetishmayotgani sezilib turadi

Farzin Swiss-Manager, Chess-Results va Lichess bilan bir maydonda. Ularda bor,
bunda **yo'q va yo'qligi darhol sezilarli** uchta narsa:

1. **Ko'rinadigan ommaviy sahifa.** Chess-Results'ning butun qiymati — havolani
   ochib jadvalni ko'rish. Farzin'da TRF16 eksport bor, lekin uni ko'rsatadigan
   sahifa yo'q. B2B mijoz (hakam) mahsulotni **ishlab turgan holda** ko'rmasa,
   Swiss-Manager'dan ko'chmaydi — bu `docs/00` da "butun loyihani bloklovchi"
   deb belgilangan xavfning aynan o'zi.
2. **Offline ishlash / bosib chiqarish.** Swiss-Manager real turnir zalida
   internetsiz ishlaydi va qog'ozga chiqaradi. Farzin'da PDF eksport ham yo'q
   (K-5), demak zalda internet uzilsa hakam ishsiz qoladi.
3. **Ma'lumot importi.** Chess-Results/Swiss-Manager dan **ichkariga** olish
   yo'li yo'q (faqat tashqariga TRF16). Migratsiya yo'li bir tomonlama —
   yangi platformaga ko'chishning eng katta to'sig'i shu.

---

## 7. Tuzatish rejasi

Tartib — ta'sir/xarajat nisbati bo'yicha. Hajm: **S** ≈ 1 kun, **M** ≈ 2–5 kun, **L** ≈ 1–3 hafta.

### Darhol (deploy qilish imkoniyatini tiklash) — ✅ HAMMASI BAJARILDI

| #   | Ish                                                   | Hajm  | Holat                                                                                         |
| --- | ----------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| 1   | `Dockerfile` — Stockfish'ni API image'idan chiqarish  | **S** | ✅ `526510f` — ikkita to'siq (stockfish + husky), API/worker ajratildi, HEALTHCHECK tuzatildi |
| 2   | `ci.yml` — `push`/`pull_request` triggerlarini yoqish | **S** | ✅ `5ae5698` — + docker job endi ikkala image'ni quradi                                       |
| 3   | `.gitattributes` qo'shish                             | **S** | ✅ `7100e7f` (+ `715515f` — prettier drift, rejada yo'q edi)                                  |
| 4   | Prometheus konfigi va alert qoidalari                 | **M** | ✅ `0867f38` — 3 recording + 11 alert, promtool tasdiqladi, alert jonli FIRING bo'ldi         |
| 5   | compose'ga `app` + `worker`                           | **S** | ✅ `9cd3937` — + `migrate` xizmati; toza holatdan `up` ishlaydi                               |

### Keyin (foydalanuvchi oqimlarini yopish) — ✅ HAMMASI BAJARILDI

| #   | Ish                                                 | Hajm  | Holat                                                                           |
| --- | --------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| 6   | `login:ip` limitini muvaffaqiyatda qaytarish        | **S** | ✅ `4628068` — `refund()`, IP limiti 20 ga qayta baholandi                      |
| 7   | Email yuborishni `NotificationService` orqali ulash | **S** | ✅ `c2df66d` — `TRANSACTIONAL_MAILER` porti; mailpit'da jonli tasdiqlandi       |
| 8   | `/auth/password/forgot` + `/reset` + `/change`      | **M** | ✅ `5038671` — 10 ta yangi integration test                                     |
| 9   | `recomputeStandings` da haqiqiy `floatHistory`      | **S** | ✅ `3a7082e`                                                                    |
| 10  | Hakam tomonidan ro'yxatga olish + ommaviy import    | **M** | ✅ `af06554` — CSV _profil yaratish_ ONGLI ravishda chiqarildi (huquqiy bloker) |
| 11  | `/metrics` himoyasi                                 | **S** | ✅ `493661e` — `METRICS_TOKEN`, timing-safe, 404                                |
| 12  | `main.ts` da `rawBody: true`                        | **S** | ✅ `f2eed80`                                                                    |
| 13  | Seed'ga SUPER_ADMIN va demo turnir                  | **S** | ✅ `5d46f93` — idempotentligi va prod qorovuli tekshirildi                      |
| 14  | Log redaksiya testi                                 | **S** | ✅ `6e3db73` — haqiqiy pino bilan; qorovul haqiqiyligi tasdiqlandi              |

### Katta ishlar

| #   | Ish                                               | Hajm          | Holat                                                                    |
| --- | ------------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| 15  | PDF eksport (juftlik varaqasi, jadval)            | **M**         | ✅ `2ab0ae5` — 15 ta test, jonli PDF fayl tekshirildi                    |
| 16  | Rate limit + o'yin taymerlarini Redis'ga          | **M**         | 🟡 `3db1070` — rate limit BAJARILDI; **taymerlar YO'Q** (quyida 22-band) |
| 17  | k6 load testlari + K8s manifestlari               | **L**         | ❌ **BAJARILMADI**                                                       |
| 18  | Swiss golden test to'plami (5 real turnir)        | **L**         | ❌ **BAJARILMADI**                                                       |
| 19  | **Frontend** — Next.js ilovasi                    | **L** (oylar) | 🟡 `33620a9` + `4959077` — ommaviy qism va hakam konsoli ✅; taxta/fair-play UI YO'Q |
| 20  | Click/Payme sandbox integratsiyasi                | **L**         | ❌ **BAJARILMADI**                                                       |
| 21  | Stockfish worker image + fair-play kalibratsiyasi | **L**         | 🟡 worker image ✅ (`526510f`); **kalibratsiya YO'Q**                    |

#### Nega 17–21 bajarilmadi — halol sabablar

Bular "vaqt yetmadi" emas, **bajarish uchun shu sessiyada mavjud
bo'lmagan narsa kerak** bo'lgan bandlar:

| #   | To'sig'i                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | DoD o'lchovni talab qiladi: "k6: 1000 concurrent o'yin, threshold'lar o'tadi", "Pod boshiga sig'im **o'lchangan**". Klaster va yuk generatsiya quvvatisiz yozilgan skript — ishlatilmagan kod, ya'ni auditning o'zi ogohlantirgan naqsh |
| 18  | Chess-Results/Swiss-Manager real turnir dump'lari kerak (tashqi ma'lumot) **va** har farqni FIDE hakami bilan tekshirish. Ma'lumotni to'qib bo'lmaydi — golden test'ning butun mohiyati real natijada                                   |
| 19  | **Qisman bajarildi.** Ikki bo'lak (ommaviy o'qish + hakam konsoli) qurildi va jonli tekshirildi. Qolgani: onlayn o'yin taxtasi — `docs/README.md` dagi **chessground GPL-3.0** savoli hali yuristda va u bloklovchi deb belgilangan; fair-play paneli va to'lov UI esa mos backend bo'laklari tayyor bo'lmaguncha mazmunsiz |
| 20  | Click/Payme **sandbox merchant kredensiallari** kerak (docs.click.uz ro'yxati). Imzo formulasi provayder hujjatidan olinadi — `click.provider.ts:17-38` buni aniq yozadi: "Imzo formulasi BU YERDA O'YLAB TOPILMAYDI"                   |
| 21  | Kalibratsiya ma'lum TOZA va ma'lum CHIT o'yinlar to'plamini talab qiladi. Bunday ma'lumot yo'q; to'qilgan to'plamdagi "yolg'on-pozitiv darajasi" — soxta raqam, va docs/08 bo'yicha bu odam karyerasiga tegadigan soha                  |

### Yangi qo'shilgan bandlar (audit davomida topilgan)

| #   | Ish                                                                                        | Hajm  | Nima ochadi                                                               |
| --- | ------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------- |
| 22  | O'yin taymerlarini multi-instance qilish: `ownerNodeId` affinity + forward (docs/07 §10.3) | **L** | JIDDIY-6 ning qolgan yarmi; Faza 5 DoD "pod o'ldirilsa o'yin yo'qolmaydi" |
| 23  | Image slimming: `pnpm deploy --prod` bilan yassi `node_modules`                            | **S** | K-13; DoD 250 MB chegarasi                                                |
| 24  | `docs/runbooks/` — 11 ta alert uchun runbook                                               | **M** | K-14; docs/15 §6.5 4-qoidasi                                              |
| 25  | Grafana datasource + birinchi dashboard                                                    | **S** | Faza 1 DoD "birinchi dashboard" (JIDDIY-3 dan qolgan)                     |

### Bu rejaga kirmagan, lekin bloklaydigan narsalar

`docs/README.md` dagi "bloklovchi ochiq savollar" hali ochiq: bolalar ma'lumoti
huquqiy talablari, chessground GPL-3.0 litsenziyasi (frontend uchun!), fiskal
chek talablari, ma'lumot lokalizatsiyasi. Bular **muhandis vazifasi emas** —
lekin ular hal bo'lmaguncha mos modullar prod'ga chiqmaydi va bu tayyorlik
foizini oshirmaydi.

---

## 8. Metodologiya

Barcha buyruqlar shu commit (`5355b3e`), Windows 11, Node 22.17, pnpm 9.15,
Docker 29.6.1 muhitida haqiqatan bajarildi. Testlar uchun real PostgreSQL 17 va
Redis 7 konteynerlari ko'tarildi. Ilova `dist/main.js` dan ishga tushirilib,
59 endpointning asosiy oqimlari `curl` orqali sinaldi; FIDE kriteriylari
bevosita PostgreSQL so'rovlari bilan tekshirildi. Audit davomida loyiha kodiga
**hech qanday o'zgartirish kiritilmadi** (`git status` toza); yaratilgan sinov
ma'lumotlari va konteynerlar tozalandi.
