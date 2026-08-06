import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Muhit o'zgaruvchilari — validatsiya.
 *
 * Tamoyil: noto'g'ri konfiguratsiya bilan ilova ISHGA TUSHMASLIGI kerak.
 * Xato ishga tushish paytida chiqsin, uch oydan keyin prod'da emas.
 *
 * @see docs/10-security.md §8
 */
export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  API_PREFIX = 'api';

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  // --- Ma'lumotlar bazasi -------------------------------------------------
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  // --- Redis --------------------------------------------------------------
  @IsString()
  REDIS_HOST = 'localhost';

  @IsInt()
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsInt()
  REDIS_DB = 0;

  // --- JWT ----------------------------------------------------------------
  /**
   * ⚠️  32 belgi — MINIMUM, tavsiya emas.
   *
   * Eski loyihada kalit `"SMD_access"` edi va u GitHub'ga commit qilingan edi.
   * Bunday kalit HMAC-SHA256 uchun bir necha soatda ochiladi.
   *
   * Generatsiya: openssl rand -base64 64
   */
  @IsString()
  @MinLength(32, {
    message:
      "JWT_ACCESS_SECRET kamida 32 belgi bo'lishi kerak. Generatsiya: openssl rand -base64 64",
  })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, {
    message: "JWT_REFRESH_SECRET kamida 32 belgi bo'lishi kerak va ACCESS dan FARQ qilishi shart",
  })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_TTL = '30d';

  // --- TOTP 2FA (docs/10-security.md §2.5) ---------------------------------
  /**
   * TOTP sirlarini DB'da shifrlash kaliti — AES-256-GCM, 32 bayt (64 hex).
   * Ixtiyoriy: berilmasa 2FA endpointlari ishlamaydi (xato beradi),
   * lekin ilova ishga tushadi. Prod'da admin/hakam rollari uchun 2FA
   * majburiy — kalit ham majburiy bo'ladi.
   */
  @IsString()
  @IsOptional()
  @Matches(/^[0-9a-fA-F]{64}$/, {
    message: 'TOTP_ENCRYPTION_KEY aynan 64 hex belgi (32 bayt). Generatsiya: openssl rand -hex 32',
  })
  TOTP_ENCRYPTION_KEY?: string;

  // --- Argon2id (ADR-0004) ------------------------------------------------
  @IsInt()
  @Min(19456, {
    message:
      "ARGON2_MEMORY_COST kamida 19456 (19 MiB) bo'lishi kerak — OWASP tavsiyasi. " +
      'docs/adr/0004-argon2id-over-bcrypt.md',
  })
  ARGON2_MEMORY_COST = 19456;

  @IsInt()
  @Min(2)
  ARGON2_TIME_COST = 2;

  @IsInt()
  @Min(1)
  ARGON2_PARALLELISM = 1;

  // --- Glicko-2 (ADR-0003) ------------------------------------------------
  /** ⚠️  Yakuniy emas — backtest bilan aniqlanadi. docs/06-rating-system.md */
  @IsInt()
  @IsOptional()
  GLICKO2_DEFAULT_RATING = 1500;

  // --- Play (docs/07-realtime-and-clock.md §3.8) ---------------------------
  /**
   * Diskonnekt grace davri OVERRIDE (ms) — barcha kategoriyalar uchun bitta
   * qiymat. Berilmasa docs/07 §3.8 jadvali ishlaydi (bullet 10s, blitz 15s,
   * rapid 30s, klassik 120s — game-timers.ts). Asosiy iste'molchi:
   * integration testlar (qisqa grace bilan abandonment oqimi) va ops
   * (telemetriyagacha vaqtincha burash).
   */
  @IsInt()
  @Min(500)
  @IsOptional()
  PLAY_DISCONNECT_GRACE_MS?: number;

  // --- Kuzatuv ------------------------------------------------------------
  @IsString()
  LOG_LEVEL = 'info';

  @IsBoolean()
  @IsOptional()
  OTEL_ENABLED = false;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  // --- Rate limiting ------------------------------------------------------
  @IsInt()
  THROTTLE_TTL = 60;

  @IsInt()
  THROTTLE_LIMIT = 300;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  database: { url: string };
  redis: { host: string; port: number; password?: string; db: number };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  totpEncryptionKey?: string;
  observability: { logLevel: string; otelEnabled: boolean; sentryDsn?: string };
  throttle: { ttl: number; limit: number };
  /** Play moduli sozlamalari (docs/07 §3.8). null = hujjat jadvali. */
  play: { disconnectGraceMsOverride: number | null };
}

/** Env'dan raqam sifatida o'qiladigan kalitlar. */
const NUMERIC_KEYS = [
  'PORT',
  'REDIS_PORT',
  'REDIS_DB',
  'ARGON2_MEMORY_COST',
  'ARGON2_TIME_COST',
  'ARGON2_PARALLELISM',
  'GLICKO2_DEFAULT_RATING',
  'PLAY_DISCONNECT_GRACE_MS',
  'THROTTLE_TTL',
  'THROTTLE_LIMIT',
] as const;

/** Env'dan boolean sifatida o'qiladigan kalitlar. */
const BOOLEAN_KEYS = ['OTEL_ENABLED'] as const;

/**
 * process.env qiymatlari HAR DOIM string — aniq koersiya.
 *
 * `enableImplicitConversion` ga ATAYLAB tayanilmaydi: u dist buildda
 * ishonchsiz (reflection metadata'ga bog'liq) va `Boolean('false') === true`
 * tuzog'i bor. Aniq ro'yxat — aniq xatti-harakat.
 */
function coerceEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  for (const key of NUMERIC_KEYS) {
    const value = out[key];
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        out[key] = parsed;
      }
    }
  }

  for (const key of BOOLEAN_KEYS) {
    const value = out[key];
    if (typeof value === 'string') {
      out[key] = value.trim().toLowerCase() === 'true' || value.trim() === '1';
    }
  }

  return out;
}

/**
 * Muhit o'zgaruvchilarini tekshirish.
 *
 * Xato bo'lsa — ilova ishga tushmaydi va sabab aniq ko'rsatiladi.
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, coerceEnv(raw));

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => `  • ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Konfiguratsiya xatosi:\n${details}\n\n.env.example fayliga qarang.`);
  }

  // --- Qo'shimcha semantik tekshiruvlar ------------------------------------
  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error(
      "JWT_ACCESS_SECRET va JWT_REFRESH_SECRET bir xil bo'lishi MUMKIN EMAS. " +
        'Aks holda access token refresh sifatida ishlatilishi mumkin.',
    );
  }

  if (validated.NODE_ENV === NodeEnv.Production) {
    const weak = ['CHANGE_ME', 'secret', 'password', 'SMD_access', 'SMD_refresh'];
    for (const secret of [validated.JWT_ACCESS_SECRET, validated.JWT_REFRESH_SECRET]) {
      if (weak.some((w) => secret.includes(w))) {
        throw new Error('Production muhitida shablon/zaif JWT kaliti ishlatilmoqda.');
      }
    }
  }

  return validated;
}

export function loadConfig(): AppConfig {
  const env = validateEnv(process.env);

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    corsOrigins: env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? [],
    database: { url: env.DATABASE_URL },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      ...(env.REDIS_PASSWORD !== undefined && { password: env.REDIS_PASSWORD }),
      db: env.REDIS_DB,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    argon2: {
      memoryCost: env.ARGON2_MEMORY_COST,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    },
    ...(env.TOTP_ENCRYPTION_KEY !== undefined && {
      totpEncryptionKey: env.TOTP_ENCRYPTION_KEY,
    }),
    observability: {
      logLevel: env.LOG_LEVEL,
      otelEnabled: env.OTEL_ENABLED,
      ...(env.SENTRY_DSN !== undefined && { sentryDsn: env.SENTRY_DSN }),
    },
    throttle: { ttl: env.THROTTLE_TTL, limit: env.THROTTLE_LIMIT },
    play: { disconnectGraceMsOverride: env.PLAY_DISCONNECT_GRACE_MS ?? null },
  };
}
