# =============================================================================
#  FARZIN — production image
#  Spetsifikatsiya: docs/11-infrastructure.md §2
#
#  Ko'p bosqichli build. Sabablar:
#   - argon2 native binding → build bosqichida kompilyator kerak,
#     runtime'da kerak emas (docs/adr/0004-argon2id-over-bcrypt.md)
#   - devDependencies final image'ga tushmaydi
#   - non-root user (xavfsizlik)
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

# Prod uchun faqat production bog'liqliklar
RUN pnpm prune --prod

# --- 3-bosqich: runtime -----------------------------------------------------
FROM node:22-alpine AS runner

# Stockfish — fair-play tahlili uchun (docs/08-fair-play.md §8)
# dumb-init — PID 1 signal handling (SIGTERM to'g'ri ishlashi uchun)
RUN apk add --no-cache stockfish dumb-init libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV STOCKFISH_PATH=/usr/games/stockfish

# Non-root user. node:alpine'da `node` useri allaqachon bor (UID 1000).
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
