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
  deletedAt: Date | null;
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

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
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
    deletedAt: user.deletedAt,
  };
}
