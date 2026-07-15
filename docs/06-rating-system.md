# 06 — Reyting tizimi (Milliy Glicko-2 + FIDE Elo oynasi)

> Modul: `rating`
> Status: spetsifikatsiya (implementatsiya boshlanmagan)
> Bog'liq modullar: `player`, `tournament`, `arbiter`, `play`, `fairplay`, `analytics`

Bu hujjat Farzin'ning milliy reyting tizimini ta'riflaydi. Ikki xil reyting mavjud:

1. **Farzin milliy reytingi** — Glicko-2 asosida, Farzin o'zi hisoblaydi. Bu tizimning javobgarlik zonasi.
2. **FIDE Elo** — tashqi manba. Farzin uni **hisoblamaydi**, faqat oyna (mirror) sifatida saqlaydi va ko'rsatadi.

Bu ikkisini aralashtirib yubormaslik — hujjatning eng muhim qoidasi. Milliy reyting FIDE reytingiga
ta'sir qilmaydi va aksincha.

---

## 1. Nega Glicko-2, Elo emas

### 1.1 Elo kamchiliklari

Elo (Arpad Elo, 1960-yillar) o'z davri uchun ajoyib tizim edi — qo'lda, qog'ozda hisoblash mumkin.
Farzin kompyuterda hisoblaydi, shuning uchun bu cheklov endi ustunlik emas. Elo'ning uchta jiddiy
kamchiligi bor:

**1. Ishonch darajasi (uncertainty) yo'q.**
Elo'da o'yinchining reytingi bitta son: `1600`. Bu son 5 ta o'yindan keyin ham `1600`, 500 ta
o'yindan keyin ham `1600`. Lekin bu ikki `1600` mutlaqo boshqa narsa. Birinchisi — "biz deyarli
hech narsa bilmaymiz, taxminan 1600 atrofida bo'lsa kerak". Ikkinchisi — "biz ishonch bilan
aytamiz: 1600, ±30". Elo bu farqni ifodalay olmaydi, chunki uning modelida ifodalash uchun joy yo'q.

Amaliy oqibat: yangi o'yinchi bilan o'ynagan tajribali o'yinchi noto'g'ri miqdorda reyting yo'qotadi
yoki oladi, chunki tizim yangi o'yinchining `1600` i qanchalik ishonchsiz ekanini bilmaydi.

**2. Kam o'ynagan va faol o'yinchi bir xil muomala ko'radi.**
Ikki yil o'ynamagan o'yinchining reytingi Elo'da o'zgarmay turaveradi. Lekin haqiqatda bizning
u haqidagi bilimimiz eskirdi — u kuchaygan yoki zaiflashgan bo'lishi mumkin. Elo'da vaqt o'tishi
hech qanday effekt bermaydi. Turnirga ikki yildan keyin qaytgan o'yinchi eski reytingi bilan
kirib keladi va bu boshqa ishtirokchilar uchun adolatsiz.

**3. K-factor qo'lda sozlanadi.**
Elo'da o'zgarish tezligi `K` koeffitsienti orqali boshqariladi. FIDE'da: yangi o'yinchilar uchun
K=40, 2400 dan past uchun K=20, 2400 dan yuqori uchun K=10, 18 yoshgacha K=40. Bu — qo'lda
qo'yilgan qadamli (step function) qoidalar to'plami. Ular chegara atrofida sakrash yaratadi:
reytingi 2399 dan 2400 ga o'tgan o'yinchining o'zgarish tezligi ikki barobar sekinlashadi,
garchi uning haqiqiy kuchi deyarli o'zgarmagan bo'lsa ham. Bu qoidalar statistik model'dan
kelib chiqmaydi — ular kelishuv (convention).

### 1.2 Glicko-2 nima beradi

Glicko-2 (Mark Glickman, 2001-yilda Glicko, 2012-yilda Glicko-2) — Elo'ning Bayes yondashuvidagi
kengaytmasi. Har bir o'yinchi bitta son emas, **uchta** son bilan ifodalanadi:

| Parametr | Ma'nosi | Boshlang'ich |
|---|---|---|
| `r` (rating) | Kuchning nuqtaviy bahosi | 1500 |
| `RD` (rating deviation) | Bahoning standart og'ishi — ishonchsizlik | 350 |
| `σ` (volatility) | Natijalarning kutilmaganlik darajasi | 0.06 |

**RD** — bu Elo'da yetishmagan ishonch darajasi. Statistik ma'nosi: o'yinchining haqiqiy kuchi
taxminan 95% ehtimol bilan `[r − 2·RD, r + 2·RD]` oralig'ida. RD=350 bo'lgan yangi o'yinchi uchun
bu `[800, 2200]` — ya'ni "bilmaymiz". RD=50 bo'lgan faol o'yinchi uchun `[r−100, r+100]`.

RD ikki tomonlama ishlaydi:
- O'yin o'ynalganda RD **kamayadi** (bilim ortadi).
- Davr o'ynalmasdan o'tsa RD **ortadi** (bilim eskiradi). Bu Elo'ning 2-kamchiligini hal qiladi.

RD shuningdek K-factor'ni **avtomatik** almashtiradi: RD katta bo'lsa reyting tez o'zgaradi,
kichik bo'lsa sekin. Hech qanday qo'lda chegara yo'q — bu formuladan kelib chiqadi. Bu 3-kamchilikni
hal qiladi.

**σ (volatility)** — Glicko-2 ning Glicko'dan asosiy farqi. Bu o'yinchi natijalarining qanchalik
kutilmagan (erratic) ekanini o'lchaydi. Barqaror o'ynaydigan o'yinchida σ past bo'ladi. Ba'zan
grossmeysterni yutib, ba'zan ancha zaif o'yinchiga yutqazadigan o'yinchida σ ko'tariladi va
uning reytingi kelgusi davrlarda tezroq o'zgarishga ruxsat oladi. Amaliy foydasi: kuchayib
borayotgan yosh o'yinchi (O'zbekistonda bu keng tarqalgan holat — maktab dasturi tufayli)
haqiqiy kuchiga tezroq yetib boradi.

### 1.3 Taqqoslash

| Xususiyat | Elo | Glicko | Glicko-2 |
|---|---|---|---|
| O'yinchi holati | `r` | `r`, `RD` | `r`, `RD`, `σ` |
| Ishonch darajasi | Yo'q | Bor (RD) | Bor (RD) |
| Faolsizlik effekti | Yo'q | RD ortadi | RD ortadi |
| O'zgarish tezligi | Qo'lda (K-factor) | Avtomatik (RD) | Avtomatik (RD + σ) |
| Natija barqarorligini modellash | Yo'q | Yo'q | Bor (σ) |
| Hisoblash | Yopiq formula | Yopiq formula | **Iterativ** (σ' uchun) |
| Qo'lda hisoblash mumkinmi | Ha | Qiyin | Yo'q |
| Rating period talab qiladimi | Yo'q | Ha | Ha |

Narxi: Glicko-2 murakkabroq. Volatility iterativ usul bilan topiladi (yopiq formula yo'q),
rating period kerak, o'yinchiga bitta emas uchta son saqlash kerak. Farzin uchun bu narx
qabul qilinadi — biz baribir kompyuterda hisoblaymiz.

### 1.4 Kim ishlatadi

- **Lichess** — Glicko-2 (ochiq manba, τ sozlangan)
- **Chess.com** — Glicko (Glicko-2 emas, taxminiy ma'lumot — rasmiy tasdiq yo'q)
- **FIDE** — Elo (o'zgartirishga urinishlar bo'lgan, hozircha Elo)
- **Australian Chess Federation** — Glicko

Farzin FIDE bilan raqobatlashmaydi — biz **milliy** reyting beramiz, FIDE **xalqaro** beradi.
Ikkisi parallel yashaydi. Bu O'zbekistonda ayniqsa muhim: FIDE reytingiga ega o'yinchilar soni
kam (xalqaro turnirlar qimmat), lekin viloyat turnirlarida o'ynaydigan minglab o'yinchi bor.
Ular uchun milliy reyting yagona obyektiv o'lchov bo'ladi.

---

## 2. Glicko-2 to'liq matematikasi

> **Manba:** Mark E. Glickman, *"Example of the Glicko-2 system"*, Boston University, 2012.
> Quyidagi barcha formulalar shu hujjatdan olingan va §12.1 dagi test vektori bilan
> sonli tekshirilgan. Implementatsiya paytida original PDF bilan yana bir marta solishtirilsin.

Glicko-2 ikki xil shkalada ishlaydi:
- **Ko'rinadigan shkala** (`r`, `RD`) — foydalanuvchiga ko'rsatiladigan, Elo'ga o'xshash (1500 atrofida).
- **Ichki shkala** (`μ`, `φ`) — hisoblash uchun. Logistik funksiya bilan qulay ishlaydi.

Ikkisi orasidagi konvertatsiya konstantasi:

```
q = 173.7178
```

Bu son tasodifiy emas: `400 / ln(10) = 173.7177...`. U Elo'ning "400 ball farq = 10:1 yutish
nisbati" kelishuvini logistik shkalaga bog'laydi.

### Qadam 1 — Boshlang'ich holat

Reytingi yo'q o'yinchi uchun:

```
r = 1500
RD = 350
σ = 0.06
```

### Qadam 2 — Glicko-2 shkalasiga o'tish

O'yinchining o'zi uchun:

```
μ = (r − 1500) / 173.7178
φ = RD / 173.7178
```

Har bir raqib `j` uchun ham xuddi shunday:

```
μⱼ = (rⱼ − 1500) / 173.7178
φⱼ = RDⱼ / 173.7178
```

`σ` konvertatsiya qilinmaydi — u allaqachon Glicko-2 shkalasida.

**Muhim:** raqiblarning `rⱼ`, `RDⱼ` qiymatlari — davr **boshidagi** qiymatlar, davr oxiridagi
emas. Barcha o'yinchi bir vaqtning o'zida, bir xil snapshot asosida hisoblanadi. Bu batch
hisoblashning mohiyati (§3).

### Qadam 3 — g(φ) funksiyasi

```
g(φ) = 1 / sqrt(1 + 3φ² / π²)
```

**Ma'nosi:** raqibning ishonchsizligi natijaning "og'irligini" qanchalik kamaytirishi.
`g(φ)` har doim `(0, 1]` oralig'ida:
- Raqib RD si kichik (aniq bilamiz) → `φⱼ ≈ 0` → `g ≈ 1` → natija to'liq hisobga olinadi.
- Raqib RD si katta (bilmaymiz) → `g` kichrayadi → natija kamroq ta'sir qiladi.

Bu mantiqiy: RD=350 bo'lgan noma'lum o'yinchini yutish sizning kuchingiz haqida kam ma'lumot beradi.

### Qadam 4 — E(μ, μⱼ, φⱼ) kutilgan natija

```
E(μ, μⱼ, φⱼ) = 1 / (1 + exp( −g(φⱼ) · (μ − μⱼ) ))
```

Bu — o'yinchining raqib `j` ga qarshi kutilgan ochkosi (0 dan 1 gacha). Elo'ning kutilgan
natija formulasiga o'xshash, lekin `g(φⱼ)` ko'paytmasi bilan: raqib haqida kam bilsak,
kutilgan natija 0.5 ga yaqinlashadi.

### Qadam 5 — v (estimated variance)

```
        ⎡  m                                              ⎤ −1
v  =    ⎢  Σ   g(φⱼ)² · E(μ,μⱼ,φⱼ) · (1 − E(μ,μⱼ,φⱼ))    ⎥
        ⎣ j=1                                             ⎦
```

Oddiy matnda:

```
v = 1 / Σⱼ [ g(φⱼ)² · E(μ,μⱼ,φⱼ) · (1 − E(μ,μⱼ,φⱼ)) ]
```

**Ma'nosi:** o'yinchining kuchi bahosining faqat o'yin natijalariga asoslangan dispersiyasi
(variance). Kichik `v` — ko'p ma'lumot oldik. Katta `v` — kam ma'lumot.

`E(1−E)` ko'paytmasi Bernoulli taqsimotining dispersiyasi. U `E = 0.5` da maksimal (0.25).
Ma'nosi: **teng kuchli raqib bilan o'yin eng ko'p ma'lumot beradi**. Juda kuchli yoki juda
zaif raqib bilan o'yin (`E ≈ 0` yoki `E ≈ 1`) deyarli ma'lumot bermaydi — natija oldindan
ma'lum edi.

> **Chegara holati:** o'yinchi davrda hech kim bilan o'ynamasa, yig'indi bo'sh bo'ladi va
> `v = 1/0 = ∞`. Bu holat alohida ko'riladi — §2.11 ga qarang. Kodda bu yerga umuman
> yetib borilmasligi kerak.

### Qadam 6 — Δ (estimated improvement)

```
Δ = v · Σⱼ [ g(φⱼ) · (sⱼ − E(μ,μⱼ,φⱼ)) ]
```

bu yerda `sⱼ` — `j` raqibga qarshi haqiqiy natija:

```
sⱼ = 1.0   → yutuq
sⱼ = 0.5   → durrang
sⱼ = 0.0   → yutqazish
```

**Ma'nosi:** reyting shkalasidagi kutilgan siljish. `Σⱼ g(φⱼ)(sⱼ − E)` — bu "kutilgandan
qancha yaxshi o'ynadi" o'lchovi. Ijobiy → kutilgandan yaxshi. Manfiy → yomon.

Qulaylik uchun bu yig'indini alohida belgilaymiz — u keyin `μ'` da yana kerak bo'ladi:

```
S = Σⱼ [ g(φⱼ) · (sⱼ − E(μ,μⱼ,φⱼ)) ]
Δ = v · S
```

### Qadam 7 — Volatility σ' iterativ hisobi

> Bu Glicko-2 ning **eng nozik qismi**. Yopiq formula yo'q — tenglama iterativ yechiladi.
> Xato qilish oson va xato jimgina noto'g'ri reyting beradi (crash emas). Batafsil yozilmoqda.

#### 7.1 Muammo

Biz `σ'` ni shunday topishimiz kerakki, u quyidagi tenglamani qanoatlantirsin. Tenglamani
`x = ln(σ'²)` almashtirish bilan yozamiz (bu `σ' > 0` shartini avtomatik ta'minlaydi —
`e^(x/2)` har doim musbat):

```
f(x) = 0
```

bu yerda:

```
              e^x · (Δ² − φ² − v − e^x)         x − a
f(x)  =  ─────────────────────────────────  −  ───────
              2 · (φ² + v + e^x)²                 τ²
```

va:

```
a = ln(σ²)      ← σ — o'yinchining DAVR BOSHIDAGI volatility'si
```

`f(x)` ikki qismdan iborat:
- Birinchi had — o'yin natijalaridan kelgan "dalil" (likelihood hosilasi).
- Ikkinchi had — prior: `x` ni `a` dan (eski volatility) uzoqlashishiga qarshilik. `τ` bu
  qarshilikning kuchini boshqaradi.

#### 7.2 Nega Illinois algoritmi

`f(x)` monoton kamayuvchi va uzluksiz, shuning uchun ildiz yagona. Bir necha usul bor:

- **Newton-Raphson** — tez, lekin `f'(x)` kerak va konvergensiya kafolatlanmagan (chetlab
  ketishi mumkin).
- **Bisection** — kafolatlangan, lekin sekin (har iteratsiyada oraliq faqat 2 barobar kichrayadi).
- **Regula falsi (false position)** — bisection'dan tez, lekin klassik variantida bir uch
  "yopishib qolishi" mumkin: agar `f` bir tomonda kuchli egilgan bo'lsa, chegaralardan biri
  hech qachon yangilanmaydi va konvergensiya chiziqli sekinlashadi.
- **Illinois** — regula falsi'ning tuzatilgan varianti. Agar bir chegara ketma-ket ikki marta
  saqlanib qolsa, uning `f` qiymati **ikkiga bo'linadi** (`fA = fA/2`). Bu sun'iy ravishda
  ildizni yopishib qolgan uchdan uzoqlashtiradi va superchiziqli konvergensiya beradi.

Glickman rasmiy hujjatda Illinois algoritmini tavsiya qiladi. Farzin ham shuni ishlatadi —
kafolatlangan konvergensiya + hosila kerak emas + amalda 2–5 iteratsiyada tugaydi.

#### 7.3 Algoritm (to'liq)

**Konvergensiya sharti:**

```
ε = 0.000001
```

**A. Boshlang'ich chegaralar:**

```
A = a = ln(σ²)
```

`B` ni topish ikkiga bo'linadi:

```
Agar Δ² > φ² + v  bo'lsa:
    B = ln(Δ² − φ² − v)

Aks holda:
    k = 1
    Toki f(a − k·τ) < 0  bo'lguncha:
        k = k + 1
    B = a − k·τ
```

**Nega ikki xil?** `A` va `B` ildizni orasiga olishi shart (`f(A)` va `f(B)` qarama-qarshi
ishorada). Agar `Δ² > φ² + v` bo'lsa (o'yinchi kutilgandan ancha boshqacha o'ynadi —
volatility oshishi kerak), ildiz `a` dan o'ngda va `ln(Δ² − φ² − v)` ni yuqori chegara
sifatida olish mumkin. Aks holda ildiz `a` dan chapda, va biz `τ` qadam bilan chapga
yurib, `f` ishorasi o'zgargan nuqtani qidiramiz. Ikkinchi holatdagi `while` sikli —
`f(a − k·τ) < 0` ekan davom etadi, ya'ni `f` musbat bo'lgan (ildizni qamragan) birinchi
nuqtada to'xtaydi.

> **Diqqat:** ikkinchi shoxdagi `while` nazariy jihatdan cheksiz emas (`f(x) → +∞` when `x → −∞`),
> lekin float underflow bo'lgan patologik holatda himoya sifatida `k` ga qattiq chegara
> (masalan 100) qo'yiladi va oshib ketsa xato tashlanadi. Bu holat amalda kuzatilmasligi kerak.

**B. Iteratsiya:**

```
fA = f(A)
fB = f(B)

Toki |B − A| > ε  bo'lguncha:

    1. C = A + (A − B) · fA / (fB − fA)        ← regula falsi kesishmasi
       fC = f(C)

    2. Agar fC · fB ≤ 0  bo'lsa:
           A = B
           fA = fB
       Aks holda:
           fA = fA / 2                          ← Illinois tuzatishi

    3. B = C
       fB = fC
```

**C. Natija:**

```
σ' = e^(A/2)
```

> **Nozik nuqta:** natija `A` dan olinadi, `B` dan emas. Sikl tugaganda `|B − A| ≤ ε`,
> shuning uchun farqi ahamiyatsiz, lekin rasmiy hujjatga sodiq qolamiz.

> **Yana bir nozik nuqta:** 2-qadamdagi shart `fC · fB ≤ 0` — ya'ni `fC` va `fB` qarama-qarshi
> ishorada (ildiz ular orasida). Bu holda `A` chegarasi `B` ga siljiydi. Aks holda `A`
> o'z joyida qoladi va uning `f` qiymati yarimlanadi — bu aynan Illinois tuzatishi.
> `<` emas, `≤` — nol holatini to'g'ri ushlash uchun.

### Qadam 8 — φ* (pre-rating period value)

```
φ* = sqrt(φ² + σ'²)
```

**Ma'nosi:** davr davomida o'yinchining kuchi o'zgargan bo'lishi mumkin, shuning uchun
ishonchsizlikni oshiramiz — **o'yin natijalarini hisobga olishdan oldin**. Bu "vaqt o'tdi,
biz kamroq ishonamiz" qadami. Yangi volatility `σ'` ishlatiladi, eskisi emas.

### Qadam 9 — φ' (yangi RD, Glicko-2 shkalasida)

```
φ' = 1 / sqrt( 1/φ*² + 1/v )
```

**Ma'nosi:** ikkita ma'lumot manbaini birlashtirish (Bayes'cha):
- `1/φ*²` — oldingi bilim aniqligi (precision).
- `1/v` — o'yin natijalaridan kelgan aniqlik.

Aniqliklar qo'shiladi, keyin teskari kvadrat ildiz. Natijada `φ'` har doim `φ*` dan
**kichik** — o'yin o'ynash har doim ishonchsizlikni kamaytiradi.

### Qadam 10 — μ' (yangi reyting, Glicko-2 shkalasida)

```
μ' = μ + φ'² · Σⱼ [ g(φⱼ) · (sⱼ − E(μ,μⱼ,φⱼ)) ]
```

yoki §2.6 dagi `S` belgisi bilan:

```
μ' = μ + φ'² · S
```

> **Tez-tez qilinadigan xato:** bu yerda `Δ` ni ishlatib yubormaslik. `Δ = v · S`, va
> `μ' = μ + φ'² · S` — ya'ni `μ' = μ + (φ'²/v) · Δ`. Agar `μ' = μ + Δ` deb yozsangiz,
> reyting noto'g'ri (odatda haddan tashqari katta) o'zgaradi. `Δ` faqat volatility
> hisobida ishlatiladi.

### Qadam 11 — O'ynamagan o'yinchi

Agar o'yinchi davrda **birorta ham** reytingli o'yin o'ynamagan bo'lsa, yuqoridagi qadamlar
qo'llanmaydi (`v` aniqlanmagan bo'lardi). Buning o'rniga:

```
μ' = μ                          ← reyting o'zgarmaydi
φ' = sqrt(φ² + σ²)              ← RD ortadi, ESKI σ bilan
σ' = σ                          ← volatility o'zgarmaydi
```

Bu Glicko-2 ning Elo ustidan asosiy ustunligi: **faolsizlik jazolanmaydi, lekin ishonchsizlik
ortadi**. Reyting tushmaydi — faqat "biz kamroq ishonamiz" degan belgi qo'yiladi.

`φ'` uchun yuqori chegara qo'yiladi (§4.3), aks holda 10 yil o'ynamagan o'yinchining RD si
cheksiz o'sib ketadi.

### Qadam 12 — Asl shkalaga qaytish

```
r'  = 173.7178 · μ' + 1500
RD' = 173.7178 · φ'
```

`σ'` konvertatsiya qilinmaydi — u o'z shkalasida saqlanadi.

### 2.13 Sistema konstantasi τ

`τ` — volatility'ning bir davrda qanchalik o'zgarishi mumkinligini cheklaydi. U `f(x)` ning
prior hadida turadi: `−(x − a)/τ²`.

- **Kichik τ** (masalan 0.3) → prior kuchli → volatility sekin o'zgaradi → reyting barqaror,
  lekin haqiqiy kuch o'zgarishiga sekin javob beradi.
- **Katta τ** (masalan 1.2) → prior kuchsiz → volatility tez o'zgaradi → tizim sezgir,
  lekin bitta g'alati natija reytingni keskin sakratishi mumkin.

Glickman tavsiyasi: `0.3 ≤ τ ≤ 1.2`. Rasmiy hujjatda "kichikroq qiymatlar volatility'ning
vaqt bo'yicha o'zgarishini cheklaydi" deyilgan va misolda `τ = 0.5` ishlatilgan. Glickman
shuningdek: agar tizimda kutilmagan natijalar ko'p bo'lsa, τ ni kichikroq tanlash kerak.

**Farzin tanlovi:**

```
τ = 0.5
```

**Sabab:**

1. **Bu Glickman'ning rasmiy misolidagi qiymat.** Bizning test vektorimiz (§12.1) aynan shu
   qiymatga asoslangan. Implementatsiya to'g'riligini rasmiy hujjatga qarab tekshirish
   imkonini beradi — bu ishga tushirish bosqichida katta qiymatga ega.
2. **O'rta yo'l.** 0.3–1.2 oralig'ining pastki yarmida — barqarorlik tomonga egilgan. Milliy
   reyting **rasmiy hujjat** (turnir seedingi, unvon, terma jamoa tanlovi unga bog'lanadi),
   shuning uchun barqarorlik sezgirlikdan muhimroq.
3. **Lichess amaliyoti.** Lichess Glicko-2 ni katta miqyosda ishlatadi va τ ni past qiymatga
   sozlagan (ochiq manba kodida `0.75` ga yaqin qiymat kuzatilgan — **aniq qiymat tekshirilishi
   kerak**). Ularning tajribasi: standart qiymatlar onlayn muhitda juda sezgir.

**Halol chegara:** `τ = 0.5` — bu **boshlang'ich taxmin**, yakuniy javob emas. To'g'ri qiymat
faqat real ma'lumot bilan aniqlanadi. Glickman'ning o'zi τ ni ma'lumotdan baholashni tavsiya
qiladi, lekin buning uchun bizda hali ma'lumot yo'q.

**Reja:** birinchi 12 rating period to'plangandan keyin τ ∈ {0.3, 0.5, 0.75, 1.0} qiymatlari
uchun tarixiy ma'lumotda backtest o'tkaziladi. Mezon — prediktiv aniqlik (§10.3 dagi
Brier score va log-loss). Eng yaxshi qiymat tanlanadi. τ o'zgarsa — **butun tarix qayta
hisoblanadi** (§9), chunki τ o'tmishdagi barcha davrlarga ta'sir qiladi.

`τ` `RatingPeriod` yozuvida saqlanadi (§8.1) — shuning uchun har bir davr qaysi τ bilan
hisoblangani ma'lum bo'ladi va qayta hisoblash aniq takrorlanadi.

---

## 3. Rating period — nega batch, real-time emas

### 3.1 Muammo

Glicko-2 **rating period** tushunchasiga asoslangan: bir davrda o'ynalgan barcha o'yin
**birgalikda**, davr boshidagi reytinglar asosida hisoblanadi. Bu Elo'dan tub farq —
Elo'da har o'yin darhol hisoblanadi.

Nega birgalikda? Chunki Glicko-2 statistik model: u "bu o'yinchi bu davrda shu raqiblarga
qarshi shunday o'ynadi" degan **butun dalilni** bir vaqtda ko'radi va undan optimal baho
chiqaradi. O'yinlarni birma-bir qayta ishlash bu modelni buzadi.

### 3.2 Tartib bog'liqligi

Real-time hisoblashda natija **o'yinlar tartibiga bog'liq** bo'lib qoladi. Misol: o'yinchi
5 turli turnirni A, B, C, D, E tartibida o'ynadi. Agar tartib E, D, C, B, A bo'lganida —
real-time hisobda yakuniy reyting **boshqacha** bo'lar edi, chunki har o'yin oldingisining
natijasiga qurilgan.

Bu qabul qilinmaydi. Turnirdagi 9 tur — bir kunda o'ynaladi, ular orasida o'yinchining
kuchi o'zgarmagan. Ularni ketma-ket hisoblash sun'iy tartib effektini kiritadi. Batch
hisoblashda tartib **umuman ahamiyatsiz** — bu yaxshi xususiyat va u testda tekshiriladi (§12.3).

### 3.3 Davr uzunligi tanlovi

Glickman tavsiyasi: davr shunday tanlansinki, **o'rtacha o'yinchi bir davrda 10–15 o'yin
o'ynasin**. Bu ideal — lekin O'zbekiston sharoitida real emas.

Haqiqat: viloyat turnirlarida o'ynaydigan o'yinchi yiliga 2–4 turnir, har birida 7–9 tur
o'ynaydi. Ya'ni yiliga ~20–35 o'yin. 10–15 o'yin uchun davr ~4–6 oy bo'lishi kerak edi.
Bu juda uzun — o'yinchi turnirdan keyin yarim yil kutishi kerak bo'ladi. Bu mahsulot
sifatida qabul qilinmaydi.

**Farzin tanlovi:**

```
Davr uzunligi: 1 oy
Yopilish vaqti: har oyning 1-sanasi, 00:00 Asia/Tashkent
```

**Sabab:**

1. **FIDE bilan sinxron.** FIDE reyting ro'yxati oyda bir marta chiqadi. Bizning davrimiz
   ham oylik bo'lsa, ikki reyting bir xil ritmda yangilanadi — foydalanuvchi uchun tushunarli
   ("oyning 1-sanasi reytinglar yangilanadi"), operatsion jihatdan qulay (§6.4).
2. **Turnir sikli bilan mos.** O'zbekistonda turnirlar odatda dam olish kunlari yoki maktab
   ta'tillarida bo'ladi. Oylik davr bir turnirni to'liq qamrab oladi.
3. **Kutish vaqti maqbul.** Eng yomon holatda o'yinchi 30 kun kutadi. O'rtacha 15 kun.
4. **Statistik yetarlilik — chetlab o'tiladi.** Oylik davrda faol o'yinchi 7–9 o'yin
   o'ynaydi (bitta turnir). Bu 10–15 dan kam, lekin yaqin. Kam o'ynagan o'yinchining RD si
   yuqori qoladi — bu **xato emas, xususiyat**: tizim halol ravishda "kam bilamiz" deb turadi.

**Onlayn o'yinlar uchun istisno:** `play` moduli orqali o'ynalgan onlayn o'yinlar alohida
reyting kategoriyasida (§5) va ularda faol o'yinchi oyiga 100+ o'yin o'ynashi mumkin. Ular
uchun oylik davr **juda uzun** — o'yinchi bir oy davomida o'z reytingi o'zgarmasligini
ko'radi, bu onlayn mahsulot uchun yomon UX.

**Yechim (bosqichma-bosqich):**
- **1-bosqich (MVP):** onlayn reyting ham oylik davrda. Sodda, bitta kod yo'li.
- **2-bosqich:** onlayn kategoriyalar uchun davr **1 kun**ga qisqartiriladi. Lichess ham
  shunga o'xshash yondashuvni qo'llaydi (ular deyarli har o'yindan keyin hisoblaydi,
  bir o'yinlik davr sifatida). Bu Glicko-2 modelini biroz buzadi (davrda 1–2 o'yin),
  lekin onlayn muhitda kutish vaqti muhimroq.
- OTB (over-the-board) kategoriyalari **har doim oylik** qoladi — bu rasmiy reyting.

Bu qaror `RatingCategory` konfiguratsiyasida saqlanadi, kodda hardcode qilinmaydi (§8.1).

### 3.4 O'ynamagan o'yinchining RD o'sishi

Har davrda o'ynamagan o'yinchi uchun (§2.11):

```
φ' = sqrt(φ² + σ²)
```

Asl shkalada, `σ = 0.06` va boshlang'ich `RD = 50` bilan misol (taxminiy hisob):

| Davr (oy) | RD |
|---|---|
| 0 | 50.0 |
| 6 | ~62 |
| 12 | ~72 |
| 24 | ~90 |
| 36 | ~105 |
| 60 | ~130 |

O'sish sekin va kvadratik ildiz ostida — ya'ni **sekinlashib boradi**. Bu to'g'ri xatti-harakat:
birinchi yil o'ynamaslik ko'p ma'lumot yo'qotadi, o'ninchi yil oz.

> Yuqoridagi jadval `σ = 0.06` uchun taxminiy hisob — **implementatsiyada real qiymat bilan
> tekshirilishi kerak**. σ o'yinchiga qarab farq qiladi, shuning uchun bu jadval faqat
> tartib (order of magnitude) tasavvuri uchun.

**Yuqori chegara:**

```
RD_max = 350
```

O'ynamagan o'yinchining RD si 350 dan oshmaydi — chunki 350 "hech narsa bilmaymiz" degani
va undan ko'proq bilmaslik mumkin emas. Formula bilan hisoblangan qiymat 350 dan oshsa,
350 ga qisqartiriladi (clamp). Bu §12.4 dagi property test bilan tekshiriladi.

---

## 4. Yangi o'yinchi

### 4.1 Boshlang'ich qiymatlar

```
r = 1500
RD = 350
σ = 0.06
```

Bular Glicko-2 standart qiymatlari. `1500` — shartli o'rta. `350` — maksimal ishonchsizlik.
`0.06` — Glickman tavsiya qilgan boshlang'ich volatility.

### 4.2 Provisional status

Yangi o'yinchining reytingi darhol "rasmiy" bo'lmaydi. Sabab: RD=350 da reyting deyarli
ma'nosiz — 95% ishonch oralig'i `[800, 2200]`.

**Farzin qoidasi:**

```
Reyting "established" (rasmiy) hisoblanadi, agar:
  - kamida 8 ta reytingli o'yin o'ynalgan bo'lsa, VA
  - RD ≤ 110 bo'lsa
```

Ikkala shart ham bajarilishi kerak.

**Nega ikkita shart?**
- **O'yin soni (8)** — sodda, tushunarli, foydalanuvchi hisoblab ko'ra oladi. Bitta turnir
  (7–9 tur) taxminan shu chegarani beradi — ya'ni "bir turnir o'ynasang, reytingga
  kirasan". Bu O'zbekiston turnir formatiga tabiiy mos.
- **RD chegarasi (110)** — statistik himoya. 8 ta o'yinni juda kuchsiz yoki juda kuchli
  raqiblarga qarshi o'ynagan bo'lsa (`E ≈ 0` yoki `E ≈ 1`), ular kam ma'lumot beradi (§2.5),
  RD yetarli tushmaydi va reyting hali ishonchsiz qoladi.

**Nega 110?** RD=110 da 95% oraliq ≈ `±220`. Bu hali keng, lekin turnir seedingi uchun
yetarli aniqlik. **Halol chegara:** bu son kelishuv (convention), statistik hisobdan
chiqarilmagan. Real ma'lumot to'plangandan keyin qayta ko'riladi.

**Provisional reyting bilan nima bo'ladi:**
- UI'da `1487?` shaklida ko'rsatiladi (savol belgisi bilan) — Lichess konvensiyasi.
- Reyting ro'yxatlarida (leaderboard) **ko'rsatilmaydi**.
- Turnir seedingida ishlatiladi, lekin `provisional` bayrog'i bilan — hakam ko'radi.
- Boshqa o'yinchilarning reytingiga **normal ta'sir qiladi** — bu muhim. Glicko-2 da
  provisional o'yinchining yuqori RD si `g(φⱼ)` orqali avtomatik hisobga olinadi (§2.3):
  uning natijasi kamroq og'irlik oladi. Qo'shimcha qoida kerak emas — matematika buni
  o'zi hal qiladi.

### 4.3 Chegaralar (clamping)

Har hisobdan keyin quyidagi chegaralar qo'llanadi:

| Parametr | Min | Max | Sabab |
|---|---|---|---|
| `r` | 100 | — | Manfiy reyting ma'nosiz, UI buziladi |
| `RD` | 30 | 350 | Min: hech qachon "mukammal bilim" bo'lmaydi. Max: "hech narsa bilmaymiz" |
| `σ` | 0.01 | 0.1 | Iterativ hisob patologik holatda chetga chiqmasligi uchun |

**RD minimumi (30) nega kerak?** Juda faol o'yinchining RD si nazariy jihatdan 20 dan
past tushishi mumkin. Bunda reyting deyarli qotib qoladi — o'yinchi haqiqatan kuchaysa
ham tizim javob bermaydi. FIDE ham shunga o'xshash muammoni K-factor minimumi bilan hal
qiladi. 30 — Glicko amaliyotida keng tarqalgan qiymat.

**σ chegaralari** — himoya (defensive). Agar Illinois iteratsiyasi to'g'ri ishlasa, σ bu
oraliqdan chiqmasligi kerak. Chegaraga urilish — **bug belgisi**. Shuning uchun clamp
sodir bo'lsa `WARN` darajasida log yoziladi va metrika oshiriladi (§10.4). Jimgina
tuzatib ketmaydi.

---

## 5. Kategoriyalar

### 5.1 Ro'yxat

Har bir kategoriya uchun **mustaqil** `r`, `RD`, `σ` uchligi saqlanadi. Ular bir-biriga
ta'sir qilmaydi.

| Kategoriya | Vaqt nazorati | Muhit | Davr |
|---|---|---|---|
| `OTB_CLASSICAL` | ≥ 60 min | OTB | Oylik |
| `OTB_RAPID` | 10–60 min | OTB | Oylik |
| `OTB_BLITZ` | 3–10 min | OTB | Oylik |
| `ONLINE_CLASSICAL` | ≥ 30 min | Onlayn | Oylik → kunlik (2-bosqich) |
| `ONLINE_RAPID` | 10–30 min | Onlayn | Oylik → kunlik (2-bosqich) |
| `ONLINE_BLITZ` | 3–10 min | Onlayn | Oylik → kunlik (2-bosqich) |
| `ONLINE_BULLET` | < 3 min | Onlayn | Oylik → kunlik (2-bosqich) |

**OTB_BULLET yo'q** — jonli bullet turniri deyarli o'ynalmaydi va uni ishonchli hakamlik
qilish mumkin emas.

Vaqt nazorati chegaralari FIDE konvensiyasiga yaqin, lekin **aniq mos emas**. FIDE:
klassik ≥ 60 min (base + 60×increment), rapid 10–60, blitz ≤ 10. **Implementatsiyadan
oldin FIDE Handbook (B.02) bilan solishtirilishi kerak** — chegara qiymatlari o'zgargan
bo'lishi mumkin.

Vaqt nazoratini kategoriyaga o'girish formulasi (FIDE yondashuvi):

```
effective_time = base_minutes + (increment_seconds × 60) / 60
              = base_minutes + increment_seconds
```

Ya'ni `90+30` → `90 + 30 = 120` daqiqa → klassik. `3+2` → `3 + 2 = 5` daqiqa → blitz.
Bu FIDE'ning "o'rtacha o'yin 60 yurish" taxminiga asoslangan taxminiy qoida.

### 5.2 Nega onlayn va OTB alohida

Bu hujjatdagi eng muhim mahsulot qarorlaridan biri. Ularni qo'shish **jiddiy xato** bo'lardi.

**1. Chit xavfi mutlaqo boshqa.**
OTB turnirda hakam bor, o'yinchi jismonan o'tiradi, telefon taqiqlangan, ba'zan metall
detektor bor. Chit qilish qiyin va aniqlanganda guvohlar bor.

Onlayn o'yinda o'yinchi uyda, yolg'iz, ikkinchi ekranda Stockfish 17 ochiq bo'lishi mumkin.
`fairplay` moduli buni ehtimollik bilan aniqlaydi (§CANON: "bu ehtimollik, isbot emas"),
lekin **hech qachon 100% emas**.

Agar reytinglar qo'shilsa: onlayn chit qilib olingan reyting rasmiy OTB turnirda seeding
beradi. Bu butun tizimning ishonchini yo'q qiladi. Bir marta shunday holat oshkor bo'lsa,
federatsiya Farzin'dan voz kechadi.

**2. O'ynash sharoiti boshqa.**
Onlayn: sichqoncha tezligi (premove, bullet'da hal qiluvchi), internet lag, diskonnekt,
kichik ekran. OTB: haqiqiy taxta, notatsiya yozish, raqib bilan yuzma-yuz psixologik
bosim, zal shovqini, 5 soatlik jismoniy chidamlilik.

Bular **turli ko'nikmalar**. Onlayn blitz'da 2400 o'yinchi OTB klassikada 1900 bo'lishi
mumkin — va bu ikkalasi ham to'g'ri.

**3. O'yin populyatsiyasi boshqa.**
Onlayn reyting basseynida asosan yosh, faol o'yinchilar. OTB'da — turnirga kelgan,
ro'yxatdan o'tgan, start puli to'lagan o'yinchilar. Ikki basseynning o'rtacha kuchi va
inflyatsiya dinamikasi farq qiladi (§10).

**4. Qaytarib bo'lmaydi.**
Alohida boshlab, keyin qo'shish mumkin. Qo'shib boshlab, keyin ajratish — **mumkin emas**
(tarix aralashib ketgan). Konservativ yo'l — alohida boshlash.

### 5.3 Kategoriyalar orasidagi bog'liqlik

Yo'q. To'liq mustaqil. Yangi kategoriyada o'yinchi `1500 / 350 / 0.06` dan boshlaydi,
garchi u boshqa kategoriyada 2200 bo'lsa ham.

**Alternativ ko'rib chiqildi va rad etildi:** yangi kategoriyani boshqa kategoriya
reytingidan "seed" qilish (masalan, OTB klassika 2200 bo'lsa, OTB rapid'ni 2100/200 dan
boshlash). Rad etish sabablari:
- Korrelyatsiyani bilmaymiz. Uni **o'lchash** kerak, taxmin qilish emas.
- Model murakkablashadi, tushuntirish qiyinlashadi.
- Xato seed uzoq vaqt tuzatilmaydi.

Bu real ma'lumot to'plangandan keyin qayta ko'riladi. Agar OTB klassika va OTB rapid
o'rtasida kuchli korrelyatsiya (r > 0.85) topilsa, seeding qo'shilishi mumkin.

---

## 6. FIDE Elo oynasi (mirror)

### 6.1 Prinsip

```
Farzin FIDE reytingini HISOBLAMAYDI.
Farzin FIDE reytingini SAQLAYDI va KO'RSATADI.
```

FIDE reytingi — tashqi haqiqat. Uning yagona manbai FIDE. Farzin uni o'qish uchun
oynaydi (read-only mirror).

**Nega hisoblamaymiz:**
- FIDE Elo qoidalari murakkab va **o'zgarib turadi** (2024-yilda FIDE reyting polini
  1400 ga ko'tardi va boshqa tuzatishlar kiritdi). Ularni takrorlash — abadiy quvish.
- FIDE turnirlari faqat FIDE ro'yxatidagi hakam tomonidan ro'yxatga olinadi. Farzin bu
  zanjirning qismi emas.
- Bizning hisobimiz FIDE'nikidan farq qilsa — biz aybdormiz. Yutuq yo'q, xavf bor.
- FIDE reytingi rasmiy huquqiy ma'noga ega (unvon, xalqaro turnir kirish huquqi). Uni
  taqlid qilish javobgarlik oladi.

### 6.2 Bog'lanish

`Player` entity'sida:

```
fide_id          VARCHAR(20)  NULL  UNIQUE   -- FIDE ID (masalan "14204118")
fide_verified_at TIMESTAMPTZ  NULL           -- qachon tasdiqlangan
```

FIDE ID — o'yinchining xalqaro identifikatori. Bog'lanish oqimi:

1. O'yinchi profilida FIDE ID kiritadi.
2. Tizim FIDE ro'yxatidan bu ID ni qidiradi.
3. Ism/tug'ilgan yil/federatsiya solishtiriladi (fuzzy match).
4. Mos kelsa — `PENDING` holatida saqlanadi.
5. **Administrator qo'lda tasdiqlaydi** → `fide_verified_at` to'ldiriladi.

**Nega qo'lda tasdiq?** FIDE ID ni o'zlashtirish (impersonation) real xavf. Kimdir
Nodirbek Abdusattorov'ning FIDE ID sini kiritsa va tizim avtomatik tasdiqlasa — bu
jiddiy muammo. Ism mos kelishi yetarli dalil emas (ismdoshlar bor).

Bir FIDE ID faqat bitta `Player` ga bog'lanadi (`UNIQUE` cheklov).

### 6.3 Ma'lumot modeli

FIDE reytingi `Player` da emas, alohida jadvalda saqlanadi — chunki u tarixiy va tashqi:

```
fide_rating_snapshots
─────────────────────
id                UUID v7      PK
player_id         UUID v7      FK → players.id
fide_id           VARCHAR(20)  NOT NULL   -- denormalizatsiya (tarixiy aniqlik uchun)
list_date         DATE         NOT NULL   -- FIDE ro'yxati sanasi (masalan 2026-07-01)
standard_rating   INTEGER      NULL
rapid_rating      INTEGER      NULL
blitz_rating      INTEGER      NULL
standard_games    INTEGER      NULL       -- davrda o'ynalgan o'yin soni
title             VARCHAR(10)  NULL       -- GM, IM, FM, CM, WGM, ...
federation        CHAR(3)      NULL       -- UZB, RUS, ...
birth_year        INTEGER      NULL
imported_at       TIMESTAMPTZ  NOT NULL
created_at        TIMESTAMPTZ  NOT NULL

UNIQUE (fide_id, list_date)
INDEX  (player_id, list_date DESC)
```

`UNIQUE (fide_id, list_date)` — bir ro'yxat sanasida bir FIDE ID uchun bitta yozuv.
Bu import idempotentligini ta'minlaydi (§6.4).

Reytinglar `NULL` bo'lishi mumkin — hamma o'yinchida uchala reyting yo'q.

### 6.4 Sinxronizatsiya

FIDE reyting ro'yxati **oyda bir marta**, odatda oyning 1-sanasida chiqadi. FIDE uni
`ratings.fide.com` da ZIP arxiv sifatida e'lon qiladi (XML va TXT formatlarida).

> **Tekshirilishi kerak:** aniq URL, format va e'lon qilish jadvali implementatsiyadan
> oldin FIDE saytidan tasdiqlanishi kerak. FIDE bu ma'lumotlarni vaqti-vaqti bilan
> o'zgartiradi. Rasmiy API yo'q — faqat fayl yuklab olish.

**Sinxronizatsiya jarayoni (BullMQ job: `fide-sync`):**

```
Jadval: har oyning 2-sanasi, 03:00 Asia/Tashkent (cron: "0 3 2 * *")
```

Nega 2-sana, 1-sana emas? FIDE ro'yxati 1-sanada chiqadi, lekin kechikishi mumkin.
Bir kun bufer.

Bosqichlar:

1. **Download** — ZIP faylni yuklab olish. Muvaffaqiyatsiz bo'lsa — 6 soatlik interval
   bilan 4 marta retry. Baribir bo'lmasa — `admin` ga ogohlantirish.
2. **Checksum** — fayl hash'i oldingi importdagi bilan bir xil bo'lsa, FIDE hali
   yangilamagan. Job to'xtaydi, keyingi retry kutiladi.
3. **Parse** — XML dan yozuvlar. FIDE ro'yxatida ~1 mln yozuv bor (butun dunyo).
   Stream parsing (butun faylni xotiraga yuklamaslik).
4. **Filter** — bizga faqat `federation = 'UZB'` **va** tizimda `fide_id` bog'langan
   o'yinchilar kerak. Ikkinchi shart muhim: boshqa federatsiya o'yinchisi ham bizda
   ro'yxatdan o'tgan bo'lishi mumkin (masalan O'zbekistonda yashovchi chet ellik).
5. **Upsert** — `fide_rating_snapshots` ga. `ON CONFLICT (fide_id, list_date) DO UPDATE`.
   Bu importni **idempotent** qiladi — bir xil faylni ikki marta import qilish xavfsiz.
6. **Title sync** — FIDE unvoni (GM/IM/FM...) o'zgargan bo'lsa, `Title` entity'siga
   yozuv qo'shiladi. Unvon **hech qachon o'chirilmaydi** — FIDE unvoni umrbod.
7. **Notification** — reytingi o'zgargan o'yinchilarga push xabar (`notification` moduli).

**Xato holatlari:**

| Holat | Xatti-harakat |
|---|---|
| FIDE ID ro'yxatdan yo'qolgan | Snapshot yozilmaydi. Eski snapshot qoladi. `WARN` log. O'chirmaymiz — FIDE xatosi bo'lishi mumkin |
| Reyting keskin o'zgargan (>200) | Snapshot yoziladi (FIDE haqiqat), lekin `admin` ga bayroq. Odatda bu parse xatosi |
| Federatsiya o'zgargan | Yoziladi. O'yinchi federatsiyani almashtirgan bo'lishi mumkin — bu normal |
| Fayl format o'zgargan | Job to'xtaydi, hech narsa yozilmaydi, `admin` ga ogohlantirish. **Qisman import qilinmaydi** |

**Muhim:** FIDE sinxronizatsiyasi milliy reytingga **hech qanday ta'sir qilmaydi**. Bu
butunlay alohida kod yo'li, alohida jadval, alohida job. Ular faqat UI'da yonma-yon
ko'rsatiladi.

### 6.5 UI'da ko'rsatish

O'yinchi profilida ikki blok aniq ajratilgan:

```
┌─ Farzin milliy reytingi ────────────┐
│  Klassik   1847  (RD 62)            │
│  Rapid     1792  (RD 78)            │
│  Blitz     1740  (RD 95)            │
│  Onlayn blitz  1688? (RD 145)       │  ← provisional
└─────────────────────────────────────┘

┌─ FIDE (2026-07-01 ro'yxati) ────────┐
│  Standard  1823                     │
│  Rapid     1801                     │
│  Blitz     1776                     │
│  FIDE ID: 14204118 ✓ tasdiqlangan   │
└─────────────────────────────────────┘
```

FIDE blokida **ro'yxat sanasi majburiy** ko'rsatiladi — foydalanuvchi bu ma'lumot
qachonlik ekanini bilishi kerak. "Manba: FIDE" yozuvi ham bo'ladi.

---

## 7. TypeScript implementatsiya

### 7.1 Tiplar

```typescript
// src/modules/rating/types/rating.types.ts

/**
 * Rating category. Online and OTB are strictly separate rating pools.
 * See docs/06-rating-system.md §5.2 for rationale.
 */
export enum RatingCategory {
  OTB_CLASSICAL = 'OTB_CLASSICAL',
  OTB_RAPID = 'OTB_RAPID',
  OTB_BLITZ = 'OTB_BLITZ',
  ONLINE_CLASSICAL = 'ONLINE_CLASSICAL',
  ONLINE_RAPID = 'ONLINE_RAPID',
  ONLINE_BLITZ = 'ONLINE_BLITZ',
  ONLINE_BULLET = 'ONLINE_BULLET',
}

/**
 * A player's rating state on the display scale (r, RD, sigma).
 * Immutable — every computation produces a new snapshot.
 */
export interface RatingSnapshot {
  /** Rating on the display scale, typically 100..3000 */
  readonly rating: number;
  /** Rating deviation on the display scale, clamped to [30, 350] */
  readonly ratingDeviation: number;
  /** Volatility, clamped to [0.01, 0.1] */
  readonly volatility: number;
  /** Total rated games played in this category, all time */
  readonly gamesPlayed: number;
}

/** Result of a single game from the perspective of the player being rated. */
export interface MatchOutcome {
  /** Opponent's rating state at the START of the rating period */
  readonly opponent: Pick<RatingSnapshot, 'rating' | 'ratingDeviation'>;
  /** 1 = win, 0.5 = draw, 0 = loss */
  readonly score: 1 | 0.5 | 0;
}

/** Output of computing one rating period for one player. */
export interface RatingPeriodResult {
  readonly before: RatingSnapshot;
  readonly after: RatingSnapshot;
  /** Number of rated games in this period. 0 means RD-decay only. */
  readonly gamesInPeriod: number;
  /** Iterations the volatility solver took. Exposed for monitoring. */
  readonly volatilityIterations: number;
  /** True if any value hit a clamp boundary — indicates a possible bug. */
  readonly clamped: boolean;
}

/** System constants. Persisted per RatingPeriod so recomputation is exact. */
export interface Glicko2Config {
  /** System constant tau. Farzin default: 0.5. See §2.13 */
  readonly tau: number;
  /** Convergence threshold for the volatility solver. Default: 0.000001 */
  readonly epsilon: number;
}
```

### 7.2 Konstantalar

```typescript
// src/modules/rating/glicko2.constants.ts

/** 400 / ln(10) — converts between the display scale and the Glicko-2 scale. */
export const GLICKO2_SCALE = 173.7178;

/** Rating anchor for the scale conversion. */
export const RATING_ANCHOR = 1500;

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;

/** Farzin system constant. See §2.13 for the rationale and the review plan. */
export const DEFAULT_TAU = 0.5;

/** Convergence threshold for the Illinois solver. From Glickman (2012). */
export const CONVERGENCE_EPSILON = 0.000001;

/** Clamps. See §4.3. Hitting these should be rare — it is logged as WARN. */
export const MIN_RATING = 100;
export const MIN_RD = 30;
export const MAX_RD = 350;
export const MIN_VOLATILITY = 0.01;
export const MAX_VOLATILITY = 0.1;

/** Safety bound for the bracket-expansion loop. Never hit in practice. */
export const MAX_BRACKET_ITERATIONS = 100;

/** Safety bound for the Illinois loop. Typically converges in 2-5. */
export const MAX_SOLVER_ITERATIONS = 1000;

/** Established-rating thresholds. See §4.2. */
export const ESTABLISHED_MIN_GAMES = 8;
export const ESTABLISHED_MAX_RD = 110;
```

### 7.3 Volatility solver (to'liq kod)

Bu modulning eng qiyin funksiyasi. To'liq yozilgan — TODO yo'q.

```typescript
// src/modules/rating/glicko2.solver.ts

import {
  CONVERGENCE_EPSILON,
  MAX_BRACKET_ITERATIONS,
  MAX_SOLVER_ITERATIONS,
} from './glicko2.constants';

export class VolatilityConvergenceError extends Error {
  constructor(message: string, readonly context: Record<string, number>) {
    super(message);
    this.name = 'VolatilityConvergenceError';
  }
}

export interface VolatilityResult {
  readonly sigma: number;
  readonly iterations: number;
}

/**
 * Solves for the new volatility sigma' using the Illinois algorithm
 * (a bracketed regula falsi variant with a stalling correction).
 *
 * Implements Step 5 of Glickman (2012), "Example of the Glicko-2 system".
 *
 * The equation f(x) = 0 is solved in x = ln(sigma'^2) rather than sigma'
 * directly. This guarantees sigma' > 0 for any x and makes f well-behaved.
 *
 * f is continuous and monotonically decreasing, so the root is unique and
 * a bracketing method is guaranteed to converge.
 *
 * @param phi   Player's RD on the Glicko-2 scale (period start)
 * @param v     Estimated variance (Step 3)
 * @param delta Estimated improvement (Step 4)
 * @param sigma Player's volatility on period start
 * @param tau   System constant
 */
export function solveVolatility(
  phi: number,
  v: number,
  delta: number,
  sigma: number,
  tau: number,
  epsilon: number = CONVERGENCE_EPSILON,
): VolatilityResult {
  const a = Math.log(sigma * sigma);
  const deltaSq = delta * delta;
  const phiSq = phi * phi;
  const tauSq = tau * tau;

  /**
   * f(x) = [e^x (delta^2 - phi^2 - v - e^x)] / [2 (phi^2 + v + e^x)^2]
   *        - (x - a) / tau^2
   */
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const denomBase = phiSq + v + ex;
    const numerator = ex * (deltaSq - phiSq - v - ex);
    const denominator = 2 * denomBase * denomBase;
    return numerator / denominator - (x - a) / tauSq;
  };

  // --- Step 5.2: establish an initial bracket [A, B] containing the root ---
  let A = a;
  let B: number;

  if (deltaSq > phiSq + v) {
    // The player performed far from expectation: the root lies to the right
    // of a, and ln(delta^2 - phi^2 - v) is a valid upper bound.
    B = Math.log(deltaSq - phiSq - v);
  } else {
    // The root lies to the left of a. Walk left in steps of tau until f
    // turns non-negative, which brackets the root.
    let k = 1;
    while (f(a - k * tau) < 0) {
      k += 1;
      if (k > MAX_BRACKET_ITERATIONS) {
        throw new VolatilityConvergenceError(
          'Failed to bracket the volatility root',
          { phi, v, delta, sigma, tau },
        );
      }
    }
    B = a - k * tau;
  }

  // --- Step 5.3-5.5: Illinois iteration ---
  let fA = f(A);
  let fB = f(B);
  let iterations = 0;

  while (Math.abs(B - A) > epsilon) {
    if (iterations > MAX_SOLVER_ITERATIONS) {
      throw new VolatilityConvergenceError(
        'Volatility solver exceeded the iteration limit',
        { phi, v, delta, sigma, tau, A, B },
      );
    }

    // Regula falsi: the secant line through (A, fA) and (B, fB) crosses zero.
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);

    if (fC * fB <= 0) {
      // The root is between C and B: move A up to B.
      A = B;
      fA = fB;
    } else {
      // A is retained. Halve fA so the same endpoint cannot stall the
      // iteration — this is the Illinois correction.
      fA = fA / 2;
    }

    B = C;
    fB = fC;
    iterations += 1;
  }

  // Step 5.6: sigma' = e^(A/2)
  return { sigma: Math.exp(A / 2), iterations };
}
```

**Kodning nozik joylari (code review'da alohida tekshiriladi):**

1. `fC * fB <= 0` — `<` emas, `<=`. Nol holatini to'g'ri ushlash uchun.
2. `fA = fA / 2` — **faqat** `else` shoxida. Buni ikkala shoxga qo'yish tez-tez
   uchraydigan xato va u konvergensiyani buzadi.
3. `C = A + (A − B) · fA / (fB − fA)` — ishoralarga diqqat. `(A − B)` va `(fB − fA)`
   tartibini almashtirsangiz, formula noto'g'ri tomonga siljiydi.
4. `return Math.exp(A / 2)` — `A` dan, `B` yoki `C` dan emas.
5. `f(x)` da `deltaSq − phiSq − v − ex` — ayirmalar tartibi muhim.
6. Bracket'ning `else` shoxidagi `while` sharti `f(a − k·τ) < 0` — `>` emas.

### 7.4 Glicko2Service

```typescript
// src/modules/rating/glicko2.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { solveVolatility } from './glicko2.solver';
import {
  GLICKO2_SCALE, RATING_ANCHOR, DEFAULT_TAU, CONVERGENCE_EPSILON,
  MIN_RATING, MIN_RD, MAX_RD, MIN_VOLATILITY, MAX_VOLATILITY,
  ESTABLISHED_MIN_GAMES, ESTABLISHED_MAX_RD,
} from './glicko2.constants';
import type {
  RatingSnapshot, MatchOutcome, RatingPeriodResult, Glicko2Config,
} from './types/rating.types';

/**
 * Pure Glicko-2 implementation. No I/O, no database, no dependencies.
 * Deterministic: the same input always produces the same output.
 *
 * This purity is what makes recomputation (§9) safe and testable.
 *
 * Reference: Glickman, M. (2012), "Example of the Glicko-2 system".
 */
@Injectable()
export class Glicko2Service {
  private readonly logger = new Logger(Glicko2Service.name);

  /** Step 3 helper: g(phi) = 1 / sqrt(1 + 3 phi^2 / pi^2) */
  private g(phi: number): number {
    return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
  }

  /** Step 3 helper: E(mu, muJ, phiJ) = 1 / (1 + exp(-g(phiJ)(mu - muJ))) */
  private E(mu: number, muJ: number, phiJ: number): number {
    return 1 / (1 + Math.exp(-this.g(phiJ) * (mu - muJ)));
  }

  private toGlicko2Scale(rating: number, rd: number): { mu: number; phi: number } {
    return {
      mu: (rating - RATING_ANCHOR) / GLICKO2_SCALE,
      phi: rd / GLICKO2_SCALE,
    };
  }

  private toDisplayScale(mu: number, phi: number): { rating: number; rd: number } {
    return {
      rating: GLICKO2_SCALE * mu + RATING_ANCHOR,
      rd: GLICKO2_SCALE * phi,
    };
  }

  /**
   * Computes one rating period for one player.
   *
   * IMPORTANT: every opponent snapshot in `outcomes` must be that opponent's
   * state at the START of the period, never a mid-period value. Enforcing this
   * is the caller's job (RatingPeriodProcessor) — see §3.2.
   */
  computePeriod(
    current: RatingSnapshot,
    outcomes: readonly MatchOutcome[],
    config: Glicko2Config = { tau: DEFAULT_TAU, epsilon: CONVERGENCE_EPSILON },
  ): RatingPeriodResult {
    if (outcomes.length === 0) {
      return this.computeInactivePeriod(current);
    }

    // Step 2: convert to the Glicko-2 scale
    const { mu, phi } = this.toGlicko2Scale(current.rating, current.ratingDeviation);

    const opponents = outcomes.map((o) => {
      const scaled = this.toGlicko2Scale(o.opponent.rating, o.opponent.ratingDeviation);
      return { mu: scaled.mu, phi: scaled.phi, score: o.score as number };
    });

    // Step 3: estimated variance v
    let invV = 0;
    for (const opp of opponents) {
      const gPhi = this.g(opp.phi);
      const e = this.E(mu, opp.mu, opp.phi);
      invV += gPhi * gPhi * e * (1 - e);
    }
    const v = 1 / invV;

    // Step 4: estimated improvement delta (via the shared sum S)
    let S = 0;
    for (const opp of opponents) {
      S += this.g(opp.phi) * (opp.score - this.E(mu, opp.mu, opp.phi));
    }
    const delta = v * S;

    // Step 5: new volatility (iterative — see glicko2.solver.ts)
    const { sigma: sigmaPrime, iterations } = solveVolatility(
      phi, v, delta, current.volatility, config.tau, config.epsilon,
    );

    // Step 6: pre-rating-period value phi*
    const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

    // Step 7: new phi'
    const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

    // Step 7 (cont.): new mu'. NOTE: uses S, not delta. See §2.10.
    const muPrime = mu + phiPrime * phiPrime * S;

    // Step 8: back to the display scale
    const { rating, rd } = this.toDisplayScale(muPrime, phiPrime);

    return this.buildResult(current, rating, rd, sigmaPrime, outcomes.length, iterations);
  }

  /**
   * A player who played no rated games this period.
   * Rating is unchanged; RD grows; volatility is unchanged. See §2.11.
   */
  private computeInactivePeriod(current: RatingSnapshot): RatingPeriodResult {
    const { phi } = this.toGlicko2Scale(current.rating, current.ratingDeviation);
    const phiPrime = Math.sqrt(phi * phi + current.volatility * current.volatility);
    const { rd } = this.toDisplayScale(0, phiPrime);

    return this.buildResult(
      current, current.rating, rd, current.volatility, 0, 0,
    );
  }

  /** Applies clamps, logs boundary hits, and assembles the result. */
  private buildResult(
    before: RatingSnapshot,
    rating: number,
    rd: number,
    volatility: number,
    gamesInPeriod: number,
    volatilityIterations: number,
  ): RatingPeriodResult {
    const clampedRating = Math.max(MIN_RATING, rating);
    const clampedRd = Math.min(MAX_RD, Math.max(MIN_RD, rd));
    const clampedVol = Math.min(MAX_VOLATILITY, Math.max(MIN_VOLATILITY, volatility));

    const clamped =
      clampedRating !== rating || clampedRd !== rd || clampedVol !== volatility;

    if (clamped) {
      // Hitting a clamp is expected for RD (new/inactive players) but a
      // volatility clamp usually means the solver misbehaved. See §4.3.
      this.logger.warn({
        msg: 'Glicko-2 result hit a clamp boundary',
        raw: { rating, rd, volatility },
        clamped: { rating: clampedRating, rd: clampedRd, volatility: clampedVol },
      });
    }

    return {
      before,
      after: {
        rating: clampedRating,
        ratingDeviation: clampedRd,
        volatility: clampedVol,
        gamesPlayed: before.gamesPlayed + gamesInPeriod,
      },
      gamesInPeriod,
      volatilityIterations,
      clamped,
    };
  }

  /** See §4.2. Both conditions must hold. */
  isEstablished(snapshot: RatingSnapshot): boolean {
    return (
      snapshot.gamesPlayed >= ESTABLISHED_MIN_GAMES &&
      snapshot.ratingDeviation <= ESTABLISHED_MAX_RD
    );
  }
}
```

> **Diqqat:** `computeInactivePeriod` da `toDisplayScale(0, phiPrime)` chaqirilgan va
> faqat `rd` olingan — `mu` argumenti (0) ishlatilmaydi, chunki reyting o'zgarmaydi.
> Bu biroz noqulay, lekin konvertatsiya mantig'ini bitta joyda saqlaydi.

---

## 8. Ma'lumot modeli

### 8.1 RatingPeriod

Bir kategoriya uchun bir hisoblash oynasi.

```
rating_periods
──────────────
id             UUID v7      PK
category       VARCHAR(20)  NOT NULL   -- RatingCategory enum
starts_at      TIMESTAMPTZ  NOT NULL
ends_at        TIMESTAMPTZ  NOT NULL
status         VARCHAR(20)  NOT NULL   -- OPEN | COMPUTING | CLOSED | RECOMPUTING
tau            NUMERIC(4,3) NOT NULL   -- bu davrda ishlatilgan tau
epsilon        NUMERIC(12,10) NOT NULL -- konvergensiya chegarasi
computed_at    TIMESTAMPTZ  NULL
player_count   INTEGER      NULL       -- hisoblangan o'yinchi soni
game_count     INTEGER      NULL       -- hisobga olingan o'yin soni
recompute_of   UUID v7      NULL FK → rating_periods.id
created_at     TIMESTAMPTZ  NOT NULL
updated_at     TIMESTAMPTZ  NOT NULL

UNIQUE (category, starts_at)
INDEX  (category, status)
INDEX  (category, ends_at DESC)
```

**Nega `tau` va `epsilon` saqlanadi?** Ular vaqt o'tishi bilan o'zgarishi mumkin (§2.13).
Agar davr qayta hisoblansa, **o'sha davrdagi** konstantalar bilan hisoblanishi kerak,
hozirgi qiymatlar bilan emas. Aks holda qayta hisoblash boshqa natija berardi va
"idempotent" da'vosi yolg'on bo'lardi.

`status` oqimi:

```
OPEN → COMPUTING → CLOSED
                     ↓
                RECOMPUTING → CLOSED
```

- `OPEN` — davr davom etmoqda, natijalar qabul qilinmoqda.
- `COMPUTING` — job ishlayapti. Bu holatda yangi natija qabul qilinmaydi.
- `CLOSED` — hisoblangan, `RatingHistory` yozuvlari yaratilgan.
- `RECOMPUTING` — qayta hisoblanmoqda (§9).

### 8.2 RatingHistory

**Immutable** append-only jurnal. Har bir o'yinchi × kategoriya × davr uchun bitta yozuv.

```
rating_histories
────────────────
id                 UUID v7      PK
player_id          UUID v7      NOT NULL FK → players.id
rating_period_id   UUID v7      NOT NULL FK → rating_periods.id
category           VARCHAR(20)  NOT NULL

rating_before      NUMERIC(7,2) NOT NULL
rd_before          NUMERIC(6,2) NOT NULL
volatility_before  NUMERIC(8,6) NOT NULL

rating_after       NUMERIC(7,2) NOT NULL
rd_after           NUMERIC(6,2) NOT NULL
volatility_after   NUMERIC(8,6) NOT NULL

games_in_period    INTEGER      NOT NULL
game_result_ids    UUID[]       NOT NULL   -- qaysi o'yinlar hisobga olindi
opponent_snapshot  JSONB        NOT NULL   -- raqiblar holati (davr boshida)

is_established     BOOLEAN      NOT NULL
solver_iterations  SMALLINT     NOT NULL
was_clamped        BOOLEAN      NOT NULL
superseded_by      UUID v7      NULL FK → rating_histories.id

created_at         TIMESTAMPTZ  NOT NULL

UNIQUE (player_id, rating_period_id) WHERE superseded_by IS NULL
INDEX  (player_id, category, created_at DESC)
INDEX  (rating_period_id)
```

**Diqqat:** `UPDATE` yo'q. `DELETE` yo'q. Faqat `INSERT`. Yagona istisno — `superseded_by`
ustunini to'ldirish (qayta hisoblashda, §9).

`NUMERIC` ishlatilgan, `FLOAT` emas — CANON §6 qoidasi. Reyting pul emas, lekin bir
xil prinsip: float yaxlitlash xatosi vaqt o'tishi bilan to'planadi va "reytingim 1846.99
edi, endi 1846.98" kabi tushuntirib bo'lmaydigan holatlar chiqadi.

### 8.3 Nega immutable

**1. "Reytingim nega tushdi?" savoli.**
Bu eng ko'p beriladigan savol bo'ladi. Immutable tarix bilan javob **aniq**:

> "2026-mart davrida siz 4 o'yin o'ynadingiz: Aliyev (1720, RD 45) — yutdingiz,
> Karimov (1890, RD 38) — yutqazdingiz, Toshev (1650, RD 120) — durrang,
> Rahimov (1580, RD 60) — yutqazdingiz. Reyting 1812 → 1794 (−18)."

Har bir raqamni ko'rsatib bera olamiz, chunki `opponent_snapshot` da raqiblarning
o'sha paytdagi holati muzlatilgan. Agar biz faqat joriy reytingni saqlaganimizda,
bu savolga javob bera olmas edik — raqiblarning reytingi ham o'zgargan bo'lardi.

**2. Audit.**
Milliy reyting rasmiy ma'noga ega: turnir seedingi, unvon berish, terma jamoa tanlovi.
Nizo chiqsa (va chiqadi — bu sport), biz har bir raqamni isbotlashimiz kerak. Mutable
tarix — isbotsiz da'vo.

**3. Qayta hisoblash to'g'riligini tekshirish.**
Qayta hisoblashdan keyin eski va yangi yozuvlarni **yonma-yon** solishtira olamiz.
Nima o'zgardi, nima o'zgarmadi — aniq ko'rinadi. Eski yozuvni o'chirsak, taqqoslash
imkoniyati yo'qoladi.

**4. Grafik.**
"Reyting tarixi" grafigi — mahsulotning eng ko'p ishlatiladigan ekranlaridan biri
bo'ladi. U to'g'ridan-to'g'ri `rating_histories` dan o'qiladi, hech qanday qayta
hisoblash kerak emas.

**Narxi:** jadval o'sadi. Taxminiy hisob: 100k o'yinchi × 7 kategoriya × 12 davr/yil
= ~8.4 mln yozuv/yil. Bu PostgreSQL 17 uchun jiddiy emas. Kerak bo'lsa `created_at`
bo'yicha partitioning qo'shiladi (yillik partition).

### 8.4 Joriy reyting qayerda

`RatingHistory` — tarix. Joriy holatni har safar undan o'qish sekin (oxirgi yozuvni
topish uchun index scan). Shuning uchun denormalizatsiya:

```
player_ratings
──────────────
player_id          UUID v7      NOT NULL FK → players.id
category           VARCHAR(20)  NOT NULL
rating             NUMERIC(7,2) NOT NULL
rd                 NUMERIC(6,2) NOT NULL
volatility         NUMERIC(8,6) NOT NULL
games_played       INTEGER      NOT NULL
is_established     BOOLEAN      NOT NULL
last_period_id     UUID v7      NULL FK → rating_periods.id
last_game_at       TIMESTAMPTZ  NULL
updated_at         TIMESTAMPTZ  NOT NULL

PRIMARY KEY (player_id, category)
INDEX (category, rating DESC) WHERE is_established = true   -- leaderboard
```

Bu **cache**, haqiqat manbai emas. U har doim `rating_histories` dan qayta qurilishi
mumkin. Ikkisi bir tranzaksiyada yangilanadi.

Leaderboard index'i `WHERE is_established = true` bilan qisman (partial) — chunki
provisional o'yinchilar leaderboard'da ko'rsatilmaydi (§4.2).

---

## 9. Qayta hisoblash (recompute)

### 9.1 Nega kerak

Natija xato kiritiladi. Bu **muqarrar**:
- Hakam natijani teskari kiritdi (oq yutdi deb yozdi, aslida qora).
- Apellyatsiya qanoatlantirildi (`arbiter` moduli) — natija o'zgardi.
- Chit aniqlandi (`fairplay` moduli) — o'yin bekor qilindi.
- O'yinchi noto'g'ri identifikatsiya qilindi (ismdosh).
- Turnir bekor qilindi.

Reyting rasmiy hujjat bo'lgani uchun "e, mayli, o'tib ketdi" degan javob yo'q. Tuzatish kerak.

### 9.2 Zanjirli ta'sir

Bu qismning eng muhim tushunchasi: **bir natijaning o'zgarishi bitta o'yinchining bitta
davrini emas, ko'p narsani o'zgartiradi.**

Misol. 2026-mart davrida A va B o'ynadi, natija xato kiritilgan.

```
Mart davri:
  A ning reytingi o'zgaradi (to'g'ri natija bilan qayta hisob)
  B ning reytingi o'zgaradi
    ↓
Aprel davri:
  A va B ning mart oxiridagi reytingi boshqacha
    → aprelda A bilan o'ynagan HAMMA o'yinchining hisobi o'zgaradi
    → aprelda B bilan o'ynagan HAMMA o'yinchining hisobi o'zgaradi
    ↓
May davri:
  Yuqoridagilar bilan o'ynaganlarning hisobi o'zgaradi
    ↓
  ... va hokazo, bugungi kungacha
```

Bu **epidemiya**. Har davrda ta'sirlangan o'yinchilar soni o'sadi.

**Amaliy qaror:** ta'sirlangan o'yinchilar to'plamini aniqlashga urinmaymiz. Buning o'rniga
xato topilgan davrdan boshlab **barcha davrlarni, barcha o'yinchilar uchun** qayta
hisoblaymiz. Sabab:

- To'plamni aniqlash algoritmi murakkab (graf yopilishi) va xato qilish oson. Bitta
  o'yinchini o'tkazib yuborsak — jimgina noto'g'ri reyting.
- Hamma uchun hisoblash **sodda va aniq**. O'ynamagan o'yinchi uchun bu shunchaki
  RD o'sishi (§2.11) — arzon operatsiya.
- Hisoblash tez: 100k o'yinchi × 12 davr — bu bir necha daqiqa (§9.6).

Soddalik ustunlik qiladi.

### 9.3 Idempotentlik

```
Bir xil kirish → bir xil chiqish. Har doim.
```

Bu quyidagilar bilan ta'minlanadi:

1. **`Glicko2Service` toza (pure).** I/O yo'q, tasodifiylik yo'q, vaqt yo'q, global
   holat yo'q. Faqat argumentlar.
2. **`tau` va `epsilon` davrda saqlangan** (§8.1). Konstanta o'zgarsa ham eski davr
   eski konstanta bilan hisoblanadi.
3. **O'yinlar tartibi ahamiyatsiz** (§3.2). Batch hisoblash buni kafolatlaydi.
   Bu §12.3 da test qilinadi.
4. **Suzuvchi nuqta determinizmi.** IEEE 754 double, bir xil operatsiyalar tartibi →
   bir xil natija. Yig'indi tartibi `game_result_id` bo'yicha sortlanadi — DB qaytarish
   tartibiga tayanmaslik uchun. Bu nozik nuqta: `ORDER BY` siz PostgreSQL tartibni
   kafolatlamaydi va float qo'shish assotsiativ emas.

Natijada: qayta hisoblashni **istalgan marta** ishga tushirish xavfsiz. Agar hech narsa
o'zgarmagan bo'lsa, natija bir xil bo'ladi.

### 9.4 Jarayon (BullMQ job: `rating-recompute`)

```typescript
// src/modules/rating/jobs/rating-recompute.job.ts

export interface RatingRecomputeJobData {
  /** Recompute this period and every later one. */
  readonly fromPeriodId: string;
  readonly category: RatingCategory;
  /** Audit: why. Free text from the admin. */
  readonly reason: string;
  /** Audit: who triggered it. */
  readonly triggeredBy: string;
  /** If true, compute and report the diff but do not write. */
  readonly dryRun: boolean;
}
```

Bosqichlar:

1. **Lock.** Kategoriya uchun Redis lock olinadi. Bir kategoriya uchun bir vaqtda faqat
   bitta hisoblash (oddiy yoki qayta) ishlaydi. Lock olinmasa — job kutadi.
2. **Davrlar ro'yxati.** `fromPeriodId` dan boshlab, `starts_at` bo'yicha o'sish
   tartibida barcha `CLOSED` davrlar.
3. **Har bir davr uchun, ketma-ket:**
   - `status = RECOMPUTING`.
   - Davr boshidagi snapshot: oldingi davrning `rating_after` qiymatlari. Birinchi
     davr uchun — undan oldingi `CLOSED` davr yoki boshlang'ich qiymatlar.
   - Davrdagi `GameResult` lar o'qiladi (joriy, tuzatilgan holat).
   - `Glicko2Service.computePeriod` har bir o'yinchi uchun.
   - **Dry run bo'lsa:** natija xotirada, farq hisoblanadi, DB'ga yozilmaydi.
   - **Aks holda:** yangi `RatingHistory` yozuvlari `INSERT`. Eski yozuvlarga
     `superseded_by = <yangi yozuv id>` qo'yiladi. **Eski yozuv o'chirilmaydi.**
   - `status = CLOSED`, `recompute_of` to'ldiriladi.
4. **`player_ratings` cache** oxirgi davr natijasidan qayta quriladi.
5. **`AuditLog`** yozuvi: kim, qachon, nega, nechta o'yinchi ta'sirlandi, eng katta o'zgarish.
6. **Notification:** reytingi `≥ 5` ball o'zgargan o'yinchilarga xabar. Xabarda **sabab**
   ko'rsatiladi ("2026-mart turniridagi natija tuzatildi").

**Nega ketma-ket, parallel emas?** Har davr oldingisining natijasiga bog'liq. Parallellik
faqat **davr ichida** mumkin (o'yinchilar bir-biridan mustaqil, chunki hammasi davr
boshidagi snapshot'ga qaraydi).

**Nega `dryRun` bor?** Katta qayta hisoblashni ko'r-ko'rona ishga tushirish xavfli.
Administrator avval `dryRun: true` bilan ishga tushirib, farqni ko'radi ("1240 o'yinchi
ta'sirlandi, eng katta o'zgarish −34 ball"), keyin qaror qiladi.

### 9.5 Kim ishga tushiradi

Avtomatik **emas**. Faqat administrator, `admin` moduli orqali, sabab ko'rsatib.

**Nega qo'lda?** Qayta hisoblash minglab o'yinchining rasmiy reytingini o'zgartiradi.
Bu avtomatik sodir bo'lmasligi kerak. Inson qarori va javobgarligi kerak.

`arbiter` moduli natijani tuzatganda **avtomatik ravishda qayta hisoblash taklifi**
yaratadi (`RecomputeProposal`), lekin uni ishga tushirmaydi. Administrator ko'radi,
dry-run qiladi, tasdiqlaydi.

### 9.6 Ishlash (performance)

Taxminiy hisob (**real ma'lumot bilan tekshirilishi kerak**):

- 100k o'yinchi × 12 davr = 1.2 mln `computePeriod` chaqiruvi.
- Har chaqiruv: ~5–20 µs (asosan volatility solver, 2–5 iteratsiya).
- Sof hisoblash: ~10–25 soniya.
- DB yozish: 1.2 mln `INSERT` — batch (`COPY` yoki 1000 lik `INSERT`) bilan ~2–5 daqiqa.

Ya'ni **DB yozish bo'yicha cheklangan (I/O bound), hisoblash bo'yicha emas**. Bu yaxshi —
optimizatsiya kerak bo'lsa qayerga qarashni bilamiz.

Job `rating` navbatida, past prioritet bilan ishlaydi — oddiy davr hisoblashni bloklamaydi.

---

## 10. Reyting inflyatsiyasi / deflyatsiyasi

### 10.1 Muammo

Reyting tizimi **yopiq** emas: o'yinchilar kiradi (1500 dan) va chiqadi (o'ynashni
to'xtatadi). Bu o'rtacha reytingni siljitadi.

**Deflyatsiya mexanizmi:**
Yangi o'yinchi 1500 dan boshlaydi. Agar u haqiqatda zaif bo'lsa (masalan 1200 darajasida),
u o'ynab reyting **yo'qotadi**. Bu ballar tizimga **kirdi** va boshqa o'yinchilarga
tarqaldi... yo'q, aslida yo'q. U 1500 dan boshladi, 1200 ga tushdi — 300 ball "yaratildi"
va boshqalarga berildi. Bu **inflyatsiya**.

**Aksincha:**
Kuchli o'yinchi 1500 dan boshlab 2200 ga ko'tariladi — u 700 ball boshqalardan **oldi**.
Keyin u o'ynashni to'xtatadi va 2200 bilan ketadi. Bu 700 ball tizimdan **chiqib ketdi** —
**deflyatsiya**.

O'zbekistonda **ikkinchi ssenariy kuchliroq kutiladi**: maktab dasturi tufayli ko'p
yosh o'yinchi kiradi (zaif, keyin kuchayadi), kuchlilar esa xalqaro turnirlarga o'tadi.
Bu murakkab dinamika va uni **oldindan aytib bo'lmaydi** — faqat kuzatish mumkin.

### 10.2 Farzin pozitsiyasi

**Biz inflyatsiyani sun'iy ravishda tuzatmaymiz.** Hech qanday "rating floor", "bonus
points", "decay" mexanizmi yo'q — hech bo'lmaganda birinchi bosqichda.

**Sabab:** tuzatish mexanizmi (masalan FIDE'ning 2024-yildagi 1400 poli) o'zi buzuvchi
ta'sir qiladi va uni to'g'ri sozlash uchun **ma'lumot kerak**. Bizda ma'lumot yo'q.
Ma'lumotsiz tuzatish — taxmin ustiga taxmin.

**Buning o'rniga: kuzatamiz.** Agar 12–24 oy ichida aniq trend ko'rinsa, unda qaror
qilamiz. Bu qaror ADR sifatida hujjatlashtiriladi.

**Halol chegara:** bu "hozircha hech narsa qilmaymiz" degani. Bu yetarli javob emas,
lekin ma'lumotsiz qilingan tuzatishdan yaxshiroq.

### 10.3 Monitoring metrikalari

Har davr yopilgandan keyin hisoblanadi va Prometheus'ga eksport qilinadi (CANON §4:
OpenTelemetry + Prometheus + Grafana):

**Populyatsiya salomatligi (har kategoriya uchun):**

| Metrika | Prometheus nomi | Nima ko'rsatadi |
|---|---|---|
| O'rtacha reyting (established) | `farzin_rating_mean` | Asosiy inflyatsiya signali |
| Median reyting | `farzin_rating_median` | O'rtachadan barqarorroq |
| P10 / P90 | `farzin_rating_p10`, `_p90` | Taqsimot kengayishi/torayishi |
| Standart og'ish | `farzin_rating_stddev` | Taqsimot shakli |
| Faol o'yinchi soni | `farzin_rating_active_players` | Populyatsiya hajmi |
| O'rtacha RD | `farzin_rating_mean_rd` | Tizim qanchalik "ishonchli" |
| O'rtacha volatility | `farzin_rating_mean_volatility` | τ to'g'ri sozlanganmi |
| Yangi o'yinchi soni | `farzin_rating_new_players` | Kirish oqimi |
| Established ulushi | `farzin_rating_established_ratio` | Provisional qoidasi ishlayaptimi |

**Muhim:** o'rtacha faqat **established** o'yinchilar bo'yicha hisoblanadi. Provisional
o'yinchilar (hammasi 1500 atrofida) o'rtachani sun'iy ravishda 1500 ga tortadi va
signalni buzadi.

**Model sifati (prediktiv aniqlik):**

| Metrika | Nima ko'rsatadi |
|---|---|
| Brier score | `mean((E − s)²)` — kutilgan natija qanchalik to'g'ri bashorat qilingan. Past = yaxshi |
| Log-loss | `−mean(s·ln(E) + (1−s)·ln(1−E))` — xuddi shu, xatolarni qattiqroq jazolaydi |
| Kalibrlash | E ni 10 ta binga bo'lib, har binda kutilgan va haqiqiy natijani solishtirish |

Bu metrikalar **τ ni tanlashda hal qiluvchi** (§2.13). Ular reyting tizimi haqiqatda
ishlayotganini ko'rsatadigan yagona obyektiv o'lchov.

Kalibrlash grafigi ideal holda diagonal chiziq bo'lishi kerak: `E = 0.7` bo'lgan
o'yinlarning ~70% i yutuq bilan tugagan bo'lsin.

### 10.4 Operatsion alertlar

| Alert | Shart | Daraja |
|---|---|---|
| O'rtacha reyting siljishi | 12 oyda `|Δmean| > 50` | `WARN` |
| Volatility clamp | Bir davrda `> 0.1%` o'yinchi clamp'ga urildi | `WARN` |
| Solver iteratsiyasi | O'rtacha `> 20` yoki maksimal `> 100` | `WARN` |
| Solver xatosi | `VolatilityConvergenceError` bir marta ham | `ERROR` |
| Davr hisoblanmadi | `ends_at + 6h` da hali `CLOSED` emas | `CRITICAL` |
| Brier score yomonlashuvi | 3 davr ketma-ket o'sish | `WARN` |
| RD max'ga urilish | Established o'yinchida `RD = 350` | `ERROR` (bug belgisi) |

---

## 11. Anti-abuse

> Bu bo'lim `fairplay` moduli bilan chambarchas bog'liq. Bu yerda **reytingga xos**
> hujum vektorlari yoritiladi. Engine chit (Stockfish yordami) `fairplay` hujjatida.

> **CANON §7.5 qoidasi shu yerda ham amal qiladi: bularning hammasi ehtimollik, isbot
> emas.** Hech bir signal yolg'iz o'zi ayblov uchun asos bo'lmaydi. Ular tekshiruv
> ochish uchun.

### 11.1 Rating farming

**Sxema:** kuchli o'yinchi ataylab ko'p zaif raqib bilan o'ynab reyting to'playdi.

**Nega Glicko-2 da bu kam samarali:** zaif raqibni yutish `E ≈ 1` beradi, ya'ni
`(s − E) ≈ 0` (§2.6). Reyting deyarli o'zgarmaydi. Yutqazish esa katta zarar. Ya'ni
**matematika o'zi himoya qiladi** — bu Glicko-2 ning kuchli tomoni.

Lekin `E` hech qachon aniq 1 emas. 500 ball farq bilan `E ≈ 0.95`. Har o'yin ~kichik
musbat qo'shadi. 200 ta shunday o'yin — sezilarli.

**Signallar:**

| Signal | Chegara (taxminiy) |
|---|---|
| Raqiblarning o'rtacha reyting farqi | `mean(r − rⱼ) > 300` va `n > 20` |
| Raqiblar xilma-xilligi | Unique raqib / jami o'yin `< 0.3` |
| Kutilgan ochko | `mean(E) > 0.9` va `n > 20` |
| Raqiblarning RD si | `mean(RDⱼ) > 250` (hammasi yangi akkaunt) |

### 11.2 Kelishilgan o'yin (collusion)

**Sxema:** ikki o'yinchi kelishib, biri ataylab yutqazadi. Yoki bir kishi ikkita
akkaunt ochib, o'ziga qarshi o'ynaydi (self-farming).

Bu **eng jiddiy** tahdid, chunki uni matematika to'xtata olmaydi.

**Signallar:**

| Signal | Izoh |
|---|---|
| Juftlik chastotasi | Ikki o'yinchi bir-biri bilan `> 15` o'yin, boshqalar bilan kam |
| Bir tomonlama natija | Juftlikda `> 90%` natija bir tomonga |
| O'yin uzunligi | Kelishilgan o'yin qisqa (`< 20` yurish) — vaqtni behuda sarflamaydi |
| Vaqt naqshi | O'yinlar ketma-ket, tanaffussiz, bir sessiyada |
| IP / device | Bir IP yoki bir device fingerprint (self-farming belgisi) |
| Reyting oqimi | Reyting muntazam A → B yo'nalishida oqadi |
| Ochilish xilma-xilligi | Bir xil ochilish qayta-qayta — o'yin "o'ynalmagan" |

**Graf tahlili:** o'yinchilarni tugun, o'yinlarni qirra deb olsak, kelishilgan guruh
**zich klaster** hosil qiladi — ichida ko'p qirra, tashqarida kam. Bu community
detection algoritmlari bilan aniqlanadi. Bu `fairplay` moduli javobgarligi.

### 11.3 Boshqa vektorlar

| Vektor | Ta'rif | Qarshi chora |
|---|---|---|
| **Sandbagging** | Ataylab yutqazib reytingni tushirish (past kategoriyali turnirda yutish uchun) | Ochkosiz o'yin naqshi, turnir natijasi bilan nomuvofiqlik |
| **Akkaunt almashish** | Kuchli o'yinchi boshqa akkauntdan o'ynaydi | Uslub tahlili, device fingerprint (`fairplay`) |
| **Turnir to'ldirish** | Soxta ishtirokchi ro'yxatga olib, ularga "yutish" | Ro'yxatdan o'tish tekshiruvi, hakam tasdiqlashi |
| **Forfeit farming** | Kelmagan raqibdan yutuq olish | **Forfeit reytingga kirmaydi** (§11.4) |
| **Timing attack** | Davr yopilishidan oldin/keyin o'ynash tanlovi | Kichik effekt, e'tibor berilmaydi |

### 11.4 Reytingga kirmaydigan o'yinlar

Bu qoidalar **hard rule** — signal emas, cheklov:

- **Forfeit / no-show** — raqib kelmadi. Bu shaxmat o'yini emas, ma'muriy natija.
- **Bye** (yarim yoki to'liq) — o'yin bo'lmadi.
- **Bekor qilingan o'yin** — hakam qarori.
- **Bekor qilingan turnir**.
- **Chit aniqlangan o'yin** — `fairplay` bayrog'i tasdiqlangan.
- **Ko'rgazmali (exhibition) o'yin** — turnir `is_rated = false` bo'lsa.

Bular `GameResult` da `is_rated = false` bilan belgilanadi va `RatingPeriodProcessor`
ularni umuman ko'rmaydi.

### 11.5 Javob chorasi

Signal ishga tushganda **avtomatik jazo yo'q**. Oqim:

```
Signal → fairplay tekshiruvi → Administrator ko'rib chiqadi → Qaror
```

Mumkin qarorlar:
1. **Yolg'on signal** — hech narsa qilinmaydi, signal chegarasi qayta ko'riladi.
2. **O'yinlarni reytingdan chiqarish** — `is_rated = false` + qayta hisoblash (§9).
3. **Reytingni tiklash** — ma'lum bir davrga qaytarish + qayta hisoblash.
4. **Akkaunt bloklash** — `identity` moduli.

Har qaror `AuditLog` ga yoziladi.

**Halol chegara:** yuqoridagi chegara qiymatlari (`> 300`, `< 0.3`, `> 90%`) —
**boshlang'ich taxminlar**. Ular real ma'lumotsiz sozlab bo'lmaydi. Birinchi 6 oy
signallar faqat **kuzatuv rejimida** ishlaydi (log yoziladi, hech kim ayblanmaydi),
keyin yolg'on-musbat darajasi o'lchanadi va chegaralar sozlanadi.

---

## 12. Test strategiyasi

### 12.1 Rasmiy test vektori (eng muhim test)

Glickman (2012), *"Example of the Glicko-2 system"* hujjatidagi misol. Bu implementatsiya
to'g'riligining **asosiy dalili**.

**Kirish:**

```
O'yinchi:  r = 1500,  RD = 200,  σ = 0.06,  τ = 0.5

Raqiblar:
  j=1:  rⱼ = 1400,  RDⱼ = 30,   sⱼ = 1    (yutuq)
  j=2:  rⱼ = 1550,  RDⱼ = 100,  sⱼ = 0    (yutqazish)
  j=3:  rⱼ = 1700,  RDⱼ = 300,  sⱼ = 0    (yutqazish)
```

**Kutilgan oraliq qiymatlar (hujjatdan):**

| Qadam | Qiymat |
|---|---|
| `μ` | 0.0000 |
| `φ` | 1.1513 |
| `μ₁, φ₁` | −0.5756, 0.1727 |
| `μ₂, φ₂` | 0.2878, 0.5756 |
| `μ₃, φ₃` | 1.1513, 1.7269 |
| `g(φ₁), g(φ₂), g(φ₃)` | 0.9955, 0.9531, 0.7242 |
| `E₁, E₂, E₃` | 0.639, 0.432, 0.303 |
| `v` | 1.7785 |
| `Δ` | −0.4834 |
| `σ'` | 0.05999 |
| `φ*` | 1.1528 |
| `φ'` | 0.8722 |
| `μ'` | −0.2069 |

**Kutilgan natija:**

```
r'  ≈ 1464.06
RD' ≈ 151.52
σ'  ≈ 0.05999
```

> **Muhim tolerantlik izohi.** Yuqoridagi qiymatlar hujjatda **yaxlitlangan oraliq
> qiymatlar** bilan hisoblangan. To'liq float aniqligi bilan hisoblaganda natija
> biroz farq qiladi:
>
> | Qiymat | Hujjat (yaxlitlangan) | To'liq aniqlik |
> |---|---|---|
> | `v` | 1.7785 | 1.7790 |
> | `Δ` | −0.4834 | −0.4839 |
> | `r'` | 1464.06 | **1464.05** |
> | `RD'` | 151.52 | 151.52 |
> | `σ'` | 0.05999 | 0.059996 |
>
> Bu farq **xato emas** — bu hujjatning yaxlitlashi. Shuning uchun test tolerantligi:
> `r'` va `RD'` uchun `±0.05`, `σ'` uchun `±0.00001`. Tolerantlikni `±0.001` qilib
> qo'ysangiz, **to'g'ri implementatsiya testdan o'tmaydi** — bu vaqt yo'qotishning
> keng tarqalgan sababi.
>
> Yuqoridagi "to'liq aniqlik" ustuni ushbu hujjat yozilishida mustaqil sonli hisob
> bilan olingan. Implementatsiya paytida **original PDF bilan yana bir marta
> solishtirilishi kerak**.

```typescript
// src/modules/rating/__tests__/glicko2.reference.spec.ts

describe('Glicko2Service — Glickman (2012) reference vector', () => {
  const service = new Glicko2Service();

  it('reproduces the published example', () => {
    const player: RatingSnapshot = {
      rating: 1500,
      ratingDeviation: 200,
      volatility: 0.06,
      gamesPlayed: 0,
    };

    const outcomes: MatchOutcome[] = [
      { opponent: { rating: 1400, ratingDeviation: 30 }, score: 1 },
      { opponent: { rating: 1550, ratingDeviation: 100 }, score: 0 },
      { opponent: { rating: 1700, ratingDeviation: 300 }, score: 0 },
    ];

    const result = service.computePeriod(player, outcomes, {
      tau: 0.5,
      epsilon: 0.000001,
    });

    // Tolerance accounts for the paper's rounded intermediates. See §12.1.
    expect(result.after.rating).toBeCloseTo(1464.05, 1);
    expect(result.after.ratingDeviation).toBeCloseTo(151.52, 1);
    expect(result.after.volatility).toBeCloseTo(0.05999, 4);
  });
});
```

### 12.2 Birlik testlari (unit)

| Test | Kutilgan natija |
|---|---|
| `g(0)` | `= 1` aniq |
| `g(φ)` monotonligi | `φ` ortsa `g` kamayadi |
| `E(μ, μ, φ)` | `= 0.5` (teng raqib) |
| `E` monotonligi | `μ` ortsa `E` ortadi |
| Simmetriya | `E(μ,μⱼ,φⱼ) + E(μⱼ,μ,φⱼ) = 1` (agar `φ = φⱼ`) |
| Bo'sh davr | `rating` o'zgarmaydi, `RD` ortadi, `σ` o'zgarmaydi |
| Bitta yutuq | `rating` ortadi, `RD` kamayadi |
| Bitta yutqazish | `rating` kamayadi, `RD` kamayadi |
| Durrang (teng raqib) | `rating` deyarli o'zgarmaydi (`< 1` ball), `RD` kamayadi |
| Kuchsiz raqibni yutish | `rating` juda kam ortadi (`< 3` ball) |
| Kuchli raqibni yutish | `rating` sezilarli ortadi (`> 15` ball) |

### 12.3 Property testlari

`fast-check` kutubxonasi bilan (Jest bilan integratsiya qiladi). Har biri **10 000**
tasodifiy kirish bilan ishlaydi.

```typescript
// src/modules/rating/__tests__/glicko2.properties.spec.ts

import fc from 'fast-check';

const arbSnapshot = fc.record({
  rating: fc.double({ min: 100, max: 3000, noNaN: true }),
  ratingDeviation: fc.double({ min: 30, max: 350, noNaN: true }),
  volatility: fc.double({ min: 0.01, max: 0.1, noNaN: true }),
  gamesPlayed: fc.integer({ min: 0, max: 5000 }),
});

const arbOutcome = fc.record({
  opponent: fc.record({
    rating: fc.double({ min: 100, max: 3000, noNaN: true }),
    ratingDeviation: fc.double({ min: 30, max: 350, noNaN: true }),
  }),
  score: fc.constantFrom(1 as const, 0.5 as const, 0 as const),
});
```

| Property | Da'vo |
|---|---|
| **RD manfiy emas** | Har qanday kirishda `RD' > 0` |
| **RD chegarada** | `30 ≤ RD' ≤ 350` |
| **RD kamayadi** | Kamida 1 o'yin bo'lsa, `RD' < sqrt(RD² + σ'²)` (ya'ni `φ*` dan kichik) |
| **Volatility chegarada** | `0.01 ≤ σ' ≤ 0.1` |
| **Reyting chegarada** | `r' ≥ 100` |
| **NaN yo'q** | Hech qanday chiqish `NaN` yoki `Infinity` emas |
| **Determinizm** | Bir xil kirish 100 marta → bir xil chiqish (bit-level) |
| **Tartib invariantligi** | `outcomes` ni shuffle qilish natijani o'zgartirmaydi (`±1e-9`) |
| **Monotonlik (natija)** | Yutqazishni yutuqqa almashtirish `r'` ni kamaytirmaydi |
| **Monotonlik (raqib)** | Kuchliroq raqibni yutish `r'` ni kamroq oshirmaydi |
| **Solver konvergensiyasi** | `solveVolatility` hech qachon tashlamaydi (throw) |
| **Solver chegarasi** | `iterations < 50` (amalda 2–5) |

> **Tartib invariantligi testi haqida.** Bu `±1e-9` tolerantlik bilan tekshiriladi,
> aniq tenglik bilan emas. Sabab: float qo'shish assotsiativ emas, shuning uchun
> yig'indi tartibi natijani oxirgi bitlarda o'zgartiradi. Bu §9.3 dagi `ORDER BY`
> talabining sababi ham.

### 12.4 Integratsiya testlari

Testcontainers bilan (real PostgreSQL 17 — CANON §4):

| Test | Tekshiriladi |
|---|---|
| To'liq davr | 100 o'yinchi, 500 o'yin → `RatingHistory` yozuvlari to'g'ri |
| Idempotentlik | Bir davrni 2 marta hisoblash → bir xil natija |
| Qayta hisoblash | Natija o'zgartirilsa → keyingi davrlar ham yangilanadi |
| `superseded_by` | Qayta hisoblashdan keyin eski yozuvlar saqlanadi va belgilanadi |
| Dry run | `dryRun: true` da DB o'zgarmaydi |
| Reytingsiz o'yin | `is_rated = false` o'yin hisobga olinmaydi |
| Cache muvofiqligi | `player_ratings` = oxirgi `RatingHistory` |
| Konkurentlik | Ikki job bir vaqtda → lock ishlaydi, biri kutadi |
| `tau` saqlanishi | Davr eski `tau` bilan qayta hisoblanadi |

### 12.5 Regressiya korpusi

Real (yoki realistik) turnir ma'lumotlaridan **muzlatilgan** test to'plami:

```
test/fixtures/rating/
  ├── tournament-swiss-9r-64p.json      # kirish
  ├── tournament-swiss-9r-64p.expected  # kutilgan chiqish
  ├── round-robin-10p.json
  ├── round-robin-10p.expected
  └── ...
```

Kutilgan chiqish birinchi marta **qo'lda tekshirilgan** implementatsiyadan
generatsiya qilinadi va muzlatiladi. Keyingi har o'zgarish bu korpusga qarab
tekshiriladi. Agar natija o'zgarsa — **ataylab** o'zgartirilganini tasdiqlash
kerak (fixture yangilanadi + PR'da sabab).

Bu refactoring paytida eng qimmatli xavfsizlik to'ri.

---

## 13. Acceptance criteria

### 13.1 Matematik to'g'rilik

- [ ] `Glicko2Service.computePeriod` Glickman (2012) test vektorini `r' = 1464.05 ± 0.05`,
      `RD' = 151.52 ± 0.05`, `σ' = 0.05999 ± 0.00001` aniqlikda takrorlaydi.
- [ ] Rasmiy hujjatdagi **barcha oraliq qiymatlar** (`v`, `Δ`, `φ*`, `φ'`, `μ'`) alohida
      test bilan tekshirilgan.
- [ ] `solveVolatility` Illinois algoritmini rasmiy hujjatga aynan mos implementatsiya qiladi.
- [ ] Volatility konvergensiyasi `ε = 0.000001` da.
- [ ] Solver 10 000 tasodifiy kirishning **hech birida** tashlamaydi (throw).
- [ ] Solver iteratsiyalari soni 10 000 tasodifiy kirishda `< 50`.
- [ ] `μ'` hisobida `S` ishlatilgan, `Δ` emas (§2.10 dagi xato yo'q).
- [ ] O'ynamagan o'yinchi uchun `φ' = sqrt(φ² + σ²)`, `μ' = μ`, `σ' = σ`.

### 13.2 Xatti-harakat

- [ ] Yangi o'yinchi `1500 / 350 / 0.06` bilan yaratiladi.
- [ ] Reyting `≥ 8` o'yin **va** `RD ≤ 110` da `established` bo'ladi.
- [ ] Provisional reyting UI'da `?` bilan, leaderboard'da ko'rsatilmaydi.
- [ ] 7 kategoriya mustaqil hisoblanadi, bir-biriga ta'sir qilmaydi.
- [ ] Onlayn va OTB reytinglari **hech qanday** kod yo'lida aralashmaydi.
- [ ] `RD ∈ [30, 350]`, `σ ∈ [0.01, 0.1]`, `r ≥ 100` — 10 000 tasodifiy kirishda.
- [ ] Clamp'ga urilish `WARN` log + Prometheus metrikasi beradi.
- [ ] Forfeit, bye, bekor qilingan o'yin reytingga kirmaydi.

### 13.3 Rating period

- [ ] Davr har oyning 1-sanasi 00:00 Asia/Tashkent da yopiladi.
- [ ] Yopilish BullMQ job orqali, avtomatik.
- [ ] Barcha o'yinchi davr boshidagi snapshot asosida hisoblanadi.
- [ ] O'yinlar tartibi natijaga ta'sir qilmaydi (`±1e-9`).
- [ ] `tau` va `epsilon` `RatingPeriod` da saqlanadi.
- [ ] Davr `ends_at + 6h` da yopilmagan bo'lsa — `CRITICAL` alert.
- [ ] Hisoblash paytida yangi natija qabul qilinmaydi (`COMPUTING` holati).

### 13.4 Ma'lumot yaxlitligi

- [ ] `RatingHistory` append-only: `UPDATE`/`DELETE` yo'q (`superseded_by` dan tashqari).
- [ ] Har `RatingHistory` da `game_result_ids` va `opponent_snapshot` to'liq.
- [ ] Bitta o'yinchi × davr uchun bitta faol yozuv (`superseded_by IS NULL`).
- [ ] `player_ratings` cache `rating_histories` dan to'liq qayta qurilishi mumkin.
- [ ] Barcha reyting qiymatlari `NUMERIC`, `FLOAT` emas.
- [ ] Barcha PK — UUID v7.

### 13.5 Qayta hisoblash

- [ ] `rating-recompute` job idempotent: 2 marta ishga tushirish → bir xil natija.
- [ ] Qayta hisoblash `fromPeriodId` dan bugungacha **barcha** davrlarni qamraydi.
- [ ] Eski `RatingHistory` yozuvlari saqlanadi, `superseded_by` bilan belgilanadi.
- [ ] Job faqat administrator tomonidan, sabab ko'rsatib ishga tushiriladi.
- [ ] `dryRun` rejimi DB'ni **umuman** o'zgartirmaydi va farq hisobotini beradi.
- [ ] Har qayta hisoblash `AuditLog` ga yoziladi.
- [ ] Reytingi `≥ 5` ball o'zgargan o'yinchi sabab bilan xabar oladi.
- [ ] Bir kategoriya uchun bir vaqtda bitta hisoblash (Redis lock).
- [ ] Qayta hisoblash davr `tau` sini ishlatadi, joriy `DEFAULT_TAU` ni emas.

### 13.6 FIDE mirror

- [ ] Farzin FIDE reytingini **hech qachon hisoblamaydi**.
- [ ] `fide-sync` job har oyning 2-sanasi 03:00 da ishlaydi.
- [ ] Import idempotent (`ON CONFLICT (fide_id, list_date) DO UPDATE`).
- [ ] Bir FIDE ID — bir `Player` (`UNIQUE` cheklov).
- [ ] FIDE ID bog'lanishi administrator tasdig'isiz `PENDING` qoladi.
- [ ] Fayl format o'zgarsa job to'xtaydi, **qisman import qilmaydi**.
- [ ] UI'da FIDE reytingi yonida ro'yxat sanasi va "Manba: FIDE" ko'rsatiladi.
- [ ] FIDE sinxronizatsiyasi milliy reytingga ta'sir qilmaydi (alohida kod yo'li).

### 13.7 Monitoring

- [ ] §10.3 dagi barcha metrikalar har davrdan keyin Prometheus'ga eksport qilinadi.
- [ ] O'rtacha reyting faqat `established` o'yinchilar bo'yicha hisoblanadi.
- [ ] Brier score va log-loss har davr hisoblanadi.
- [ ] §10.4 dagi barcha alertlar sozlangan.
- [ ] Grafana dashboard: reyting taqsimoti, o'rtacha trend, solver salomatligi.

### 13.8 Test qamrovi

- [ ] `Glicko2Service` va `solveVolatility` uchun branch coverage `≥ 95%`.
- [ ] §12.3 dagi barcha property testlari o'tadi (har biri 10 000 kirish).
- [ ] §12.4 dagi barcha integratsiya testlari Testcontainers bilan o'tadi.
- [ ] Regressiya korpusi CI'da har PR'da ishlaydi.
- [ ] Rasmiy test vektori testi **hech qachon skip qilinmaydi** (CI'da majburiy).

---

## 14. Ochiq savollar

Bu savollar hujjat yozilish paytida hal qilinmagan. Ular implementatsiyadan oldin
yoki real ma'lumot to'plangandan keyin javob topishi kerak.

| # | Savol | Kim hal qiladi | Qachon |
|---|---|---|---|
| 1 | `τ = 0.5` to'g'rimi? | Ma'lumot (backtest) | 12 davrdan keyin |
| 2 | Onlayn uchun kunlik davr qachon? | Mahsulot | 2-bosqich |
| 3 | Kategoriyalar orasida seeding kerakmi? | Ma'lumot (korrelyatsiya) | 12 oydan keyin |
| 4 | `RD ≤ 110` established chegarasi to'g'rimi? | Ma'lumot | 6 oydan keyin |
| 5 | Inflyatsiya tuzatish kerak bo'ladimi? | Ma'lumot (monitoring) | 24 oydan keyin |
| 6 | FIDE fayl formati va URL aniq nima? | Muhandis (tekshirish) | Implementatsiyadan oldin |
| 7 | Vaqt nazorati chegaralari FIDE B.02 ga mosmi? | Muhandis (tekshirish) | Implementatsiyadan oldin |
| 8 | Anti-abuse chegaralari to'g'rimi? | Ma'lumot (kuzatuv rejimi) | 6 oydan keyin |
| 9 | Lichess `τ` qiymati aniq qancha? | Muhandis (kod o'qish) | Ixtiyoriy |
| 10 | Jamoaviy turnir o'yinlari reytingga kiradimi? | Mahsulot | `tournament` hujjati bilan |

---

## 15. Manbalar

1. **Glickman, M. E. (2012).** *"Example of the Glicko-2 system."* Boston University.
   — Asosiy manba. Barcha formulalar va test vektori shundan.
2. **Glickman, M. E. (1999).** *"Parameter estimation in large dynamic paired comparison
   experiments."* Applied Statistics, 48, 377–394. — Glicko nazariy asosi.
3. **Glickman, M. E. (1995).** *"A comprehensive guide to chess ratings."* — Elo va
   reyting tizimlari tahlili.
4. **FIDE Handbook, B.02** — FIDE Rating Regulations. Vaqt nazorati va Elo qoidalari.
   **Implementatsiyadan oldin joriy versiya tekshirilsin.**
5. **Lichess ochiq manba kodi** — `lila` repozitoriysi, Glicko-2 implementatsiyasi.
   Amaliy referens.

---

## 16. Bog'liq hujjatlar

| Hujjat | Bog'liqlik |
|---|---|
| `docs/02-architecture.md` | Modular monolith, `rating` modul chegarasi |
| `docs/04-data-model.md` | `Player`, `GameResult`, `RatingPeriod`, `RatingHistory` |
| `docs/05-pairing.md` | Swiss pairing reytingdan seeding oladi |
| `docs/07-arbiter.md` | Natija kiritish, apellyatsiya → qayta hisoblash |
| `docs/09-fairplay.md` | Chit aniqlash → o'yinni reytingdan chiqarish |
| `docs/adr/0001-modular-monolith.md` | Nega mikroservis emas |

---

*Hujjat versiyasi: 1.0 — spetsifikatsiya. Implementatsiya boshlanmagan.*
