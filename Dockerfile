# =============================================================================
#  FARZIN — production image
#  Spetsifikatsiya: docs/11-infrastructure.md §2
#
#  Ko'p bosqichli build. Sabablar:
#   - argon2 native binding → build bosqichida kompilyator kerak,
#     runtime'da kerak emas (docs/adr/0004-argon2id-over-bcrypt.md)
#   - devDependencies final image'ga tushmaydi
#   - non-root user (xavfsizlik)
#
#  IKKI RUNTIME MAQSADI:
#    docker build --target runner -t farzin:api .      ← API (default)
#    docker build --target worker -t farzin:worker .   ← BullMQ worker
#
#  ─────────────────────────────────────────────────────────────────────────
#  HAJM — DoD DAN FARQ, ONGLI RAVISHDA IZOHLANGAN
#  (docs/14-roadmap.md Faza 0: "Docker image < 250 MB YOKI farq izohlangan")
#
#  O'lchangan: api 829 MB, worker 1.02 GB. Chegaradan oshgan.
#  Sabab — `node_modules` qatlami 478 MB, undan eng kattalari:
#     @prisma/client 97 MB · prisma CLI 67 MB · @prisma/engines 36 MB
#     effect 34 MB · typescript 23 MB · date-fns 21 MB
#
#  `pnpm prune --prod` ishlaydi, lekin pnpm virtual store'da peer sifatida
#  ushlanib qolgan `prisma` va `typescript` paketlarini OLIB TASHLAMAYDI —
#  ular `@prisma/client` ning peer bog'liqliklari. Natijada ~90 MB o'lik
#  yuk qoladi: `node_modules/.bin/prisma` symlink'i prune'da o'chgani uchun
#  CLI image ichidan CHAQIRIB HAM BO'LMAYDI (tekshirildi: "not found"),
#  ya'ni migratsiya baribir tashqaridan yuritiladi.
#
#  To'g'ri yechim — `pnpm deploy --prod` bilan yassi node_modules qurish
#  yoki store'ni tanlab tozalash. Bu alohida ish sifatida qayd etilgan:
#  docs/AUDIT.md KICHIK-13 va tuzatish rejasi 22-band.
#  ─────────────────────────────────────────────────────────────────────────
# =============================================================================

# --- 1-bosqich: bog'liqliklar -----------------------------------------------
FROM node:22-alpine AS deps

# argon2 native binding uchun build vositalari
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# --frozen-lockfile: lockfile o'zgargan bo'lsa build yiqiladi.
# Bu ataylab — CI'da kutilmagan versiya kirmasligi kerak.
RUN pnpm install --frozen-lockfile

# --- 2-bosqich: build -------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm prisma generate
RUN pnpm build

# Prod uchun faqat production bog'liqliklar.
#
# --ignore-scripts MAJBURIY: `pnpm prune` tugagach `prepare` lifecycle
# skriptini qayta chaqiradi, u esa `husky` — devDependency, ya'ni aynan
# shu qadamda o'chirilgan. Natija: `sh: husky: not found` va BUILD
# YIQILADI (docs/AUDIT.md KRITIK-1 ning ikkinchi to'sig'i).
# Git hook'lari image ichida umuman kerak emas.
RUN pnpm prune --prod --ignore-scripts

# --- 3-bosqich: umumiy runtime asosi ----------------------------------------
#
#  Bu bosqich IKKI maqsad uchun umumiy poydevor: `runner` (API) va `worker`.
#  Ikkalasi bir xil `dist/` dan ishlaydi, faqat CMD va qo'shimcha binarlar
#  bilan farq qiladi.
#
#  dumb-init — PID 1 signal handling (SIGTERM to'g'ri ishlashi uchun)
FROM node:22-alpine AS runtime-base

RUN apk add --no-cache dumb-init libc6-compat

WORKDIR /app

ENV NODE_ENV=production

# Non-root user. node:alpine'da `node` useri allaqachon bor (UID 1000).
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node

ENTRYPOINT ["dumb-init", "--"]

# --- 4-bosqich: API (default target) ----------------------------------------
#
#  ⚠️  STOCKFISH BU YERDA ATAYLAB YO'Q.
#
#  src/worker.ts sarlavhasi va analysis.processor.ts:41-43 aniq yozadi:
#  "API processi bu navbatni QAYTA ISHLAMAYDI — Stockfish CPU'ni to'liq
#  yeydi va HTTP javob vaqtini buzadi". Ya'ni API'da shaxmat dvigateli
#  hech qachon ishga tushmaydi — uni image'ga qo'shish ~50 MB va
#  ortiqcha hujum sirtidan boshqa hech narsa bermaydi.
#
#  (Ilgari bu qatorda `apk add stockfish` turgan edi va BUTUN BUILD
#  yiqilardi: paket Alpine'ning main/community repolarida yo'q —
#  docs/AUDIT.md KRITIK-1.)
FROM runtime-base AS runner

EXPOSE 3000

# Yo'l `/health/live` — `/api/health/live` EMAS: main.ts:76 health va
# metrics yo'llarini global prefiksdan CHIQARADI. Noto'g'ri yo'l bilan
# konteyner abadiy `unhealthy` bo'lib qolardi va compose'dagi
# `depends_on: service_healthy` hech qachon ochilmasdi.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]

# --- 4-bosqich (muqobil): worker --------------------------------------------
#
#  Stockfish — fair-play tahlili uchun (docs/08-fair-play.md §8).
#
#  NEGA `edge/testing`: `stockfish` paketi Alpine'ning barqaror main va
#  community repolarida YO'Q (tekshirilgan: apk search bo'sh qaytaradi).
#  U faqat edge/testing da bor. Bu ongli trade-off: muqobil variantlar —
#  manbadan kompilyatsiya (build vaqtini daqiqalarga cho'zadi + NNUE
#  tarmog'ini yuklab olish) yoki Debian bazasiga o'tish (image 3× katta).
#
#  ⚠️  edge paketi barqaror baza ustiga o'rnatiladi — versiya qotirilgan
#      (`stockfish=~18`), aks holda kutilmagan yangilanish kelishi mumkin.
#      Binar joyi: /usr/bin/stockfish (Debian'dagi /usr/games/ EMAS).
#
#  Worker'da HEALTHCHECK yo'q: worker.ts HTTP server ochmaydi
#  (`NestFactory.createApplicationContext`), tekshirish uchun port yo'q.
FROM runtime-base AS worker

USER root
RUN apk add --no-cache \
      --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing \
      "stockfish=~18" \
 && stockfish_path="$(command -v stockfish)" \
 && test -x "$stockfish_path"
USER node

ENV STOCKFISH_PATH=/usr/bin/stockfish

CMD ["node", "dist/worker"]
