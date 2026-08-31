import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';

import { type AppConfig, NodeEnv } from '../../../config/configuration';
import { SlidingWindowLimiter } from '../../../shared/rate-limit/sliding-window.limiter';
import { REDIS } from '../../../shared/redis/redis.module';
import { TotpRequiredError } from '../mfa/totp.errors';
import { TotpService } from '../mfa/totp.service';
import { PasswordService } from '../password/password.service';
import { RefreshTokenService } from '../token/refresh-token.repository';
import { UserRepository } from '../user.repository';
import {
  AccountDisabledError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidVerificationTokenError,
  TooManyAttemptsError,
} from './auth.errors';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

/** Access token payload. ROLLAR BU YERDA YO'Q — docs/10-security.md §3.4:
 *  15 daqiqalik token bekor qilingan hakamni 15 daqiqa "hakam"ligicha
 *  qoldirardi. Rollar har so'rovda DB/Redis'dan olinadi (AuthzService). */
export interface AccessTokenPayload {
  sub: string;
  /** Sessiya (refresh oilasi) identifikatori */
  sid: string;
  jti: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Sekundlarda — klient uchun */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** Email tasdiqlash tokeni TTL — 24 soat. */
const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60;
const ACCESS_TTL_SECONDS = 15 * 60;

/** docs/10-security.md §7.1 */

/**
 * Bitta HISOB uchun muvaffaqiyatsiz urinishlar (kalit: email).
 * Hujjatdagi qiymat — 5/15min. Shaxsiy kalit, shuning uchun qat'iy.
 */
const LOGIN_LIMIT = 5;

/**
 * Bitta IP uchun muvaffaqiyatsiz urinishlar. Emaildan YUQORI, ataylab.
 *
 * `login:ip` — UMUMIY kalit: NAT ortida o'nlab begona foydalanuvchi uni
 * bo'lishadi (maktab sinfi, internet-kafe, mobil CGNAT). Uni email bilan
 * bir xil 5 ga qo'yish halol foydalanuvchilarni jazolaydi, hujumchini esa
 * to'xtatmaydi — u IP almashtiradi.
 *
 * 20 — muvozanat: bitta IP'dan 20 ta XATO parol 15 daqiqada aniq
 * anomaliya (credential stuffing shu chegaraga soniyalarda uriladi),
 * lekin bir sinf o'quvchisining tipografik xatolari bu yerga yetmaydi.
 * Muvaffaqiyatli kirish budjetni umuman sarflamaydi (login() oxiridagi
 * `refund`), shuning uchun 20 ta XATO degani — 20 ta urinish emas.
 *
 * ⚠️  Bu raqam ham baseline bilan tekshirilishi kerak (docs/15 §6.2
 *     falsafasi): real trafikda 15 daqiqada IP boshiga qancha xato
 *     bo'lishini o'lchab, kerak bo'lsa tuzatiladi.
 */
const LOGIN_IP_LIMIT = 20;

const LOGIN_WINDOW_SECONDS = 15 * 60;
const REGISTER_LIMIT = 3;
const REGISTER_WINDOW_SECONDS = 60 * 60;
const TOTP_LIMIT = 5;
const TOTP_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly password: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly totp: TotpService,
    private readonly jwt: JwtService,
    private readonly limiter: SlidingWindowLimiter,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Ro'yxatdan o'tish: User + Player + PLAYER roli — bir tranzaksiyada
   * (UserRepository). docs/01-product-spec.md §2.1
   */
  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthTokens> {
    const ipDecision = await this.limiter.consume(
      `register:ip:${meta.ip ?? 'unknown'}`,
      REGISTER_LIMIT,
      REGISTER_WINDOW_SECONDS,
    );
    if (!ipDecision.allowed) {
      throw new TooManyAttemptsError(ipDecision.retryAfterSeconds);
    }

    const email = dto.email.toLowerCase().trim();

    const existing = await this.users.findByEmail(email);
    if (existing !== null) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.password.hash(dto.password);
    const user = await this.users.createWithPlayer(
      {
        email,
        passwordHash,
        locale: dto.locale ?? 'uz-Latn',
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      meta,
    );

    await this.sendEmailVerification(user.id, email);

    return await this.issueTokens(user.id, meta);
  }

  /**
   * Kirish. User enumeration himoyasi: mavjud bo'lmagan foydalanuvchi uchun
   * ham dummy hash tekshiriladi — javob vaqti bir xil. docs/10-security.md §2.1
   */
  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthTokens> {
    const email = dto.email.toLowerCase().trim();
    const ipKey = `login:ip:${meta.ip ?? 'unknown'}`;
    const emailKey = `login:email:${email}`;

    // Ikki mustaqil limit: IP (bitta hujumchi ko'p hisobga) va
    // email (botnet bitta hisobga). Birortasi oshsa — 429.
    //
    // Ikkalasi ham parolni TEKSHIRISHDAN OLDIN sanaladi — bu ataylab:
    // limit qimmat Argon2 hisobidan oldin turishi kerak, aks holda
    // brute-force CPU'ni yeb qo'yadi. Muvaffaqiyatli kirishda esa
    // hisoblagich QAYTARIB olinadi (metod oxiriga qarang).
    const [byIp, byEmail] = await Promise.all([
      this.limiter.consume(ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS),
      this.limiter.consume(emailKey, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS),
    ]);
    if (!byIp.allowed || !byEmail.allowed) {
      throw new TooManyAttemptsError(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds));
    }

    const user = await this.users.findByEmail(email);
    const passwordHash = user?.passwordHash ?? null;

    if (user === null || passwordHash === null) {
      await this.password.verifyDummy(dto.password);
      throw new InvalidCredentialsError();
    }

    const valid = await this.password.verify(passwordHash, dto.password);
    if (!valid) {
      await this.users.recordLoginFailed(user.id, meta);
      throw new InvalidCredentialsError();
    }

    if (
      user.status === 'SUSPENDED' ||
      user.status === 'BANNED' ||
      user.status === 'DELETED' ||
      user.deletedAt !== null
    ) {
      throw new AccountDisabledError();
    }

    // 2FA yoqilgan hisob: parol TO'G'RI bo'lgandan keyingina kod so'raladi
    // (aks holda TOTP_REQUIRED javobi hisob mavjudligini oshkor qilardi).
    // Kod urinishlari alohida limitlanadi: 5/15min, userId. §7.1
    if (user.totpEnabled) {
      if (dto.totpCode === undefined) {
        throw new TotpRequiredError();
      }
      const totpLimit = await this.limiter.consume(
        `2fa:user:${user.id}`,
        TOTP_LIMIT,
        TOTP_WINDOW_SECONDS,
      );
      if (!totpLimit.allowed) {
        throw new TooManyAttemptsError(totpLimit.retryAfterSeconds);
      }
      await this.totp.verify(user, dto.totpCode);
    }

    // Shaffof qayta-hash: parametrlar kuchaytirilgan bo'lsa, plaintext
    // qo'ldaligida yangi hash yoziladi. docs/10-security.md §2.1
    if (this.password.needsRehash(passwordHash)) {
      const newHash = await this.password.hash(dto.password);
      await this.users.updatePasswordHash(user.id, newHash);
    }

    await this.users.recordLogin(user.id, meta);

    // ─────────────────────────────────────────────────────────────────────
    //  MUVAFFAQIYAT: ikkala hisoblagich ham bo'shatiladi, LEKIN turlicha.
    //
    //  email (shaxsiy kalit) → reset: egasi parolni to'g'ri kiritdi, ya'ni
    //  bu hisobga qilingan xato urinishlar oqlandi.
    //
    //  IP (UMUMIY kalit) → refund: faqat SHU urinish qaytariladi, boshqa
    //  birovning xato urinishlari joyida qoladi. `reset` bu yerda XAVFLI
    //  bo'lardi — bitta haqiqiy hisobga ega hujumchi har muvaffaqiyatli
    //  kirishda umumiy brute-force hisoblagichini nolga qaytarardi.
    //
    //  NEGA UMUMAN QAYTARILADI (docs/AUDIT.md JIDDIY-4): ilgari IP
    //  hisoblagichi muvaffaqiyatda ham sarflanardi va hech qachon
    //  qaytarilmasdi. Natijada bitta tashqi IP ortidagi 6-chi foydalanuvchi
    //  TO'G'RI parol bilan ham 15 daqiqa qulflanardi — maktab sinfi,
    //  internet-kafe, turnir zali Wi-Fi va mobil CGNAT uchun bu chekka
    //  holat emas, ODATIY holat. Endi IP oynasida faqat MUVAFFAQIYATSIZ
    //  urinishlar to'planadi.
    // ─────────────────────────────────────────────────────────────────────
    await Promise.all([this.limiter.reset(emailKey), this.limiter.refund(ipKey, byIp.token)]);

    return await this.issueTokens(user.id, meta);
  }

  /** Access muddati tugadi → refresh rotatsiyasi. Reuse → 401 + oila bekor. */
  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const rotated = await this.refreshTokens.rotate(rawRefreshToken, meta);
    return {
      accessToken: await this.signAccess(rotated.userId, rotated.familyId),
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  /** Bitta qurilmadan chiqish. Idempotent. */
  async logout(rawRefreshToken: string): Promise<void> {
    await this.refreshTokens.revokeByToken(rawRefreshToken);
  }

  /** Barcha qurilmalardan chiqish. */
  async logoutAll(userId: string): Promise<number> {
    return await this.refreshTokens.revokeAllForUser(userId);
  }

  /** Email tasdiqlash — token Redis'da, 24 soat, bir martalik. */
  async verifyEmail(token: string): Promise<void> {
    if (token === '') {
      throw new InvalidVerificationTokenError();
    }
    const key = `emailverify:${token}`;
    const userId = await this.redis.get(key);
    if (userId === null) {
      throw new InvalidVerificationTokenError();
    }
    await this.redis.del(key);
    await this.users.markEmailVerified(userId);
  }

  private async sendEmailVerification(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(`emailverify:${token}`, userId, 'EX', EMAIL_VERIFY_TTL_SECONDS);

    // TODO(Faza 0): haqiqiy yuborish — dev'da mailhog, prod'da provayder.
    // Token PROD log'iga yozilmaydi (sir!) — faqat dev muhitida ko'rsatiladi.
    if (this.config.get('nodeEnv', { infer: true }) === NodeEnv.Development) {
      this.logger.debug(
        `[DEV] Email tasdiqlash: /api/v1/auth/verify-email?token=${token} → ${email}`,
      );
    }
  }

  private async issueTokens(userId: string, meta: RequestMeta): Promise<AuthTokens> {
    const issued = await this.refreshTokens.issueNewFamily(userId, meta);
    return {
      accessToken: await this.signAccess(userId, issued.familyId),
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken: issued.token,
      refreshExpiresAt: issued.expiresAt,
    };
  }

  private async signAccess(userId: string, familyId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId, sid: familyId, jti: randomUUID() };
    return await this.jwt.signAsync(payload);
  }
}
