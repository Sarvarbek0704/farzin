# =============================================================================
#  FARZIN — frontend (Next.js 15) production image
#
#  ⚠️  BU PAKET ALOHIDA: o'z package.json va o'z pnpm-lock.yaml bilan.
#      Shu sababli build konteksti ham `web/` (repo ildizi EMAS) —
#      root `.dockerignore` da `web/` chiqarib tashlangan, ya'ni backend
#      image'iga frontend tushmaydi va aksincha.
#
#  Qurish:
#      docker build -t farzin:web \
#        --build-arg NEXT_PUBLIC_WS_URL=https://api.farzin.uz \
#        ./web
# =============================================================================

# --- 1-bosqich: bog'liqliklar -----------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- 2-bosqich: build -------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

#  ⚠️  `NEXT_PUBLIC_*` — BUILD VAQTIDA bundle ichiga YOZILADI.
#
#      Ya'ni uni konteynerni ishga tushirishda berish KECH: brauzerga
#      ketadigan JS'da eski qiymat qolib ketadi. Bu jonli sinovda
#      ushlangan xato edi — soket `localhost:3000` ga urinardi.
#      Shuning uchun u `ARG`, `ENV` emas.
ARG NEXT_PUBLIC_WS_URL=http://localhost:3000
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- 3-bosqich: runtime -----------------------------------------------------
#
#  `output: 'standalone'` (next.config.ts) faqat KERAKLI node_modules'ni
#  yig'adi — image bir necha barobar kichik bo'ladi.
#
#  ⚠️  `next start` STANDALONE bilan ISHLAMAYDI (Next o'zi ogohlantiradi).
#      Ishga tushirish yo'li — `node server.js`.
FROM node:22-alpine AS runner

RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `public/` va `.next/static` standalone chiqishiga KIRMAYDI — ular
# alohida ko'chiriladi, aks holda sahifa CSS va shriftsiz ochiladi.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

#  Next'da `/health` yo'q — ildiz sahifasi javob berayotgani yetarli.
#  200 dan boshqa har qanday javob (yoki ulanmaslik) — nosozlik.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
