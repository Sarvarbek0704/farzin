import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { authenticator } from 'otplib';

import type { AppConfig } from '../../../config/configuration';
import { BusinessRuleError } from '../../../core/errors/domain.error';
import { SecretBox } from '../../../shared/crypto/secret-box';
import { REDIS } from '../../../shared/redis/redis.module';
import { UserRepository, type UserView } from '../user.repository';
import { InvalidTotpCodeError, TotpNotConfiguredError } from './totp.errors';

/** Kutilayotgan (hali tasdiqlanmagan) sir Redis'da 10 daqiqa yashaydi. */
const PENDING_TTL_SECONDS = 10 * 60;

/** Zaxira kodlar: 10 ta, har biri 10 hex belgi, BIR MARTA ko'rsatiladi. */
const BACKUP_CODE_COUNT = 10;

/**
 * TOTP 2FA — RFC 6238 (otplib). docs/10-security.md §2.5
 *
 * Oqim:
 *  1. enroll   → sir generatsiya, Redis'da PENDING (10 min), otpauth URL qaytadi
 *  2. activate → foydalanuvchi ilovadagi kodni kiritadi; to'g'ri bo'lsa sir
 *                DB'ga SHIFRLANGAN holda yoziladi + 10 zaxira kod (hash)
 *                qaytadi — BIR MARTA
 *  3. verify   → login paytida kod tekshiriladi; replay himoyasi:
 *                ishlatilgan kod Redis'da 90s belgilanadi (SET NX)
 *
 * Sir DB'da AES-256-GCM bilan shifrlanadi (TOTP_ENCRYPTION_KEY) —
 * DB dump sirlarni ochmaydi.
 */
@Injectable()
export class TotpService {
  private readonly box: SecretBox | null;

  constructor(
    private readonly users: UserRepository,
    config: ConfigService<AppConfig, true>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    const key = config.get('totpEncryptionKey', { infer: true });
    this.box = key !== undefined ? new SecretBox(key) : null;

    // window: 1 — soat siljishiga ±1 qadam (30s) tolerantlik. §2.5
    authenticator.options = { window: 1, step: 30, digits: 6 };
  }

  /** 1-qadam: sir generatsiya. QR uchun otpauth URL qaytadi. */
  async enroll(userId: string, accountLabel: string): Promise<{ otpauthUrl: string }> {
    const box = this.requireBox();
    const secret = authenticator.generateSecret();
    // Redis'da ham shifrlangan — hech qayerda ochiq sir yotmaydi.
    await this.redis.set(
      `totp:pending:${userId}`,
      box.encrypt(secret),
      'EX',
      PENDING_TTL_SECONDS,
    );
    return { otpauthUrl: authenticator.keyuri(accountLabel, 'Farzin', secret) };
  }

  /**
   * 2-qadam: kod to'g'ri → 2FA yoqiladi. Zaxira kodlar FAQAT SHU YERDA,
   * bir marta qaytadi — keyin faqat hash saqlanadi.
   */
  async activate(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const box = this.requireBox();
    const encrypted = await this.redis.get(`totp:pending:${userId}`);
    if (encrypted === null) {
      throw new BusinessRuleError(
        'TOTP_ENROLLMENT_EXPIRED',
        "Ro'yxatga olish topilmadi yoki muddati o'tgan — /auth/2fa/enroll dan qayta boshlang",
      );
    }

    const secret = box.decrypt(encrypted);
    if (!authenticator.check(code, secret)) {
      throw new InvalidTotpCodeError();
    }

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(5).toString('hex'),
    );
    await this.users.enableTotp(userId, box.encrypt(secret), backupCodes.map(sha256));
    await this.redis.del(`totp:pending:${userId}`);

    return { backupCodes };
  }

  /**
   * Login paytida tekshirish. TOTP kod YOKI zaxira kod qabul qilinadi.
   *
   * Replay himoyasi: bir kod 30s oynada ikki marta ishlamaydi —
   * `totp:used:{userId}:{code}` Redis'da 90s NX bilan belgilanadi.
   */
  async verify(user: UserView, code: string): Promise<void> {
    const box = this.requireBox();
    if (!user.totpEnabled || user.totpSecret === null) {
      throw new TotpNotConfiguredError();
    }

    // Avval TOTP kod
    if (/^\d{6}$/.test(code) && authenticator.check(code, box.decrypt(user.totpSecret))) {
      const fresh = await this.redis.set(`totp:used:${user.id}:${code}`, '1', 'EX', 90, 'NX');
      if (fresh !== 'OK') {
        // Kod allaqachon ishlatilgan — replay urinishi.
        throw new InvalidTotpCodeError();
      }
      return;
    }

    // Keyin zaxira kod (bir martalik)
    const codeHash = sha256(code.toLowerCase());
    const match = user.totpBackupCodes.find((stored) => safeEqual(stored, codeHash));
    if (match !== undefined) {
      await this.users.replaceBackupCodes(
        user.id,
        user.totpBackupCodes.filter((stored) => stored !== match),
      );
      return;
    }

    throw new InvalidTotpCodeError();
  }

  /** 2FA o'chirish — joriy kod talab qilinadi (o'g'irlangan sessiya himoyasi). */
  async disable(user: UserView, code: string): Promise<void> {
    await this.verify(user, code);
    await this.users.disableTotp(user.id);
  }

  private requireBox(): SecretBox {
    if (this.box === null) {
      throw new BusinessRuleError(
        'TOTP_NOT_CONFIGURED_SERVER',
        "Server 2FA uchun sozlanmagan (TOTP_ENCRYPTION_KEY yo'q)",
      );
    }
    return this.box;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Uzunligi teng hex satrlar uchun timing-safe taqqoslash. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
