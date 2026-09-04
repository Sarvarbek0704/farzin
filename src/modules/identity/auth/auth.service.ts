import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';

import { NotFoundError } from '../../../core/errors/domain.error';
import { type AppConfig, NodeEnv } from '../../../config/configuration';
import { SlidingWindowLimiter } from '../../../shared/rate-limit/sliding-window.limiter';
import { REDIS } from '../../../shared/redis/redis.module';
import {
  TRANSACTIONAL_MAILER,
  type TransactionalMailer,
} from '../../notification/transactional-mail.port';
import { TotpRequiredError } from '../mfa/totp.errors';
import { TotpService } from '../mfa/totp.service';
import { PasswordService } from '../password/password.service';
import { RefreshTokenService } from '../token/refresh-token.repository';
import { UserRepository } from '../user.repository';
import {
  AccountDisabledError,
  CurrentPasswordMismatchError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidPasswordResetTokenError,
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

/**
 * `GET /auth/me` javobi — O'Z hisobi va HOZIRGI rollari.
 *
 * Parol hash'i, TOTP siri va zaxira kodlar BU YERDA YO'Q va hech
 * qachon bo'lmasligi kerak: javob brauzerga ketadi.
 */
export interface CurrentUserResponse {
  userId: string;
  email: string | null;
  status: string;
  emailVerified: boolean;
  totpEnabled: boolean;
  locale: string;
  roles: { role: string; scopeType: string | null; scopeId: string | null }[];
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

/**
 * Parolni tiklash — docs/10-security.md §7.1 jadvalidan AYNAN:
 *   POST /auth/password/forgot → 3/soat, kalit IP + email
 *   POST /auth/password/reset  → 5/soat, kalit IP
 */
const PASSWORD_FORGOT_LIMIT = 3;
const PASSWORD_FORGOT_WINDOW_SECONDS = 60 * 60;
const PASSWORD_RESET_LIMIT = 5;
const PASSWORD_RESET_WINDOW_SECONDS = 60 * 60;

/**
 * Tiklash tokeni TTL — 1 soat. Email tasdiqlashdan (24 soat) QISQAROQ:
 * bu token hisobni to'liq egallash imkonini beradi, tasdiqlash tokeni esa
 * faqat manzilni tasdiqlaydi. Shablon matnida ham 1 soat deyilgan.
 */
const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

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
    @Inject(TRANSACTIONAL_MAILER) private readonly mailer: TransactionalMailer,
  ) {}

  /**
   * O'z hisobi va rollari — UI qaysi bo'limlarni ko'rsatishini
   * hal qilishi uchun (auth.controller.ts `me` izohiga qarang).
   *
   * Rollar `findActiveAssignments` orqali: MUDDATI O'TGANLARI
   * chiqarib tashlanadi. Aks holda turnir tugagach ham "Hakam
   * konsoli" ko'rinib turardi va bosilganda 404 berardi.
   */
  async describe(userId: string): Promise<CurrentUserResponse> {
    const user = await this.users.findById(userId);
    if (user === null) {
      throw new NotFoundError('User', userId);
    }
    // O'chirilgan hisob — "topilmadi" bilan BIR XIL javob: token hali
    // amal qilayotgan bo'lsa ham hisob yo'q deb ko'rsatiladi.
    if (user.deletedAt !== null) {
      throw new NotFoundError('User', userId);
    }
    const roles = await this.users.findActiveAssignments(userId);
    return {
      userId: user.id,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerified,
      totpEnabled: user.totpEnabled,
      locale: user.locale,
      roles,
    };
  }

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

    await this.sendEmailVerification(user.id, email, dto.locale ?? 'uz-Latn');

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

  // --- Parol oqimlari (docs/10-security.md §7.1) --------------------------------

  /**
   * Parolni tiklashni SO'RASH.
   *
   * ═════════════════════════════════════════════════════════════════════
   *  HAR DOIM MUVAFFAQIYAT QAYTARADI — email bor-yo'qligidan qat'i nazar.
   *
   *  Aks holda bu endpoint foydalanuvchi bazasini sanab chiqish vositasiga
   *  aylanardi: "email topilmadi" javobi qaysi manzillar ro'yxatdan
   *  o'tganini oshkor qiladi (login'dagi bilan bir xil tamoyil —
   *  docs/10-security.md §2.1).
   *
   *  Shu sababli chaqiruvchi hech qachon xato ko'rmaydi; nima bo'lgani
   *  faqat log'da qoladi.
   * ═════════════════════════════════════════════════════════════════════
   *
   * Limitlar (§7.1 jadvali): 3/soat, kalit IP + email — ikkalasi ham,
   * chunki bitta IP'dan ko'p manzilga xat bombardimon qilish ham,
   * bitta manzilga ko'p IP'dan yozish ham suiiste'mol.
   */
  async requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
    const normalized = email.toLowerCase().trim();

    const [byIp, byEmail] = await Promise.all([
      this.limiter.consume(
        `pwdforgot:ip:${meta.ip ?? 'unknown'}`,
        PASSWORD_FORGOT_LIMIT,
        PASSWORD_FORGOT_WINDOW_SECONDS,
      ),
      this.limiter.consume(
        `pwdforgot:email:${normalized}`,
        PASSWORD_FORGOT_LIMIT,
        PASSWORD_FORGOT_WINDOW_SECONDS,
      ),
    ]);
    if (!byIp.allowed || !byEmail.allowed) {
      // Limit — YAGONA holat, unda xato qaytadi. Bu enumeration bermaydi:
      // chegara so'rov MAZMUNIGA emas, chastotasiga bog'liq.
      throw new TooManyAttemptsError(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds));
    }

    // Mos hisob yo'q (yoki o'chirilgan) — JIMGINA to'xtaymiz. Chaqiruvchi
    // baribir 204 oladi (metod sarlavhasidagi enumeration izohi).
    const user = await this.users.findByEmail(normalized);
    // login() bilan bir xil naqsh: maydonni AVVAL ajratamiz, keyin
    // tekshiramiz — aks holda `user === null || user.x` optional-chain
    // qoidasiga uriladi.
    const deletedAt = user?.deletedAt ?? null;
    const userEmail = user?.email ?? null;
    if (user === null || deletedAt !== null || userEmail === null) {
      this.logger.debug("Parol tiklash: mos hisob yo'q (javob baribir 204)");
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.redis.set(`pwdreset:${token}`, user.id, 'EX', PASSWORD_RESET_TTL_SECONDS);

    const appUrl = this.config.get('appUrl', { infer: true });
    // Frontend sahifasi (docs/12-frontend-spec.md). Frontend hali yo'q,
    // shuning uchun havola API endpointiga EMAS, kelajakdagi sahifaga
    // ishora qiladi: token GET bilan URL'da yuborilsa, u brauzer tarixida
    // va Referer sarlavhasida qolib ketardi. Reset — POST.
    const resetUrl = `${appUrl}/parolni-tiklash?token=${token}`;

    if (!this.mailer.enabled) {
      if (this.config.get('nodeEnv', { infer: true }) === NodeEnv.Development) {
        this.logger.debug(`[DEV] Parolni tiklash havolasi: ${resetUrl}`);
      } else {
        this.logger.warn('SMTP sozlanmagan — parol tiklash xati YUBORILMADI.');
      }
      return;
    }

    try {
      await this.mailer.send({
        to: normalized,
        templateKey: 'auth.password_reset',
        locale: user.locale,
        payload: { resetUrl },
      });
    } catch (error) {
      this.logger.warn(
        `Parol tiklash xati yuborilmadi (user=${user.id}): ${
          error instanceof Error ? error.message : "noma'lum xato"
        }`,
      );
    }
  }

  /**
   * Token bilan yangi parol o'rnatish.
   *
   * Xavfsizlik qoidalari:
   *  - token BIR MARTALIK: tekshirilgandan keyin darhol o'chiriladi,
   *    parol yangilanishidan OLDIN. Poyga holatida ikki so'rov bir xil
   *    tokendan foydalana olmaydi (`GETDEL` atomik).
   *  - parol o'zgargach BARCHA sessiyalar bekor qilinadi: tiklash
   *    stsenariysining o'zi "hisob egallangan bo'lishi mumkin" degan
   *    faraz ustiga qurilgan, demak o'g'rining refresh tokeni ham
   *    o'lishi SHART (docs/10-security.md §2.3).
   *  - audit yozuvi parol yangilanishi bilan bir tranzaksiyada.
   *
   * Limit: 5/soat, kalit IP (§7.1) — token brute-force'ga qarshi.
   */
  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const decision = await this.limiter.consume(
      `pwdreset:ip:${meta.ip ?? 'unknown'}`,
      PASSWORD_RESET_LIMIT,
      PASSWORD_RESET_WINDOW_SECONDS,
    );
    if (!decision.allowed) {
      throw new TooManyAttemptsError(decision.retryAfterSeconds);
    }

    if (token === '') {
      throw new InvalidPasswordResetTokenError();
    }

    // GETDEL — atomik o'qish+o'chirish: ikki parallel so'rov bitta
    // tokenni ikki marta ishlata olmaydi.
    const userId = await this.redis.getdel(`pwdreset:${token}`);
    if (userId === null) {
      throw new InvalidPasswordResetTokenError();
    }

    // Token yaroqli edi, lekin hisob yo'q/o'chirilgan. Token GETDEL bilan
    // allaqachon iste'mol qilindi — qayta ishlatib bo'lmaydi.
    const user = await this.users.findById(userId);
    const deletedAt = user?.deletedAt ?? null;
    const userEmailForReset = user?.email ?? null;
    if (user === null || deletedAt !== null) {
      throw new InvalidPasswordResetTokenError();
    }

    const passwordHash = await this.password.hash(newPassword);
    await this.users.changePassword({
      userId,
      passwordHash,
      action: 'auth.password_reset',
      meta,
    });

    // Barcha qurilmalardan chiqarish — yuqoridagi izoh.
    await this.refreshTokens.revokeAllForUser(userId);

    // Muvaffaqiyatli tiklashdan keyin login limitini bo'shatamiz: aks
    // holda odam yangi parolini kiritolmay yana qulflanardi (parolni
    // unutgan odam allaqachon bir necha marta xato kiritgan bo'ladi).
    if (userEmailForReset !== null) {
      await this.limiter.reset(`login:email:${userEmailForReset}`);
    }
  }

  /**
   * Foydalanuvchi o'z parolini almashtiradi (autentifikatsiya bilan).
   *
   * Joriy parol MAJBURIY: o'g'irlangan access token bilan (15 daqiqa
   * amal qiladi) hisobni butunlay egallab olishning oldini oladi.
   *
   * Sessiyalar: BARCHASI bekor qilinadi. Bu ataylab qattiq — parol
   * almashtirishning eng ko'p uchraydigan sababi "kimdir kirgan bo'lishi
   * mumkin" degan shubha. Chaqiruvchi (controller) o'z cookie'sini ham
   * tozalaydi va foydalanuvchi qayta kiradi.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<void> {
    // Parolsiz hisob (masalan faqat OAuth) — joriy parolni tasdiqlab
    // bo'lmaydi, shuning uchun bu yo'l ochiq emas.
    const user = await this.users.findById(userId);
    const currentHash = user?.passwordHash ?? null;
    if (user === null || currentHash === null) {
      throw new CurrentPasswordMismatchError();
    }

    const valid = await this.password.verify(currentHash, currentPassword);
    if (!valid) {
      throw new CurrentPasswordMismatchError();
    }

    await this.users.changePassword({
      userId,
      passwordHash: await this.password.hash(newPassword),
      action: 'auth.password_changed',
      meta,
    });

    await this.refreshTokens.revokeAllForUser(userId);
  }

  /**
   * Email tasdiqlash xatini yuborish.
   *
   * ═════════════════════════════════════════════════════════════════════
   *  Ilgari bu metod tokenni yaratib Redis'ga yozardi va TO'XTARDI —
   *  xat hech qayerga ketmasdi (docs/AUDIT.md KRITIK-3). Prod'da hatto
   *  dev-log ham chiqmasdi, ya'ni foydalanuvchi manzilini HECH QACHON
   *  tasdiqlay olmasdi va abadiy `PENDING_VERIFICATION` da qolardi.
   *
   *  Yo'l: TRANSACTIONAL_MAILER porti (notification moduli), `notifyUsers`
   *  EMAS — u tasdiqlanmagan manzilni filtrlab tashlaydi, bu esa aynan
   *  manzilni tasdiqlaydigan xat (transactional-mail.port.ts izohi).
   *
   *  XATO SIYOSATI: yuborish xatosi RO'YXATDAN O'TISHNI YIQITMAYDI.
   *  SMTP uzilishi tufayli hisob yaratilmay qolishi — yomonroq natija;
   *  token Redis'da 24 soat turadi va qayta yuborish keyin qo'shiladi.
   *  Xato WARN bilan loglanadi, foydalanuvchiga esa 201 qaytadi.
   * ═════════════════════════════════════════════════════════════════════
   */
  private async sendEmailVerification(
    userId: string,
    email: string,
    locale: string,
  ): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(`emailverify:${token}`, userId, 'EX', EMAIL_VERIFY_TTL_SECONDS);

    const appUrl = this.config.get('appUrl', { infer: true });
    const apiPrefix = this.config.get('apiPrefix', { infer: true });
    const verifyUrl = `${appUrl}/${apiPrefix}/v1/auth/verify-email?token=${token}`;

    if (!this.mailer.enabled) {
      // SMTP sozlanmagan. Dev'da havolani ko'rsatamiz, aks holda lokal
      // ishlab chiqishda tasdiqlash umuman imkonsiz bo'lardi.
      // Prod'da esa JIM QOLMAYMIZ — bu konfiguratsiya xatosi.
      if (this.config.get('nodeEnv', { infer: true }) === NodeEnv.Development) {
        this.logger.debug(`[DEV] Email tasdiqlash havolasi: ${verifyUrl}`);
      } else {
        this.logger.warn('SMTP sozlanmagan — email tasdiqlash xati YUBORILMADI. SMTP_HOST bering.');
      }
      return;
    }

    try {
      await this.mailer.send({
        to: email,
        templateKey: 'auth.verify_email',
        locale,
        payload: { verifyUrl },
      });
    } catch (error) {
      // Manzil ham, token ham log'ga CHIQMAYDI (docs/10-security.md §8).
      this.logger.warn(
        `Email tasdiqlash xati yuborilmadi (user=${userId}): ${
          error instanceof Error ? error.message : "noma'lum xato"
        }`,
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
