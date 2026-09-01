import { Injectable } from '@nestjs/common';
import { Role, UserStatus, type User } from '@prisma/client';

import { AuditService } from '../../shared/audit/audit.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** Service qatlami ko'radigan foydalanuvchi ko'rinishi. */
export interface UserView {
  id: string;
  email: string | null;
  passwordHash: string | null;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';
  emailVerified: boolean;
  /** Xat tili — tranzaksion pochta shu bo'yicha render qilinadi. */
  locale: string;
  deletedAt: Date | null;
  totpEnabled: boolean;
  /** SHIFRLANGAN TOTP siri (SecretBox formati). NULL = 2FA yo'q. */
  totpSecret: string | null;
  /** SHA-256 hash qilingan bir martalik zaxira kodlar. */
  totpBackupCodes: string[];
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  locale: string;
  firstName: string;
  lastName: string;
}

export interface RequestMetaInput {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface RoleAssignmentRow {
  role: string;
  scopeType: string | null;
  scopeId: string | null;
}

/**
 * Identity modulining DB qatlami.
 *
 * Prisma FAQAT shu yerda (`prisma-only-in-infrastructure`,
 * .dependency-cruiser.js). Service'lar bu interfeys orqali ishlaydi —
 * docs/02-architecture.md §4.
 */
@Injectable()
export class UserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findByEmail(email: string): Promise<UserView | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user === null ? null : toView(user);
  }

  async findById(id: string): Promise<UserView | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user === null ? null : toView(user);
  }

  /**
   * User + Player profili + PLAYER roli + audit — BIR TRANZAKSIYADA.
   * docs/01-product-spec.md §2.1
   */
  async createWithPlayer(input: CreateUserInput, meta: RequestMetaInput): Promise<UserView> {
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          status: UserStatus.PENDING_VERIFICATION,
          locale: input.locale,
          roles: { create: { role: Role.PLAYER } },
          player: {
            create: { firstName: input.firstName, lastName: input.lastName },
          },
        },
      });

      await this.audit.write(tx, {
        action: 'user.registered',
        actorUserId: user.id,
        resourceType: 'User',
        resourceId: user.id,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });

      return user;
    });

    return toView(created);
  }

  /**
   * Jimgina hash yangilash — FAQAT shaffof qayta-hash uchun
   * (Argon2 parametrlari kuchaytirilganda, login paytida). Bu foydalanuvchi
   * amali EMAS, shuning uchun audit yozuvi ham yo'q.
   */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /**
   * Parol O'ZGARTIRILDI — hash + audit BIR TRANZAKSIYADA.
   *
   * Nega `updatePasswordHash` dan alohida: bu xavfsizlik hodisasi va u
   * audit izisiz qolmasligi kerak (docs/10-security.md §10). Atomiklik
   * shart — parol o'zgarib, audit yozuvi yo'qolsa, "kim va qachon
   * o'zgartirdi?" savoliga javob yo'qoladi.
   *
   * `action` chaqiruvchidan keladi, chunki ikki oqim bor va ular
   * auditda FARQLANISHI kerak:
   *   auth.password_reset  — tokenli tiklash (parolni bilmagan odam)
   *   auth.password_changed — o'zi almashtirdi (eski parolni bilgan)
   */
  async changePassword(input: {
    userId: string;
    passwordHash: string;
    action: 'auth.password_reset' | 'auth.password_changed';
    meta: RequestMetaInput;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: { passwordHash: input.passwordHash },
      });
      await this.audit.write(tx, {
        action: input.action,
        actorUserId: input.userId,
        resourceType: 'User',
        resourceId: input.userId,
        ipAddress: input.meta.ip ?? null,
        userAgent: input.meta.userAgent ?? null,
      });
    });
  }

  /** Muvaffaqiyatli kirish: lastLogin + audit — bir tranzaksiyada. */
  async recordLogin(userId: string, meta: RequestMetaInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date(), lastLoginIp: meta.ip ?? null },
      });
      await this.audit.write(tx, {
        action: 'auth.login',
        actorUserId: userId,
        resourceType: 'User',
        resourceId: userId,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
    });
  }

  async recordLoginFailed(userId: string, meta: RequestMetaInput): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.audit.write(tx, {
        action: 'auth.login_failed',
        actorUserId: userId,
        resourceType: 'User',
        resourceId: userId,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      }),
    );
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: UserStatus.ACTIVE },
    });
  }

  /**
   * 2FA yoqish: shifrlangan sir + hash qilingan zaxira kodlar + audit —
   * bir tranzaksiyada. docs/10-security.md §2.5
   */
  async enableTotp(
    userId: string,
    encryptedSecret: string,
    hashedBackupCodes: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          totpSecret: encryptedSecret,
          totpEnabled: true,
          totpBackupCodes: hashedBackupCodes,
        },
      });
      await this.audit.write(tx, {
        action: 'auth.2fa_enabled',
        actorUserId: userId,
        resourceType: 'User',
        resourceId: userId,
      });
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totpSecret: null, totpEnabled: false, totpBackupCodes: [] },
      });
      await this.audit.write(tx, {
        action: 'auth.2fa_disabled',
        actorUserId: userId,
        resourceType: 'User',
        resourceId: userId,
      });
    });
  }

  /** Ishlatilgan zaxira kod ro'yxatdan olib tashlanadi (bir martalik). */
  async replaceBackupCodes(userId: string, remainingHashed: string[]): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpBackupCodes: remainingHashed },
    });
  }

  /** Faol (muddati o'tmagan) rol biriktirmalari — AuthzService uchun. */
  async findActiveAssignments(userId: string): Promise<RoleAssignmentRow[]> {
    return await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { role: true, scopeType: true, scopeId: true },
    });
  }
}

function toView(user: User): UserView {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    status: user.status,
    emailVerified: user.emailVerified,
    locale: user.locale,
    deletedAt: user.deletedAt,
    totpEnabled: user.totpEnabled,
    totpSecret: user.totpSecret,
    totpBackupCodes: user.totpBackupCodes,
  };
}
