# 11 — Infratuzilma (Infrastructure)

> **Loyiha:** Farzin — O'zbekiston shaxmatining raqamli infratuzilmasi
> **Hujjat holati:** loyihalash bosqichi. Bu yerdagi arxitektura qarorlari qat'iy,
> lekin **raqamli maqsadlar (image o'lchami, RPS, pod soni) o'lchov bilan tasdiqlanishi shart**.
> Hech bir raqam "shunday bo'lsa kerak" deb yozilmagan — har birining yonida qanday
> o'lchanishi ko'rsatilgan.

**Bog'liq hujjatlar:**
- [10-security.md](./10-security.md) — ma'lumot lokalizatsiyasi, sirlarni boshqarish, audit log
- [13-testing-strategy.md](./13-testing-strategy.md) — CI pipeline'dagi test bosqichlari
- [15-observability.md](./15-observability.md) — metrics, logs, traces, alerting
- [14-roadmap.md](./14-roadmap.md) — infratuzilma qaysi fazada quriladi
- [ADR-0001](./adr/0001-modular-monolith.md) — nega modular monolith, nega mikroservis emas

---

## 1. Muhitlar (Environments)

Farzin to'rtta muhitda ishlaydi. Har birining maqsadi boshqacha, va ular
**bir-biridan ma'lumot jihatidan qat'iy ajratilgan** — production ma'lumoti hech qachon
dev yoki staging'ga ko'chirilmaydi (faqat anonimlashtirilgan dump, [13-testing-strategy.md](./13-testing-strategy.md) 9-bo'lim).

| Muhit | Maqsad | Ma'lumot | Kim kiradi | Deploy |
|-------|--------|----------|------------|--------|
| `local` | Dasturchi mashinasi | Seed / fixture | Dasturchi | `docker compose up` |
| `dev` | Integratsiya, branch preview | Seed + sintetik | Jamoa | Har `push` |
| `staging` | Production nusxasi, reliz oldi tekshiruvi | Anonimlashtirilgan prod dump | Jamoa + beta hakamlar | `main`ga merge |
| `production` | Real foydalanuvchi | Real | Faqat on-call, audit bilan | Teg (tag) yoki qo'lda approve |

### 1.1 `local`

Maqsad — dasturchi internetga bog'liq bo'lmasdan ishlashi. Butun stack
Docker Compose'da ko'tariladi (3-bo'lim). Tashqi servislar **mock qilinadi**:

- Click/Payme → lokal sandbox stub (billing modulining `PaymentProvider` interfeysi ortida)
- Eskiz SMS → konsolga chiqaradigan `LoggerSmsProvider`
- FCM push → no-op provider
- S3 → MinIO (real S3 API, real kod yo'li)

Muhim qoida: **stub faqat tashqi tarmoq chegarasida bo'ladi.** PostgreSQL, Redis
hech qachon mock qilinmaydi — sabab [13-testing-strategy.md](./13-testing-strategy.md) 3-bo'limda.

### 1.2 `dev`

Har bir `push` avtomatik deploy bo'ladi. Bu yerda ma'lumot **istalgan payt yo'q qilinishi mumkin** —
dasturchilar buni bilishadi. `dev` migratsiyalarni birinchi bo'lib sinaydigan joy:
agar migration `dev`da buzilsa, u `staging`ga yetib bormaydi.

### 1.3 `staging`

Bu eng muhim muhit va ko'pincha e'tiborsiz qoladigan muhit. `staging`
**production bilan bir xil bo'lishi shart**:

- bir xil Kubernetes manifest (faqat replica soni va resurs limiti farq qiladi)
- bir xil PostgreSQL major versiyasi (17)
- bir xil migration tarixi
- bir xil feature flag mexanizmi (qiymatlar boshqacha bo'lishi mumkin)

Agar staging production'dan arxitektura jihatidan farq qilsa, u yerda o'tgan test
production haqida hech narsa isbotlamaydi.

Turnir mavsumida `staging` alohida rol o'ynaydi: real hakamlar reliz oldidan
o'z turnir stsenariysini shu yerda sinab ko'radi. Bu **majburiy gate** — pairing
yoki rating tegadigan har qanday reliz staging'da kamida bitta to'liq turnir
sikli (registration → pairing → natija → tie-break → rating) o'tkazmasdan
production'ga chiqmaydi.

### 1.4 `production`

Kirish faqat audit bilan. Hech kim `kubectl exec` orqali DB'ga qo'lda
o'zgartirish kiritmaydi — har qanday ma'lumot tuzatishi migration yoki
admin modulidagi audit qilinadigan operatsiya orqali bo'ladi
([10-security.md](./10-security.md) audit log bo'limi).

---

## 2. Konteynerizatsiya (Docker)

### 2.1 Multi-stage build strategiyasi

NestJS ilovasi uchun uch bosqichli build. Sabab: build vaqtida kerak bo'lgan
narsalar (TypeScript compiler, devDependencies, Prisma generate) runtime'da
kerak emas va ular image'da qolsa — hajm ham, hujum yuzasi (attack surface) ham ortadi.

```dockerfile
# ---------- Stage 1: deps ----------
# Faqat dependency o'rnatish. Bu layer package.json o'zgarmasa cache'dan olinadi.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts
# Prisma client generatsiyasi alohida — schema o'zgarganda qayta ishlaydi
RUN npx prisma generate

# ---------- Stage 2: build ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Production dependency'larni alohida daraxtga ajratamiz
RUN npm prune --omit=dev

# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

# Prisma engine OpenSSL'ga bog'liq — alpine'da alohida kerak
RUN apk add --no-cache openssl dumb-init && \
    addgroup -g 1001 -S farzin && \
    adduser -u 1001 -S farzin -G farzin

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=farzin:farzin /app/node_modules ./node_modules
COPY --from=build --chown=farzin:farzin /app/dist ./dist
COPY --from=build --chown=farzin:farzin /app/prisma ./prisma
COPY --from=build --chown=farzin:farzin /app/package.json ./package.json

USER farzin
EXPOSE 3000

# dumb-init — PID 1 muammosi: SIGTERM to'g'ri uzatilishi uchun.
# Bu graceful shutdown uchun kritik (2.4-bo'lim).
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

### 2.2 Non-root user

Konteyner **hech qachon root ostida ishlamaydi**. Yuqoridagi Dockerfile'da
`farzin` (UID 1001) foydalanuvchisi yaratiladi. Kubernetes darajasida bu
`securityContext` bilan majburlanadi (4.1-bo'lim) — ya'ni ikki qavatli himoya:
image ham, orkestrator ham buni ta'minlaydi.

Sabab oddiy: konteyner ichida RCE bo'lsa, root bo'lmagan protsess kernel
exploit'siz host'ga chiqa olmaydi. Bu kafolat emas, lekin bir qavat qiyinlik.

### 2.3 Alpine vs distroless — tanlov

Ikkala variant ham ko'rib chiqildi:

**Distroless (`gcr.io/distroless/nodejs22`)** — shell yo'q, package manager yo'q,
eng kichik hujum yuzasi. Lekin: debug qiyin (`kubectl exec` bilan shell ochib bo'lmaydi),
va Prisma'ning native engine binary'lari uchun glibc/OpenSSL bog'liqliklarini
qo'lda ko'chirish kerak — bu mo'rt.

**Alpine (`node:22-alpine`)** — kichik (musl libc), shell bor, `apk` bilan
OpenSSL o'rnatish oson, Prisma alpine'ni rasman qo'llab-quvvatlaydi.

**Qaror: Alpine.** Sabab — Prisma engine bilan operatsion ishonchlilik
distroless'ning qo'shimcha xavfsizlik yutug'idan ustun turadi, ayniqsa jamoa
kichik bo'lganda (bir kishi — [14-roadmap.md](./14-roadmap.md)). Debug qilolmaydigan
production konteyner — bu ham xavfsizlik muammosi.

Alpine'ning ma'lum kamchiligi: musl libc glibc'dan sekinroq bo'lishi mumkin
(ayniqsa DNS resolution va ba'zi allocation naqshlarida). **Bu o'lchanishi kerak** —
agar yuklama testida (`13-testing-strategy.md` 7-bo'lim) musl sezilarli farq
bersa, `node:22-slim` (Debian) ga o'tish ochiq qoladi.

### 2.4 Graceful shutdown

Bu Farzin uchun oddiy CRUD ilovadan ko'ra muhimroq, chunki:
- WebSocket ulanishlari ochiq (jonli o'yin, taymer ishlayapti)
- BullMQ worker'lari yarim bajarilgan job ushlab turgan bo'lishi mumkin (rating hisoblash)

```typescript
// src/main.ts (fragment)
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Nest'ning lifecycle hook'lari (onModuleDestroy, beforeApplicationShutdown)
  // ishlashi uchun majburiy — aks holda SIGTERM darhol protsessni o'ldiradi.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
```

```typescript
// src/play/play.gateway.ts (fragment)
@WebSocketGateway({ cors: false })
export class PlayGateway implements OnApplicationShutdown {
  @WebSocketServer()
  private readonly server!: Server;

  async onApplicationShutdown(signal?: string): Promise<void> {
    // Klientlarga qayta ulanish signalini yuboramiz. Socket.IO klienti
    // avtomatik reconnect qiladi va boshqa pod'ga tushadi.
    this.server.emit('server:draining', { reason: signal ?? 'shutdown' });

    // Taymer holati Redis'da (server-authoritative), shuning uchun
    // reconnect'dan keyin o'yin yo'qolmaydi. Bu qism 08-play modulida.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    this.server.close();
  }
}
```

Kubernetes tomonida `terminationGracePeriodSeconds` shu 5 soniyadan katta
bo'lishi shart (4.1-bo'lim) — aks holda pod drain tugamasdan o'ldiriladi.

### 2.5 Image o'lchami maqsadi

Maqsad: **runtime image < 250 MB** (siqilmagan holda).

Bu **taxminiy maqsad**, kafolat emas. Asos: `node:22-alpine` bazasi ~50 MB,
Prisma query engine ~15-20 MB, `node_modules` (prod-only) NestJS + Prisma +
Socket.IO + BullMQ bilan taxminan 120-180 MB oralig'ida bo'lishi kutiladi.
**Aniq raqam birinchi build'dan keyin `docker images` bilan o'lchanadi** va
CI'da regression sifatida kuzatiladi:

```yaml
# .github/workflows/ci.yml (fragment)
- name: Check image size budget
  run: |
    SIZE_MB=$(docker image inspect farzin:${{ github.sha }} \
      --format='{{.Size}}' | awk '{printf "%.0f", $1/1024/1024}')
    echo "Image size: ${SIZE_MB} MB"
    if [ "$SIZE_MB" -gt 250 ]; then
      echo "::warning::Image size ${SIZE_MB}MB exceeds 250MB budget"
    fi
```

E'tibor bering — bu `warning`, `error` emas. Byudjet qattiq qoida emas, signal.
Agar Stockfish NNUE binary'si server-side fair-play uchun image'ga qo'shilsa
(6-faza, [14-roadmap.md](./14-roadmap.md)), byudjet qayta ko'rib chiqiladi —
ehtimol fairplay worker alohida image'ga ajratiladi.

---

## 3. Docker Compose (dev muhiti)

Dasturchi uchun bitta buyruq: `docker compose up`. Hech qanday qo'lda o'rnatish yo'q.

```yaml
# docker-compose.yml
name: farzin

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: farzin
      POSTGRES_PASSWORD: farzin_local_only
      POSTGRES_DB: farzin_dev
      # Lokal uchun tezlik: fsync o'chirilgan. PRODUCTION'DA HECH QACHON EMAS.
      POSTGRES_INITDB_ARGS: "--data-checksums"
    command:
      - postgres
      - -c
      - fsync=off
      - -c
      - synchronous_commit=off
      - -c
      - log_statement=all
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U farzin -d farzin_dev"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy noeviction
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    # S3-mos object storage. Avatar, PGN arxiv, hisobot fayllari.
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: farzin
      MINIO_ROOT_PASSWORD: farzin_local_only
    ports:
      - "9000:9000"   # S3 API
      - "9001:9001"   # Web console
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio-init:
    # Bucket'larni bir marta yaratadi va chiqib ketadi.
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 farzin farzin_local_only;
      mc mb --ignore-existing local/farzin-avatars;
      mc mb --ignore-existing local/farzin-pgn;
      mc mb --ignore-existing local/farzin-reports;
      mc anonymous set download local/farzin-avatars;
      exit 0;
      "

  mailhog:
    # SMTP tuzoq: dev'da yuborilgan email hech qayerga ketmaydi,
    # web UI'da (8025) ko'rinadi. Tasodifan real foydalanuvchiga
    # email yuborish xavfini nolga tushiradi.
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
    logging:
      driver: none    # mailhog juda ko'p log yozadi

  app:
    build:
      context: .
      target: build      # dev'da runtime stage kerak emas — hot reload uchun
    command: npm run start:dev
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://farzin:farzin_local_only@postgres:5432/farzin_dev
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: farzin
      S3_SECRET_KEY: farzin_local_only
      SMTP_HOST: mailhog
      SMTP_PORT: "1025"
      LOG_LEVEL: debug
    ports:
      - "3000:3000"
      - "9229:9229"     # Node inspector — debugger ulanishi uchun
    volumes:
      - ./src:/app/src:ro
      - ./prisma:/app/prisma:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

Diqqat qiladigan nuqtalar:

- **`depends_on` + `condition: service_healthy`** — `app` DB tayyor bo'lgunicha
  kutadi. `depends_on` yolg'iz o'zi faqat "konteyner ishga tushdi" degani, "tayyor" degani emas.
- **`maxmemory-policy noeviction`** — Redis'da BullMQ job'lari va sessiya bor.
  Agar `allkeys-lru` bo'lsa, Redis xotira to'lganda job'ni jimgina o'chirib
  yuborishi mumkin. Bu jimgina ma'lumot yo'qotish — eng yomon nosozlik turi.
  Xotira to'lsa, xato qaytarsin — biz buni bilishimiz kerak.
- **MinIO** — real S3 API. Ya'ni `@aws-sdk/client-s3` kodi dev va prod'da bir xil,
  faqat endpoint farq qiladi. Hech qanday "dev'da fayl tizimiga yozamiz" hiylasi yo'q.

---

## 4. Kubernetes (production)

Kubernetes **birinchi kundan kerak emas**. [14-roadmap.md](./14-roadmap.md)ga muvofiq,
Faza 0-4 davomida oddiy VM + Docker Compose yoki bitta managed container platformasi
yetarli. K8s Faza 5 (onlayn o'yin, WebSocket masshtabi) atrofida kiritiladi.

Sabab halol: bir kishilik jamoada K8s'ni erta kiritish — bu mahsulot o'rniga
infratuzilma bilan shug'ullanish. Lekin arxitektura K8s'ga tayyor bo'lishi kerak
(stateless app, tashqi holat, health probe) — shuning uchun bu bo'lim oldindan yozilgan.

### 4.1 Deployment

```yaml
# k8s/base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: farzin-api
  labels:
    app.kubernetes.io/name: farzin
    app.kubernetes.io/component: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0     # 0 — deploy vaqtida sig'im pasaymasin
  selector:
    matchLabels:
      app.kubernetes.io/name: farzin
      app.kubernetes.io/component: api
  template:
    metadata:
      labels:
        app.kubernetes.io/name: farzin
        app.kubernetes.io/component: api
    spec:
      # SIGTERM'dan keyin drain uchun vaqt (2.4-bo'lim: gateway 5s kutadi)
      terminationGracePeriodSeconds: 45

      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault

      # Pod'lar turli node'larga tarqalsin — bitta node yiqilsa
      # hamma replica yo'qolmasin.
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: farzin
              app.kubernetes.io/component: api

      containers:
        - name: api
          image: ghcr.io/sarvarbek0704/farzin:__TAG__
          ports:
            - name: http
              containerPort: 3000
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]

          envFrom:
            - configMapRef:
                name: farzin-config
            - secretRef:
                name: farzin-secrets   # tashqi secret store'dan sinxronlanadi

          # Liveness — "protsess tirikmi?". Faqat event loop tekshiriladi.
          # DB tekshirilmaydi: DB yiqilganda pod'ni restart qilish yordam bermaydi,
          # aksincha restart bo'roni (crash loop) keltirib chiqaradi.
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3

          # Readiness — "trafik qabul qilishga tayyormi?". Bu yerda DB va Redis
          # tekshiriladi: DB yo'q bo'lsa, bu pod so'rov qabul qilmasin.
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 2

          # Startup — sekin start (Prisma engine, modul init) uchun.
          # Bu bo'lmasa liveness sekin start'ni "o'lik" deb hisoblab restart qiladi.
          startupProbe:
            httpGet:
              path: /health/live
              port: http
            periodSeconds: 3
            failureThreshold: 20    # ya'ni 60s startga ruxsat

          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              # CPU limit ATAYLAB QO'YILMAGAN. Sabab: CFS throttling
              # Node.js'da p99 latency'ni keskin buzadi. Request bilan
              # scheduling ta'minlanadi, limit esa zarar keltiradi.
              memory: "1Gi"

          volumeMounts:
            - name: tmp
              mountPath: /tmp

      volumes:
        # readOnlyRootFilesystem: true bo'lgani uchun yoziladigan joy kerak
        - name: tmp
          emptyDir: {}
```

`resources.requests` qiymatlari — **boshlang'ich taxmin**. Ular yuklama testidan
([13-testing-strategy.md](./13-testing-strategy.md) 7-bo'lim) keyin, real
`container_memory_working_set_bytes` va CPU profiliga qarab tuzatiladi.
Hozircha bu raqamlar "o'lchov bilan aniqlanadi" toifasida.

Health endpoint'lari ikkiga bo'linishi muhim va bu tez-tez xato qilinadigan joy.
`@nestjs/terminus` bilan:

```typescript
// src/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  // Liveness: hech qanday tashqi bog'liqlik tekshirilmaydi.
  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  // Readiness: tashqi bog'liqliklar tekshiriladi.
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('postgres', { timeout: 1500 }),
      () => this.redis.pingCheck('redis', { timeout: 1000 }),
    ]);
  }
}
```

### 4.2 Service va Ingress

```yaml
# k8s/base/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: farzin-api
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: farzin
    app.kubernetes.io/component: api
  ports:
    - name: http
      port: 80
      targetPort: http
```

```yaml
# k8s/base/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: farzin-api
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"      # PGN import fayllari
    # WebSocket uchun uzun timeout — jonli o'yin soatlab davom etishi mumkin
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [api.farzin.uz]
      secretName: farzin-api-tls
  rules:
    - host: api.farzin.uz
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: farzin-api
                port:
                  name: http
```

### 4.3 WebSocket va sticky session muammosi

Bu Farzin'dagi eng nozik infratuzilma masalasi. Muammoni aniq ta'riflaymiz.

**Muammo 1 — Socket.IO handshake.** Socket.IO avval HTTP long-polling bilan
ulanadi, keyin WebSocket'ga upgrade qiladi. Agar handshake'ning ikkinchi
so'rovi boshqa pod'ga tushsa, u pod bu sessiyani tanimaydi va ulanish
`400 Bad Request` bilan uziladi.

**Muammo 2 — pod'lararo xabar.** A pod'idagi o'yinchi yurish qiladi,
raqib B pod'iga ulangan. B pod bu haqda hech narsa bilmaydi.

Ikki muammo — ikki xil yechim, va ular chalkashtirilmasligi kerak.

```mermaid
graph TB
    C1[O'yinchi A brauzeri] -->|WSS| ING[Ingress nginx<br/>sticky: ip-hash]
    C2[O'yinchi B brauzeri] -->|WSS| ING
    ING -->|sticky| P1[Pod 1<br/>PlayGateway]
    ING -->|sticky| P2[Pod 2<br/>PlayGateway]
    P1 <-->|pub/sub| R[(Redis 7<br/>Socket.IO adapter)]
    P2 <-->|pub/sub| R
    P1 --> PG[(PostgreSQL 17)]
    P2 --> PG
    P1 -.->|taymer holati| R
    P2 -.->|taymer holati| R
```

**Muammo 2 yechimi — Redis adapter.** Bu asosiy yechim:

```typescript
// src/play/redis-io.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;

  async connectToRedis(url: string): Promise<void> {
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

Bu bilan `server.to(gameId).emit(...)` chaqirilganda, xabar Redis pub/sub orqali
barcha pod'larga tarqaladi va o'sha xonadagi socket'lar qaysi pod'da bo'lishidan
qat'i nazar xabarni oladi. Bu — [CANON 7.6] da aytilgan "WebSocket masshtabi"
muammosining javobi.

**Muammo 1 yechimi — ikki variant:**

*Variant A: sticky session (nginx `ip-hash` yoki cookie affinity).*

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "farzin_route"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "3600"
```

Kamchiligi: pod olib tashlanganda (deploy, scale-down) o'sha pod'ga
"yopishgan" klientlar uziladi. Yuk taqsimoti ham notekis bo'lishi mumkin —
bitta katta turnir bitta viloyatdan bo'lsa, `ip-hash` ularni bitta pod'ga to'playdi.

*Variant B: WebSocket-only transport.*

```typescript
@WebSocketGateway({
  // Long-polling bosqichini butunlay o'tkazib yuboramiz.
  // Upgrade bo'lmasa — sticky ham kerak emas.
  transports: ['websocket'],
  path: '/socket.io',
})
export class PlayGateway { /* ... */ }
```

Agar `transports: ['websocket']` bo'lsa, polling handshake yo'q, demak
"ikkinchi so'rov boshqa pod'ga tushdi" muammosi ham yo'q. WebSocket ulanishi
o'rnatilgandan keyin u bitta TCP sessiya — u tabiiy ravishda bitta pod'da qoladi.

Kamchiligi: ba'zi korporativ proxy'lar WebSocket'ni bloklaydi va polling
fallback'siz bunday foydalanuvchi umuman ulana olmaydi.

**Qaror: Variant B (websocket-only) asosiy, sticky cookie qo'shimcha xavfsizlik chorasi sifatida.**

Sabab: Farzin'ning asosiy klienti — brauzer va mobil ilova, korporativ proxy
ortidagi foydalanuvchi kam. WebSocket'siz muhitda ishlaydigan foydalanuvchi
ulushi **o'lchanishi kerak** (Faza 5'dan keyin real telemetriya bilan) —
agar sezilarli bo'lsa, polling fallback sticky cookie bilan qayta yoqiladi.

Muhimi: **taymer holati hech qachon pod xotirasida saqlanmaydi.** U Redis'da
(server-authoritative, [CANON 7.3]). Shuning uchun pod almashinuvi o'yinni
buzmaydi — reconnect'dan keyin klient joriy holatni qayta oladi.

### 4.4 HPA (Horizontal Pod Autoscaler)

```yaml
# k8s/base/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: farzin-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: farzin-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
    # Biznesga oid metrika — CPU o'rniga haqiqiy yuk signali.
    # Manba: farzin_websocket_connections (15-observability.md 3-bo'lim)
    - type: Pods
      pods:
        metric:
          name: farzin_websocket_connections
        target:
          type: AverageValue
          averageValue: "800"    # pod boshiga — YUKLAMA TESTIDAN KEYIN aniqlanadi
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
    scaleDown:
      # Sekin pasayish: WebSocket ulanishlari uzilmasligi uchun.
      # 10 daqiqa — turnir raundi o'rtasida pod olib tashlanmasin.
      stabilizationWindowSeconds: 600
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

`averageValue: "800"` — **to'qib chiqarilgan raqam emas, balki placeholder.**
Pod bir vaqtda nechta WebSocket ulanishini eplashi Node.js event loop yuki,
xabar chastotasi va xotiraga bog'liq. Bu k6 yuklama testida (1000 concurrent
o'yin stsenariysi) o'lchanadi va shundan keyin aniq qiymat qo'yiladi.

CPU asosidagi scaling WebSocket ilovasi uchun yolg'iz o'zi yomon signal:
10 000 ta bo'sh turgan ulanish CPU'ni deyarli ishlatmaydi, lekin xotira va
file descriptor'ni yeydi. Shuning uchun ikkala metrika birga.

### 4.5 PodDisruptionBudget

```yaml
# k8s/base/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: farzin-api
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: farzin
      app.kubernetes.io/component: api
```

PDB ixtiyoriy uzilishlarni (node drain, cluster upgrade, `kubectl drain`)
cheklaydi. `minAvailable: 2` — hech qachon 2 tadan kam pod qolmasin.

Turnir davom etayotgan paytda cluster upgrade qilish — bu real xavf.
PDB uni to'liq to'xtatmaydi, lekin sekinlashtiradi. Qo'shimcha
operatsion qoida: **jonli turnir vaqtida cluster maintenance o'tkazilmaydi**.
Turnir kalendari (`tournament` moduli) on-call jadvaliga eksport qilinadi
([15-observability.md](./15-observability.md) 6-bo'lim).

### 4.6 Worker Deployment

BullMQ worker'lari (rating hisoblash, PGN import, hisobot) API'dan **alohida
Deployment**da ishlaydi. Sabab: ularning yuk profili butunlay boshqacha —
rating period yopilganda CPU portlaydi, qolgan vaqtda deyarli bo'sh.
Agar ular API bilan bir pod'da bo'lsa, rating hisoblash foydalanuvchi
so'rovlarining latency'sini buzadi.

```yaml
# k8s/base/worker-deployment.yaml (fragment)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: farzin-worker
spec:
  replicas: 2
  template:
    spec:
      terminationGracePeriodSeconds: 300   # uzun job tugashini kutish
      containers:
        - name: worker
          image: ghcr.io/sarvarbek0704/farzin:__TAG__
          command: ["node", "dist/worker.js"]
          env:
            - name: WORKER_QUEUES
              value: "rating,pgn-import,report"
          resources:
            requests:
              cpu: "500m"
              memory: "768Mi"
            limits:
              memory: "2Gi"
```

Fair-play moduli (Faza 6) Stockfish NNUE bilan server-side tahlil qiladi —
bu **alohida worker pool** bo'ladi, chunki u CPU'ni to'liq yeydi va boshqa
job'larni ochlikda qoldiradi. U `farzin-worker-analysis` nomi bilan alohida
Deployment va alohida node pool'da (CPU-optimized) joylashadi.

---

## 5. Hosting tanlovi

### 5.1 Cheklov: ma'lumot lokalizatsiyasi

O'zbekiston qonunchiligida shaxsiy ma'lumotlarni O'zbekiston hududidagi
serverlarda saqlash talabi mavjud (batafsil huquqiy tahlil —
[10-security.md](./10-security.md), "Ma'lumot lokalizatsiyasi" bo'limi).

Farzin uchun bu to'g'ridan-to'g'ri tegishli, chunki tizim quyidagilarni saqlaydi:
- `User` — ism, email, telefon
- `Player` — tug'ilgan sana, FIDE ID, milliy ID, viloyat
- `Student` — **voyaga yetmaganlar ma'lumoti** (school moduli, B2G)
- `Payment` — to'lov tarixi

`Student` ma'lumoti eng sezgir toifa. Maktab moduli davlat shartnomasi ostida
ishlaydi va u yerda talab ehtimol qonundan ham qattiqroq bo'ladi.

### 5.2 Variantlar va trade-off

**Variant A — mahalliy data-center (UZINFOCOM va shu kabilar)**

| Jihat | Baho |
|-------|------|
| Lokalizatsiya | To'liq mos |
| Latency (O'zbekiston foydalanuvchisi) | Eng yaxshi |
| Managed K8s / RDS / S3 | Cheklangan yoki yo'q — **tekshirilishi kerak** |
| Operatsion yuk | Yuqori: PostgreSQL, backup, K8s — o'zimiz boqamiz |
| Narx | Odatda arzon, lekin SLA past bo'lishi mumkin |
| Terraform provider | Ehtimol yo'q → IaC qisman qo'lda |

Asosiy xavf: managed servis bo'lmasa, bir kishilik jamoa PostgreSQL replication,
PITR, K8s control plane'ni o'zi boshqaradi. Bu — mahsulotdan chalg'itadigan ish.

**Variant B — AWS/GCP yaqin region (Frankfurt, Bahrayn, Mumbay)**

| Jihat | Baho |
|-------|------|
| Lokalizatsiya | **Mos emas** — shaxsiy ma'lumot chet elda |
| Latency (Toshkent → Frankfurt) | ~80-120 ms RTT (**o'lchanishi kerak**) |
| Managed servis | To'liq: RDS, ElastiCache, EKS, S3 |
| Operatsion yuk | Past |
| Terraform | To'liq qo'llab-quvvatlanadi |

Latency shaxmat uchun muhim: bullet o'yinda (1+0) har 100 ms sezilarli.
Lekin taymer server-authoritative bo'lgani uchun latency **adolatsizlik**
keltirmaydi — ikkala o'yinchi ham bir xil sharoitda. U faqat *sezgi* (feel)
ni buzadi. Bu real, lekin lokalizatsiya buzilishidan kichikroq muammo.

**Variant C — gibrid**

Shaxsiy ma'lumot (`User`, `Player`, `Student`, `Payment`) O'zbekistonda,
shaxssiz ma'lumot (PGN arxiv, puzzle bazasi, statik asset, CDN) tashqarida.

| Jihat | Baho |
|-------|------|
| Lokalizatsiya | Mos, agar chegara to'g'ri chizilsa |
| Murakkablik | **Eng yuqori** — ikki muhit, tarmoq, ikki IaC |
| Xavf | Chegara noaniq bo'lsa — qonun buzilishi jimgina sodir bo'ladi |

Gibrid'ning yashirin xavfi: "PGN shaxsiy ma'lumot emas" degan da'vo
mo'rt. PGN'da o'yinchi ism-familiyasi bor (`[White "Abdusattorov, Nodirbek"]`).
Ya'ni PGN arxivi ham shaxsiy ma'lumotga aylanadi. Chegarani chizish
texnik masala emas, huquqiy masala.

### 5.3 Qaror

**Yo'nalish (majburiy emas, tavsiya): Variant A — mahalliy data-center,
asosiy ma'lumotlar uchun.** CDN va statik asset uchun gibrid element
(10-bo'lim) qabul qilinadi, lekin faqat shaxssiz kontent uchun.

**HALOL OGOHLANTIRISH:** Bu **yakuniy qaror emas.** Yakuniy tanlov ikki
narsaga bog'liq va ularning ikkalasi ham hali mavjud emas:

1. **Yurist tasdig'i.** Qaysi ma'lumot toifasi qat'iy lokalizatsiya talab
   qiladi, PGN va reyting tarixi qaysi toifaga kiradi, B2G shartnomasi
   qanday qo'shimcha talab qo'yadi — bularni faqat O'zbekiston ma'lumotlar
   himoyasi bo'yicha yurist aytadi. **Bu qaror muhandis tomonidan
   qabul qilinmaydi.**
2. **Provayder due diligence.** Mahalliy data-center'lardan qaysi biri
   real SLA, managed PostgreSQL, avtomatik backup, va Terraform provider
   taklif qiladi — bu **so'rov va sinov bilan aniqlanadi**. Hozircha
   bu haqda ishonchli ma'lumot yo'q va uni taxmin qilish xato bo'lardi.

Shu ikki narsa aniqlangunga qadar arxitektura **provayderga bog'lanmaydi**:
- Faqat standart API'lar (S3 protokoli, PostgreSQL wire protocol, K8s)
- Hech qanday provayder-spetsifik managed servis (masalan, AWS Aurora'ning
  o'ziga xos xususiyatlari, GCP Spanner) ishlatilmaydi
- Object storage `S3Client` interfeysi ortida — MinIO ham, AWS S3 ham,
  mahalliy S3-mos storage ham bir xil kod bilan ishlaydi

Bu "kech qaror qabul qilish" (deferred decision) — arxitektura tanlovni
ochiq qoldiradi, lekin bepul emas: managed servis'dan voz kechish operatsion
yukni oshiradi. Bu ongli savdo.

---

## 6. Ma'lumotlar bazasi

### 6.1 Connection pooling (PgBouncer)

Muammo: PostgreSQL'da har bir ulanish — alohida OS protsessi (~5-10 MB).
Node.js pod'i 20 ta ulanish ochsa, 20 pod = 400 ta ulanish = PostgreSQL bo'g'iladi.

Yechim: PgBouncer `transaction` rejimida.

```ini
# pgbouncer.ini
[databases]
farzin = host=postgres-primary port=5432 dbname=farzin_prod
farzin_ro = host=postgres-replica port=5432 dbname=farzin_prod

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# transaction rejimi: ulanish har tranzaksiya oxirida pool'ga qaytariladi.
# session rejimidan ancha samarali, lekin cheklovlari bor (quyida).
pool_mode = transaction

max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
server_idle_timeout = 60
```

**`transaction` rejimining cheklovlari — bu muhim va ko'pincha unutiladi:**

- `PREPARE` / prepared statement'lar ulanishlar orasida ishlamaydi.
  Prisma buni biladi va `pgbouncer=true` parametri bilan moslashadi:
  ```
  DATABASE_URL="postgresql://farzin:***@pgbouncer:6432/farzin?pgbouncer=true&connection_limit=10"
  ```
- `LISTEN` / `NOTIFY` ishlamaydi. Farzin buni ishlatmaydi — pub/sub Redis'da.
- Session-level `SET` yo'qoladi. Advisory lock ehtiyot bilan ishlatilishi kerak.

Bu oxirgisi Farzin uchun tegishli: pairing job'i bitta turnir raundida
faqat bitta marta ishlashini kafolatlash uchun advisory lock kerak.
Yechim — lock'ni tranzaksiya doirasida olish (`pg_advisory_xact_lock`),
u tranzaksiya tugashi bilan avtomatik ozod bo'ladi:

```typescript
// src/pairing/pairing.lock.ts
/**
 * Raund juftlashtirilishi uchun eksklyuziv lock. pg_advisory_xact_lock
 * tranzaksiya oxirida avtomatik ozod bo'ladi — bu PgBouncer transaction
 * rejimida yagona xavfsiz advisory lock varianti.
 */
export async function withRoundLock<T>(
  prisma: PrismaClient,
  roundId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // UUID'dan barqaror 64-bitli kalit hosil qilamiz
    const [{ key }] = await tx.$queryRaw<Array<{ key: bigint }>>`
      SELECT hashtextextended(${roundId}, 0) AS key
    `;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
    return fn(tx);
  });
}
```

### 6.2 Read replica — qachon kerak

Read replica **birinchi kundan kerak emas.** Uni erta qo'shish — bu
replication lag muammosini bepul olish va foyda ko'rmaslik.

Replica quyidagi **o'lchanadigan signal** paydo bo'lganda qo'shiladi:

- Primary'da CPU barqaror 60%+ va so'rovlarning katta qismi `SELECT`
- `pg_stat_statements` ko'rsatadi: og'ir o'qish so'rovlari (turnir jadvali,
  reyting ro'yxati, PGN arxiv qidiruvi) yozish so'rovlarini bloklayapti
- Yuklama testida (katta turnir ro'yxati stsenariysi) primary bo'g'iladi

Qaysi so'rovlar replica'ga ketishi mumkin — bu **replication lag'ga
chidamlilik** bilan aniqlanadi:

| So'rov | Replica'ga mumkinmi | Sabab |
|--------|---------------------|-------|
| Turnir kalendari, ommaviy ro'yxat | Ha | Bir necha soniya eskilik zararsiz |
| Reyting ro'yxati (`RatingHistory` o'qish) | Ha | Rating period baribir kunlik |
| PGN arxiv qidiruvi | Ha | Statik ma'lumot |
| Hisobot / analytics | Ha | Aynan shu uchun replica kerak |
| Pairing hisobi | **Yo'q** | Eskirgan `GameResult` = noto'g'ri juftlik |
| Natija kiritish (arbiter) | **Yo'q** | Read-after-write kerak |
| To'lov / ledger | **Yo'q** | Moliyaviy izchillik |
| Auth / sessiya | **Yo'q** | Ro'yxatdan o'tgan foydalanuvchi darhol kira olsin |

Prisma'da bu `@prisma/extension-read-replicas` bilan amalga oshiriladi,
lekin **default primary bo'ladi** va replica faqat aniq belgilangan
so'rovlarda ishlatiladi. Teskarisi (default replica) — jimgina xatolar manbai.

### 6.3 Backup strategiyasi

**Uch qatlam:**

1. **Continuous WAL archiving + PITR** (asosiy). `pgBackRest` yoki
   `wal-g` bilan WAL segmentlari S3-mos storage'ga uzluksiz yuboriladi.
2. **Kunlik to'liq base backup.** Saqlash muddati: 30 kun.
3. **Oylik arxiv backup.** Saqlash muddati: 12 oy (audit va B2G shartnoma talabi —
   aniq muddat [10-security.md](./10-security.md) va shartnoma bilan belgilanadi).

**RPO/RTO maqsadlari:**

| Ko'rsatkich | Maqsad | Izoh |
|-------------|--------|------|
| RPO (Recovery Point Objective) | ≤ 5 daqiqa | WAL archive_timeout = 60s bilan amalda kichikroq |
| RTO (Recovery Time Objective) | ≤ 2 soat | **Bu maqsad — DR mashqida o'lchanadi (12-bo'lim)** |

RTO — eng ko'p yolg'on gapiriladigan raqam. "2 soat" deb yozib qo'yish oson,
lekin u faqat **haqiqiy tiklash mashqi bilan o'lchanganda** ma'noga ega.
Birinchi DR mashqidan keyin bu raqam yuqoriga tuzatilishi ehtimoli katta —
va bu normal. Yolg'on RTO real RTO'dan yomonroq.

Turnir vaqtida RPO talabi qattiqroq. Yo'qolgan 5 daqiqa — bu yo'qolgan
raund natijalari, va ularni qayta tiklash mumkin emas (qog'oz protokol
bo'lmasa). Shuning uchun: **jonli turnir vaqtida `synchronous_commit = on`
va sinxron replica** — yozish sekinlashadi, lekin natija yo'qolmaydi.
Bu savdo ongli.

### 6.4 Migration va zero-downtime deploy

Bu Farzin'da alohida e'tibor talab qiladi, chunki deploy vaqtida
**eski va yangi kod versiyasi bir vaqtda ishlaydi** (RollingUpdate).
Ya'ni schema ikkala versiyaga ham mos bo'lishi shart.

**Expand-contract (parallel change) pattern** — uch bosqichli:

```mermaid
sequenceDiagram
    participant D as Deploy
    participant DB as PostgreSQL
    participant A as App (eski)
    participant B as App (yangi)

    Note over D,DB: 1-BOSQICH: EXPAND
    D->>DB: Migration: yangi ustun qo'shish (NULLABLE)
    Note over A: Eski kod ishlayapti — yangi ustunni ko'rmaydi
    D->>B: Deploy: yangi kod ikkala ustunga yozadi
    Note over B: dual-write davri

    Note over D,DB: 2-BOSQICH: BACKFILL
    D->>DB: Batch job: eski ma'lumotni yangi ustunga ko'chirish
    Note over DB: Kichik batch, lock'siz

    Note over D,DB: 3-BOSQICH: CONTRACT
    D->>B: Deploy: kod faqat yangi ustunni o'qiydi/yozadi
    D->>DB: Migration: eski ustunni o'chirish (keyingi relizda)
```

Amaliy misol — `Player.national_id` ustunini `Player.uzb_national_id`ga
qayta nomlash. **Hech qachon `ALTER TABLE ... RENAME COLUMN` qilinmaydi**,
chunki u eski kod'ni bir zumda buzadi.

```sql
-- Reliz N: EXPAND
-- prisma/migrations/20260715_add_uzb_national_id/migration.sql
ALTER TABLE players ADD COLUMN uzb_national_id VARCHAR(20);
CREATE INDEX CONCURRENTLY idx_players_uzb_national_id
  ON players (uzb_national_id) WHERE uzb_national_id IS NOT NULL;
```

```sql
-- Reliz N+1: CONTRACT (backfill tugagandan keyin)
ALTER TABLE players DROP COLUMN national_id;
```

**Migratsiya uchun qattiq qoidalar:**

1. **`CREATE INDEX CONCURRENTLY`** — oddiy `CREATE INDEX` jadvalni yozish
   uchun bloklaydi. Katta `game_results` jadvalida bu daqiqalarga cho'zilishi
   mumkin. Prisma bu buyruqni tranzaksiya ichida bajarolmaydi, shuning uchun
   migration faylida alohida ajratiladi.
2. **`NOT NULL` ustun darhol qo'shilmaydi.** Avval nullable, backfill, keyin
   `SET NOT NULL` (PostgreSQL 12+ da `NOT VALID` constraint + `VALIDATE`
   bilan lock'siz).
3. **Migration deploy'dan OLDIN ishlaydi**, ilova bilan bir vaqtda emas.
   K8s'da bu `initContainer` emas — Helm hook yoki alohida Job:

```yaml
# k8s/base/migrate-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: farzin-migrate-__TAG__
  annotations:
    # Deployment yangilanishidan oldin ishlaydi
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  backoffLimit: 0        # Migration retry qilinmaydi — qo'lda tekshirilsin
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ghcr.io/sarvarbek0704/farzin:__TAG__
          command: ["npx", "prisma", "migrate", "deploy"]
          envFrom:
            - secretRef:
                name: farzin-secrets
```

`initContainer` ishlatilmaydi, chunki 3 replica bo'lsa migration 3 marta
parallel ishga tushadi. Prisma advisory lock bilan buni ushlaydi, lekin
bunga tayanish shart emas — alohida Job aniqroq.

4. **Har bir migration'da rollback rejasi bo'lsin.** Prisma `migrate deploy`
   avtomatik rollback qilmaydi. Buzuvchi migration uchun teskari SQL
   qo'lda yozilib, migration fayl yonida `rollback.sql` sifatida saqlanadi.
   Bu — hujjat, avtomatika emas.

---

## 7. CI/CD

### 7.1 Branch strategiyasi

**Tanlov: trunk-based development.**

Sabab:
- Jamoa bir kishi ([14-roadmap.md](./14-roadmap.md)). GitFlow'ning `develop`,
  `release/*`, `hotfix/*` shoxlari ko'p kishilik jamoada reliz koordinatsiyasi
  uchun kerak. Bir kishida ular faqat marosim (ceremony) — foyda nol,
  merge konflikt xarajati real.
- Feature flag bilan birga trunk-based tugallanmagan ishni ham `main`ga
  qo'yish imkonini beradi (o'chirilgan flag ortida). Bu uzoq yashaydigan
  branch'lardan yaxshiroq — uzoq branch = katta merge = katta xavf.

Amalda:
- `main` — har doim deploy qilinadigan holatda
- Qisqa umrli branch: `feat/swiss-transposition`, umri **≤ 2-3 kun**
- Har PR — CI to'liq o'tishi + o'zini review (bir kishi bo'lsa ham
  diff'ni PR ko'rinishida o'qish xatoni topadi)
- `main`ga merge → `staging`ga avtomatik deploy
- Semantik teg (`v1.4.0`) → production'ga deploy (qo'lda approve bilan)

**Istisno:** pairing va rating modullari uchun (`05-pairing-engine.md`,
`06-rating-system.md`) branch uzunroq bo'lishi mumkin, chunki ular
golden test to'plami bilan birga yetkaziladi va yarim ishlaydigan
Swiss engine feature flag ortida ham xavfli. Bu ongli istisno.

### 7.2 Pipeline

```mermaid
graph LR
    P[push / PR] --> L[lint]
    P --> T[typecheck]
    L --> U[unit test]
    T --> U
    U --> I[integration test<br/>Testcontainers]
    I --> B[build image]
    B --> S[security scan<br/>Trivy + npm audit]
    S --> E[e2e test<br/>Supertest]
    E --> PV{PR?}
    PV -->|ha| PRE[preview env]
    PV -->|yo'q, main| ST[deploy staging]
    ST --> SM[smoke test]
    SM --> TG{tag?}
    TG -->|ha| APR[qo'lda approve]
    APR --> PR2[deploy production<br/>canary]
```

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  # Bir branch'da eski run'lar bekor qilinadi — CPU daqiqasi tejaladi
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'

jobs:
  # ---- Tez bosqichlar: parallel, sekundlar ichida javob ----
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      # strict mode — CANON 4. Hech qanday `any` yashirin o'tmasin.
      - run: npx tsc --noEmit

  unit:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run test:unit -- --coverage --maxWorkers=2
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-unit
          path: coverage/

  # ---- Sekin bosqich: real DB bilan ----
  integration:
    runs-on: ubuntu-latest
    needs: [unit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      # Testcontainers Docker'ni o'zi boshqaradi — service container kerak emas.
      # Sabab: 13-testing-strategy.md 3-bo'lim.
      - run: npm run test:integration
        env:
          TESTCONTAINERS_RYUK_DISABLED: 'false'

  build:
    runs-on: ubuntu-latest
    needs: [integration]
    permissions:
      contents: read
      packages: write
    outputs:
      digest: ${{ steps.push.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: push
        uses: docker/build-push-action@v5
        with:
          context: .
          target: runtime
          push: true
          tags: ghcr.io/sarvarbek0704/farzin:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true      # SLSA attestation
          sbom: true            # Software Bill of Materials

  security:
    runs-on: ubuntu-latest
    needs: [build]
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      # 1. Dependency zaifliklari
      - run: npm audit --audit-level=high
        continue-on-error: true   # audit shovqinli — bloklamaydi, xabar beradi
      # 2. Image qatlamlari (OS paketlari)
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/sarvarbek0704/farzin:${{ github.sha }}
          format: sarif
          output: trivy.sarif
          severity: 'CRITICAL,HIGH'
          exit-code: '1'          # CRITICAL/HIGH — bloklaydi
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy.sarif
      # 3. Sirlar kodga tushib qolmaganini tekshirish
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  e2e:
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: docker compose -f docker-compose.ci.yml up -d --wait
      - run: npm run test:e2e
      - if: failure()
        run: docker compose -f docker-compose.ci.yml logs
```

`npm audit` `continue-on-error: true` bilan — bu ongli qaror. `npm audit`
transitiv dependency'lardagi, real hujum yo'li bo'lmagan zaifliklarni ham
CRITICAL deb belgilaydi. Agar u bloklasa, jamoa uni e'tiborsiz qoldirishni
o'rganadi — bu esa haqiqiy zaiflikni ham o'tkazib yuboradi. Trivy esa
image qatlamidagi zaifliklarni ko'rsatadi va u **bloklaydi**.

### 7.3 Preview environment

Har bir PR uchun izolyatsiya qilingan muhit. Sabab: pairing yoki
arbiter console o'zgarishini real hakamga ko'rsatish uchun "mening
mashinamda ishlaydi" yetarli emas.

```yaml
# .github/workflows/preview.yml (fragment)
  preview:
    if: github.event_name == 'pull_request'
    needs: [build]
    runs-on: ubuntu-latest
    environment:
      name: preview-pr-${{ github.event.number }}
      url: https://pr-${{ github.event.number }}.preview.farzin.uz
    steps:
      - uses: actions/checkout@v4
      - name: Deploy preview namespace
        run: |
          NS="preview-pr-${{ github.event.number }}"
          kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
          # Har preview o'z DB'siga ega — PR'lar bir-birini buzmasin
          helm upgrade --install "farzin-$NS" ./charts/farzin \
            --namespace "$NS" \
            --set image.tag=${{ github.sha }} \
            --set postgresql.enabled=true \
            --set ingress.host="pr-${{ github.event.number }}.preview.farzin.uz" \
            --set replicaCount=1 \
            --wait --timeout 10m
      - name: Seed demo tournament
        run: kubectl exec -n "preview-pr-${{ github.event.number }}" \
             deploy/farzin-api -- node dist/scripts/seed-demo.js
```

Preview namespace PR yopilganda o'chiriladi (alohida workflow, `on: pull_request: types: [closed]`).
Qo'shimcha xavfsizlik: namespace'lar 7 kundan keyin avtomatik tozalanadi
(cron job) — unutilgan PR resurs yeb yotmasin.

**Muhim cheklov:** preview muhitida **real to'lov provayderi yo'q** va
**real SMS yuborilmaydi.** Barcha tashqi integratsiya sandbox/stub rejimida.
Preview'da real Click sandbox'ini ishlatish mumkin, lekin production
kalitlari hech qachon preview namespace'ga bermaydi.

---

## 8. Deployment strategiyasi

### 8.1 Canary vs blue-green

**Blue-green:** ikki to'liq muhit, trafik bir zumda almashadi.
Ustunligi — rollback bir zumda. Kamchiligi — ikki barobar resurs, va
DB bitta bo'lgani uchun schema muammosi baribir qoladi (6.4-bo'lim).

**Canary:** yangi versiya trafikning kichik ulushini oladi, metrikalar
kuzatiladi, muvaffaqiyatli bo'lsa ulush oshiriladi.

**Qaror: canary.**

Sabab — Farzin'ning eng katta xavfi "ilova ishga tushmadi" emas (buni
readiness probe darhol ushlaydi), balki **jimgina noto'g'ri xatti-harakat**:
Swiss pairing biroz noto'g'ri juftlik chiqaradi, Glicko-2 hisobida sigma
konvergensiyasi buziladi, taymer 50 ms drift beradi. Bularni faqat real
trafikda, metrikalarni kuzatib aniqlash mumkin. Blue-green'ning "hammasi
yoki hech narsa" almashinuvi bunga imkon bermaydi.

```yaml
# k8s/rollout.yaml — Argo Rollouts
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: farzin-api
spec:
  replicas: 6
  strategy:
    canary:
      canaryService: farzin-api-canary
      stableService: farzin-api-stable
      trafficRouting:
        nginx:
          stableIngress: farzin-api
      steps:
        - setWeight: 5
        - pause: { duration: 10m }      # metrikalarni kuzatish
        - analysis:
            templates:
              - templateName: farzin-canary-health
        - setWeight: 25
        - pause: { duration: 15m }
        - analysis:
            templates:
              - templateName: farzin-canary-health
        - setWeight: 50
        - pause: { duration: 15m }
        - setWeight: 100
```

```yaml
# k8s/analysis-template.yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: farzin-canary-health
spec:
  metrics:
    - name: error-rate
      interval: 1m
      count: 5
      # Xato ulushi 1% dan oshsa — avtomatik rollback.
      # 1% — boshlang'ich qiymat, real baseline o'lchangandan keyin tuzatiladi.
      successCondition: result[0] < 0.01
      failureLimit: 1
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            sum(rate(http_requests_total{job="farzin-api",status=~"5..",version="canary"}[2m]))
            /
            sum(rate(http_requests_total{job="farzin-api",version="canary"}[2m]))

    - name: move-latency-p95
      interval: 1m
      count: 5
      # Yurish latency'si — 15-observability.md 6-bo'limdagi SLO bilan bog'liq
      successCondition: result[0] < 0.15
      failureLimit: 1
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            histogram_quantile(0.95,
              sum(rate(farzin_move_processing_duration_seconds_bucket{version="canary"}[2m]))
              by (le))
```

Canary'ning **jiddiy cheklovi**: WebSocket ulanishlari uzoq yashaydi.
"5% trafik" HTTP so'rovlar uchun ishlaydi, lekin mavjud WebSocket ulanishi
yangi pod'ga o'tmaydi — u eski pod'da qoladi. Ya'ni canary faqat **yangi**
ulanishlarni oladi. Bu shuni anglatadiki, jonli o'yin kodidagi regressiya
canary'da sekin ko'rinadi. Buning uchun:

- Canary bosqichlari uzunroq (10-15 daqiqa, yuqoridagi konfigda)
- `play` moduliga tegadigan reliz **turnir bo'lmagan vaqtda** chiqariladi
- Sintetik canary o'yini: har daqiqada bot ikkita ulanish ochib, o'yin
  o'ynaydi va `farzin_synthetic_game_success` metrikasini yozadi

### 8.2 Rollback

| Nosozlik turi | Rollback usuli | Vaqt |
|---------------|----------------|------|
| Canary metrikasi buzildi | Argo Rollouts avtomatik abort | < 1 daqiqa |
| Kod bug, schema tegmagan | `kubectl argo rollouts undo` | ~2 daqiqa |
| Kod bug, schema o'zgargan | **Rollback EMAS** — oldinga tuzatish | O'zgaruvchan |
| Ma'lumot buzildi | PITR (6.3-bo'lim) | RTO ≤ 2 soat (o'lchanadi) |

Uchinchi qator eng muhim. **Migration rollback qilinmaydi.** Agar
expand-contract to'g'ri bajarilgan bo'lsa (6.4-bo'lim), eski kod yangi
schema bilan ishlaydi — demak kod rollback'i xavfsiz. Agar bajarilmagan
bo'lsa, rollback ma'lumot yo'qotadi. Bu — expand-contract'ni majburiy
qiladigan asosiy sabab.

### 8.3 Feature flag bilan bog'liqlik

Deploy ≠ release. Kod production'da bo'lishi va o'chirilgan bo'lishi mumkin.

Bu Farzin uchun kritik, chunki eng xavfli modullar (`pairing`, `rating`,
`billing`) aynan flag ortida chiqariladi:

```typescript
// src/admin/feature-flag.service.ts
export type FlagKey =
  | 'pairing.swiss_dutch_v2'
  | 'rating.glicko2_enabled'
  | 'play.matchmaking_v2'
  | 'billing.uzum_provider'
  | 'fairplay.engine_correlation';

@Injectable()
export class FeatureFlagService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Flag holati Redis'da cache'lanadi (TTL 30s), manba — PostgreSQL.
   * scope: global | federation | tournament | user — bosqichma-bosqich
   * yoyish uchun.
   */
  async isEnabled(key: FlagKey, ctx: FlagContext = {}): Promise<boolean> {
    const cached = await this.redis.get(`ff:${key}`);
    if (cached !== null) {
      return this.evaluate(JSON.parse(cached) as FlagRule, ctx);
    }
    const rule = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!rule) return false;   // Noma'lum flag — har doim o'chiq (fail-closed)
    await this.redis.set(`ff:${key}`, JSON.stringify(rule), 'EX', 30);
    return this.evaluate(rule as FlagRule, ctx);
  }

  private evaluate(rule: FlagRule, ctx: FlagContext): boolean {
    if (!rule.enabled) return false;
    if (rule.federationIds?.length && ctx.federationId) {
      return rule.federationIds.includes(ctx.federationId);
    }
    if (rule.rolloutPercent !== undefined && ctx.userId) {
      // Barqaror hash — bir foydalanuvchi har doim bir tomonda qoladi
      return hashToPercent(ctx.userId, rule.key) < rule.rolloutPercent;
    }
    return true;
  }
}
```

Amaliy stsenariy — Swiss Dutch engine'ni chiqarish (Faza 2):

1. Yangi engine kod'i `main`da, flag `pairing.swiss_dutch_v2` = off
2. Shadow mode: ikkala engine ishlaydi, natijalar solishtiriladi,
   farq log'ga yoziladi — lekin **eski engine natijasi ishlatiladi**
3. Farq nolga tushgach: bitta kichik turnirda flag yoqiladi
   (`federationIds: [test-federation-id]`)
4. Bir necha turnirdan keyin — global

Flag'lar **doimiy emas.** Har flag'ning `expires_at` sanasi bor va
muddati o'tgan flag CI'da ogohlantirish beradi. Aks holda kod
o'lik shoxlar chakalakzoriga aylanadi.

---

## 9. IaC — Terraform

### 9.1 Struktura

```
infra/
├── modules/
│   ├── network/           # VPC, subnet, security group
│   ├── database/          # PostgreSQL, PgBouncer, replica
│   ├── redis/
│   ├── object-storage/    # S3-mos bucket'lar
│   ├── kubernetes/        # cluster, node pool
│   └── observability/     # Prometheus, Grafana, Loki
├── envs/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   ├── staging/
│   └── production/
└── global/
    ├── dns/
    └── state-backend/     # state uchun bucket va lock jadvali
```

Muhim prinsip: **`envs/*` da mantiq yo'q.** Ular faqat modullarni
parametr bilan chaqiradi. Agar `production/main.tf` da `staging`da
yo'q `if` bo'lsa — staging production'ni sinamayapti degani (1.3-bo'lim).

```hcl
# infra/envs/production/main.tf
module "network" {
  source = "../../modules/network"

  env             = "production"
  cidr_block      = var.cidr_block
  azs             = var.availability_zones
}

module "database" {
  source = "../../modules/database"

  env                    = "production"
  network_id             = module.network.id
  postgres_version       = "17"
  instance_class         = var.db_instance_class
  # Replica production'da bor, staging'da yo'q — bu farq ATAYLAB,
  # lekin u module parametri, kod shoxi emas (6.2-bo'lim).
  read_replica_count     = var.db_read_replica_count
  backup_retention_days  = 30
  pitr_enabled           = true
  # Turnir vaqtida sinxron commit — 6.3-bo'lim
  synchronous_commit     = "on"
}

module "kubernetes" {
  source = "../../modules/kubernetes"

  env        = "production"
  network_id = module.network.id

  node_pools = {
    general = {
      instance_type = var.k8s_general_instance_type
      min_size      = 3
      max_size      = 10
    }
    # Fair-play Stockfish tahlili uchun alohida pool (4.6-bo'lim).
    # CPU-optimized, taint bilan — boshqa pod'lar bu yerga tushmasin.
    analysis = {
      instance_type = var.k8s_analysis_instance_type
      min_size      = 0        # kerak bo'lmasa nol — xarajat tejash
      max_size      = 5
      taints = [{
        key    = "workload"
        value  = "analysis"
        effect = "NO_SCHEDULE"
      }]
    }
  }
}
```

`instance_type` qiymatlari `terraform.tfvars` da va ular **hozircha
belgilanmagan** — chunki hosting provayderi tanlanmagan (5.3-bo'lim).
Modul interfeysi provayder-neytral bo'lishi shu sababdan muhim.

### 9.2 State boshqaruvi

```hcl
# infra/envs/production/backend.tf
terraform {
  required_version = ">= 1.9"

  backend "s3" {
    bucket = "farzin-tfstate-prod"
    key    = "production/terraform.tfstate"
    region = "us-east-1"        # S3-mos storage uchun formal qiymat

    # Mahalliy S3-mos storage uchun (5.3-bo'lim):
    endpoints = {
      s3 = "https://s3.example-provider.uz"    # provayder tanlangach aniqlanadi
    }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true

    encrypt        = true
    use_lockfile   = true        # Terraform 1.9+ — S3 native locking
  }
}
```

**State qoidalari:**

1. **State hech qachon git'ga tushmaydi.** `.gitignore` da `*.tfstate*`.
   State'da parol, connection string, sertifikat bo'ladi — u sir.
2. **State encrypted at rest.** Bucket darajasida shifrlash + versioning yoqilgan.
3. **Locking majburiy.** Ikki `terraform apply` bir vaqtda ishlasa state buziladi.
4. **Har muhit — alohida state.** `dev`dagi xato `production`ga tegmasin.
5. **`terraform apply` faqat CI'dan.** Lokal `apply` production'da taqiqlanadi
   (IAM policy darajasida). Sabab: lokal apply audit izi qoldirmaydi.

```yaml
# .github/workflows/terraform.yml (fragment)
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform -chdir=infra/envs/${{ inputs.env }} init
      - run: terraform -chdir=infra/envs/${{ inputs.env }} plan -out=tfplan
      # Plan PR kommentiga chiqadi — o'zgarish ko'rinmay o'tmasin
      - uses: actions/github-script@v7
        with:
          script: |
            const plan = require('child_process')
              .execSync('terraform -chdir=infra/envs/${{ inputs.env }} show -no-color tfplan')
              .toString();
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '```terraform\n' + plan.slice(0, 60000) + '\n```',
            });

  apply:
    needs: [plan]
    if: github.ref == 'refs/heads/main'
    environment: ${{ inputs.env }}      # GitHub environment — qo'lda approve
    runs-on: ubuntu-latest
    steps:
      - run: terraform -chdir=infra/envs/${{ inputs.env }} apply -auto-approve tfplan
```

**Drift detection:** har kuni cron `terraform plan` ishga tushadi. Agar
plan bo'sh bo'lmasa — kimdir qo'lda o'zgartirish kiritgan. Bu alert
beradi ([15-observability.md](./15-observability.md) 6-bo'lim).

---

## 10. CDN va statik kontent

### 10.1 Nima S3'da, nima CDN ortida

| Kontent | Storage | CDN | Cache siyosati |
|---------|---------|-----|----------------|
| Avatar (`farzin-avatars`) | S3 | Ha | `public, max-age=31536000, immutable` (hash nom) |
| PGN arxiv (`farzin-pgn`) | S3 | Ha | `public, max-age=86400` |
| Hisobot (`farzin-reports`) | S3 | **Yo'q** | Signed URL, `private, no-store` |
| Next.js statik asset | S3 | Ha | `public, max-age=31536000, immutable` |
| Puzzle rasm/FEN | S3 | Ha | `public, max-age=604800` |
| Turnir jadvali (API) | — | Qisman | `public, max-age=30, stale-while-revalidate=300` |
| Jonli tablo (WebSocket) | — | **Yo'q** | Real-time |

Hisobotlar CDN'ga **qo'yilmaydi** — ular shaxsiy ma'lumot (o'yinchi ro'yxati,
to'lov hisoboti). Ular signed URL (TTL 15 daqiqa) bilan to'g'ridan-to'g'ri
S3'dan beriladi.

### 10.2 PGN arxiv

PGN — Farzin'ning eng katta o'sadigan ma'lumoti. Har turnir har raundda
har taxta uchun bitta PGN. 500 o'yinchili turnir × 9 raund = ~2250 o'yin.

PGN'lar **DB'da saqlanmaydi** (matn ustuni sifatida) — S3'da fayl sifatida.
DB'da faqat metadata va S3 kaliti:

```typescript
// prisma/schema.prisma (fragment)
model GameResult {
  id            String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  pairingId     String   @map("pairing_id") @db.Uuid
  result        GameResultCode
  // PGN matnining o'zi emas — S3'dagi kalit.
  // Sabab: PGN 2-10 KB, million o'yin = 10 GB DB'da. S3 arzonroq
  // va PGN hech qachon WHERE shartida ishlatilmaydi.
  pgnObjectKey  String?  @map("pgn_object_key")
  moveCount     Int      @map("move_count")
  ecoCode       String?  @map("eco_code") @db.VarChar(3)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@index([pairingId])
  @@map("game_results")
}
```

Turnir tugagach, butun turnir uchun bitta birlashtirilgan PGN fayli
generatsiya qilinadi (BullMQ job) va CDN ortiga qo'yiladi — chunki
turnir natijalari sahifasi eng ko'p yuklanadigan sahifa bo'ladi
va har safar 2250 ta obyektni yig'ish ma'nosiz.

**Lokalizatsiya eslatmasi:** PGN'da o'yinchi ismi bor, demak u shaxsiy
ma'lumot bo'lishi mumkin (5.2-bo'lim). Shuning uchun PGN CDN'i
**geografik cheklovga** ega bo'lishi kerakmi — bu yurist savoli,
muhandis savoli emas. Hozircha PGN storage'i asosiy S3'da (O'zbekistonda)
qoladi, CDN faqat cache qatlami sifatida ishlaydi.

---

## 11. Xarajat baholash

**HALOL: bu bo'limda aniq raqam yo'q va bo'lishi ham mumkin emas.**

Sabab oddiy: xarajat = birlik narx × hajm. Birlik narx hosting
provayderiga bog'liq (5.3-bo'lim — tanlanmagan). Hajm — real yuklamaga
bog'liq (o'lchanmagan). Ikkala noma'lumni ko'paytirib chiqqan raqam
ma'lumot emas, shovqin. Bunday raqam yozish — o'zini ham, o'quvchini
ham aldash.

Buning o'rniga — **xarajat drayverlari** va ular qanday o'lchanishi.

### 11.1 Drayverlar

**1. Compute (API pod'lari)**
Drayver: bir vaqtdagi WebSocket ulanishlari + HTTP RPS.
O'lchov: k6 testida bitta pod nechta concurrent o'yinni p95 < 150 ms
bilan eplashi ([13-testing-strategy.md](./13-testing-strategy.md) 7-bo'lim).
Keyin: kerakli pod = kutilgan pik ÷ pod sig'imi.

**2. PostgreSQL**
Drayver: yozish IOPS (natija kiritish, `Move` jadvali) + ma'lumot hajmi + replica.
`Move` jadvali eng tez o'sadi: onlayn o'yin o'rtacha ~80 yurish (**bu taxmin,
real ma'lumot bilan tekshiriladi**). Kunlik 10 000 o'yin = 800 000 qator/kun.
O'lchov: birinchi oydan keyin `pg_total_relation_size` o'sish tezligi.

**3. Bandwidth**
Drayver: WebSocket xabar hajmi × ulanish × davomiylik + PGN/CDN yuklab olish.
Shaxmat yurishi kichik (~100-200 bayt JSON), lekin ular ko'p va uzoq
sessiyada yig'iladi. Jonli tablo (broadcast, Faza 8) katta turnirda
har yurishni yuzlab tomoshabinga uzatadi — bu bandwidth'ning eng
qimmat qismi bo'lishi mumkin.
O'lchov: `farzin_websocket_bytes_sent_total` metrikasi.

**4. Stockfish tahlili — eng katta noaniqlik**
Drayver: tahlil qilinadigan o'yin soni × yurish soni × har yurishga
sarflanadigan chuqurlik (depth) yoki node limiti.

Bu **eng og'ir CPU iste'molchisi** va uni yengil baholab bo'lmaydi.
Bitta o'yinni depth 20 da to'liq tahlil qilish bir CPU yadrosida
sekundlar-daqiqalar oladi (aniq raqam Stockfish 17 NNUE bilan
**benchmark qilinishi kerak** — u pozitsiya murakkabligiga bog'liq
va o'rtacha qiymat yolg'on bo'ladi).

Agar har o'yin tahlil qilinsa, tahlil xarajati butun qolgan
infratuzilmadan qimmat bo'lishi mumkin. Shuning uchun fair-play
moduli (Faza 6) **hammani emas, tanlab tahlil qiladi**:
- Shubha signali bo'lganda (g'ayrioddiy natija, reyting sakrashi)
- Tasodifiy sampling (deterrent effekti uchun)
- Yuqori stavkali turnirlar (pul mukofoti bor)

Bu texnik cheklov emas, **iqtisodiy cheklov** — va u fair-play
siyosatiga to'g'ridan-to'g'ri ta'sir qiladi.

**5. Object storage**
Drayver: PGN arxiv o'sishi + avatar + hisobot. Bu eng arzon va eng
oldindan aytsa bo'ladigan qism. PGN ~2-10 KB, chiziqli o'sadi.

**6. Observability**
Drayver: log hajmi (eng katta), metrika kardinalligi, trace sampling.
Bu **jimgina qimmatlashadigan** qism. Yuqori kardinallikli metrika
(masalan `tournament_id` label) Prometheus'ni portlatadi.
Ehtiyot choralari [15-observability.md](./15-observability.md) 3-bo'limda.

### 11.2 Qachon raqam bo'ladi

Xarajat modeli quyidagilar tayyor bo'lgach tuziladi:

1. Yuklama testi natijalari (Faza 5 oxiri, [14-roadmap.md](./14-roadmap.md))
2. Hosting provayderi tanlangan va narx varaqasi olingan (5.3-bo'lim)
3. Birinchi 3 oylik real telemetriya

**Shundan oldin aytilgan har qanday raqam — taxmin, va uni byudjetga
qo'yish xato.** Bu hujjat bunday raqamni ataylab bermaydi.

Bitta ishonchli sifatiy da'vo: **bu bozorda infratuzilma xarajati
asosiy xarajat emas.** [CANON 2] ga ko'ra realistik shift 100-300k
ro'yxatdan o'tgan, 10-30k oylik faol foydalanuvchi. Bu hajm zamonaviy
hardware uchun kichik. Asosiy xarajat — muhandis vaqti.

---

## 12. Disaster recovery

### 12.1 Nimadan tiklanamiz

| Ssenariy | Ehtimollik | Ta'sir | Yechim |
|----------|-----------|--------|--------|
| Pod crash | Yuqori | Yo'q (replica bor) | K8s avtomatik restart |
| Node yo'qolishi | O'rta | Yo'q | topologySpread + PDB |
| PostgreSQL primary yo'qolishi | Past | Yuqori | Replica'ga failover |
| Ma'lumot buzilishi (bug/inson) | Past | **Juda yuqori** | PITR |
| Butun region/DC yo'qolishi | Juda past | Kritik | Off-site backup + qayta qurish |
| Ransomware / backup buzilishi | Juda past | Kritik | Immutable backup (object lock) |
| Turnir o'rtasida to'liq uzilish | Past | **Reputatsion kritik** | Alohida runbook (12.4) |

To'rtinchi qator eng jiddiy. HA (high availability) ma'lumot buzilishidan
himoya qilmaydi — buzilgan ma'lumot replica'ga ham bir zumda ko'chadi.
Faqat backup himoya qiladi.

Oltinchi qator uchun: backup bucket'ida **object lock (WORM)** yoqiladi —
backup yozilgandan keyin belgilangan muddat (30 kun) davomida uni
o'chirib bo'lmaydi, hatto administrator ham. Bu ransomware'ning
"backup'ni ham shifrlash" taktikasiga qarshi.

### 12.2 Tiklashni sinash jadvali

**Sinovdan o'tmagan backup — backup emas, u faqat umid.**

| Mashq | Chastota | Kim | Muvaffaqiyat mezoni |
|-------|----------|-----|---------------------|
| Backup fayl butunligi (checksum) | Har kuni, avtomatik | CI cron | Checksum mos, alert yo'q |
| Staging'ga to'liq restore | Har hafta, avtomatik | CI cron | Restore o'tdi, smoke test yashil |
| PITR — belgilangan vaqtga tiklash | Har oy, qo'lda | On-call | Tanlangan timestamp'ga aniq tiklandi |
| To'liq DR mashqi (region yo'q) | Har chorak, qo'lda | Jamoa | RTO o'lchandi va qayd etildi |
| Runbook o'qish/yangilash | Har chorak | Jamoa | Runbook joriy holatga mos |

Haftalik avtomatik restore eng qimmatli qism, chunki u inson ishtirokisiz
ishlaydi va shuning uchun haqiqatan bajariladi:

```yaml
# .github/workflows/dr-restore-drill.yml
name: DR — Weekly restore drill

on:
  schedule:
    - cron: '0 2 * * 0'    # Yakshanba 02:00 UTC
  workflow_dispatch:

jobs:
  restore:
    runs-on: ubuntu-latest
    timeout-minutes: 180
    steps:
      - uses: actions/checkout@v4

      - name: Restore latest production backup into scratch DB
        run: |
          START=$(date +%s)
          pgbackrest --stanza=farzin-prod --type=default \
            --target-timeline=current \
            --pg1-path=/var/lib/postgresql/restore \
            restore
          END=$(date +%s)
          echo "RESTORE_SECONDS=$((END - START))" >> "$GITHUB_ENV"

      - name: Verify data integrity
        run: |
          # Kutilgan invariantlar — bo'sh restore "muvaffaqiyat" hisoblanmasin
          psql "$SCRATCH_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
            DO $$
            DECLARE
              t_count int; p_count int; orphan_count int;
            BEGIN
              SELECT count(*) INTO t_count FROM tournaments;
              SELECT count(*) INTO p_count FROM players;
              IF t_count = 0 OR p_count = 0 THEN
                RAISE EXCEPTION 'Restore bo''sh: tournaments=% players=%', t_count, p_count;
              END IF;

              -- Referensial butunlik: har pairing mavjud raundga tegishli
              SELECT count(*) INTO orphan_count
              FROM pairings p
              LEFT JOIN rounds r ON r.id = p.round_id
              WHERE r.id IS NULL;
              IF orphan_count > 0 THEN
                RAISE EXCEPTION 'Yetim pairing: %', orphan_count;
              END IF;
            END $$;
          SQL

      - name: Run migrations against restored DB
        # Backup eski schema'da bo'lishi mumkin — migration'lar
        # restore ustida ishlashi tekshiriladi.
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ env.SCRATCH_DB_URL }}

      - name: Record RTO metric
        run: |
          cat <<EOF | curl --data-binary @- \
            "$PUSHGATEWAY_URL/metrics/job/dr_drill"
          # TYPE farzin_dr_restore_duration_seconds gauge
          farzin_dr_restore_duration_seconds ${RESTORE_SECONDS}
          # TYPE farzin_dr_drill_success gauge
          farzin_dr_drill_success 1
          EOF

      - name: Alert on failure
        if: failure()
        run: |
          curl -X POST "$ALERT_WEBHOOK" \
            -d '{"severity":"high","text":"Haftalik DR restore mashqi BUZILDI"}'
```

Bu workflow `farzin_dr_restore_duration_seconds` metrikasini yozadi —
ya'ni **RTO taxmin emas, o'lchangan raqam bo'ladi**. 6.3-bo'limdagi
"≤ 2 soat" maqsadi shu metrika bilan har hafta tekshiriladi. Agar
o'lchangan qiymat maqsaddan oshsa, maqsad yolg'on — uni tuzatish
yoki restore'ni tezlashtirish kerak.

### 12.3 Runbook

Har bir DR ssenariysi uchun `docs/runbooks/` da alohida hujjat:

- `runbooks/db-primary-failover.md`
- `runbooks/pitr-restore.md`
- `runbooks/region-loss.md`
- `runbooks/tournament-outage.md`

Runbook qoidalari:
- Har qadamda aniq buyruq (kopi-past qilinadigan), umumiy maslahat emas
- Kimga xabar berish, qachon eskalatsiya qilish
- **Har chorakda o'qib chiqiladi** — eskirgan runbook xavfli, chunki
  odam bosim ostida unga ishonadi

### 12.4 Turnir vaqtidagi uzilish

Bu Farzin uchun alohida ssenariy va u sof texnik emas. Rasmiy turnir
o'rtasida tizim yiqilsa, hakam turnirni davom ettira olishi kerak.

Chora — **degradatsiya rejasi**:

1. **Read-only rejim.** Agar yozish buzilgan bo'lsa, joriy jadval va
   juftliklar hech bo'lmasa ko'rinsin. Ingress darajasida
   read-only ingress'ga o'tish.
2. **Offline eksport.** Har raund juftliklari generatsiya qilinishi
   bilan PDF/PGN sifatida S3'ga yoziladi va hakamga yuboriladi.
   Tizim yiqilsa ham hakamda qog'oz varianti bor. Bu **avtomatik**
   bo'ladi, hakam so'ragandan keyin emas.
3. **Natijani keyin kiritish.** Hakam qog'ozda yozib boradi, tizim
   tiklangach kiritadi. Bu uchun `arbiter` modulida "retroaktiv
   natija kiritish" imkoni bor (audit log bilan, [10-security.md](./10-security.md)).

Bu — "chiroyli" yechim emas, lekin real. Shaxmat turniri 100 yil
kompyuter'siz o'tkazilgan; Farzin turnirni bloklaydigan yagona
nuqta bo'lmasligi kerak.

---

## Ilova: ochiq savollar

Bu hujjatda ataylab hal qilinmagan, tashqi ma'lumot kutayotgan savollar:

| # | Savol | Kimga bog'liq | Bo'lim |
|---|-------|---------------|--------|
| 1 | Qaysi ma'lumot toifasi qat'iy lokalizatsiya talab qiladi? PGN kiradimi? | Yurist | 5.2, 5.3, 10.2 |
| 2 | Mahalliy provayderlarda managed PostgreSQL/K8s bormi, SLA qanday? | Due diligence | 5.2 |
| 3 | Pod boshiga nechta WebSocket ulanishi? | k6 yuklama testi | 4.4 |
| 4 | Stockfish NNUE bilan bitta o'yin tahlili qancha CPU oladi? | Benchmark | 11.1 |
| 5 | Alpine musl libc real latency'ga ta'sir qiladimi? | Yuklama testi | 2.3 |
| 6 | Real RTO qancha? | DR mashqi | 6.3, 12.2 |
| 7 | WebSocket'siz muhitdagi foydalanuvchi ulushi? | Faza 5 telemetriyasi | 4.3 |
| 8 | Resource request/limit qiymatlari? | Profiling | 4.1 |

Bu jadval **hujjatning kuchi, zaifligi emas.** Noma'lumni "aniqlandi"
deb ko'rsatish — eng qimmat texnik qarz turi.
