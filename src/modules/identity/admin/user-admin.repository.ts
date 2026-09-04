import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { Role } from '../rbac.port';
import type { ScopeRef, ScopeType } from './role-grant.rules';

export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';

/** Ma'muriy ro'yxatdagi bitta foydalanuvchi. */
export interface AdminUserRow {
  id: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  emailVerified: boolean;
  totpEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** Ismi — o'yinchi profili bo'lsa. Yo'q bo'lsa `null`. */
  firstName: string | null;
  lastName: string | null;
  roles: AdminRoleRow[];
}

export interface AdminRoleRow {
  id: string;
  role: Role;
  scopeType: ScopeType | null;
  scopeId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface AdminUserFilter {
  /** Email, telefon yoki ism bo'yicha qidiruv. */
  search?: string | undefined;
  status?: UserStatus | undefined;
  role?: Role | undefined;
}

/**
 * Ma'muriy o'qish va rol yozish.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA `admin/` MODULIDA EMAS, `identity/` DA
 *
 *  `users` va `user_roles` jadvallari IDENTITY moduliniki. Rol
 *  o'zgarishi esa yolg'iz DB yozuvi emas — u authz keshini ham
 *  bekor qilishi SHART (`AuthzService.invalidate`, 60s TTL). Bu ikki
 *  qadamni bir joyda ushlab turish yagona yo'l: aks holda kelajakda
 *  boshqa chaqiruvchi keshni unutib, foydalanuvchi bir daqiqa davomida
 *  eski huquqlar bilan yurardi.
 *
 *  Shu sababli `/admin/users` endpointlari ham shu modulda
 *  (`admin/` moduli faqat audit logni ko'rsatadi).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class UserAdminRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    filter: AdminUserFilter,
    first: number,
    afterId: string | null,
  ): Promise<AdminUserRow[]> {
    const search = filter.search?.trim() ?? '';

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filter.status !== undefined && { status: filter.status }),
      ...(filter.role !== undefined && { roles: { some: { role: filter.role } } }),
      ...(afterId !== null && { id: { gt: afterId } }),
      ...(search === ''
        ? {}
        : {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { player: { firstName: { contains: search, mode: 'insensitive' } } },
              { player: { lastName: { contains: search, mode: 'insensitive' } } },
            ],
          }),
    };

    const rows = await this.prisma.user.findMany({
      where,
      include: {
        roles: true,
        player: { select: { firstName: true, lastName: true } },
      },
      // UUID v7 vaqt-tartibli — cursor pagination shu ustunda.
      orderBy: { id: 'asc' },
      take: first + 1,
    });

    return rows.map(toRow);
  }

  async findById(id: string): Promise<AdminUserRow | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: true, player: { select: { firstName: true, lastName: true } } },
    });
    return row === null ? null : toRow(row);
  }

  async findAssignment(assignmentId: string): Promise<(AdminRoleRow & { userId: string }) | null> {
    const row = await this.prisma.userRole.findUnique({ where: { id: assignmentId } });
    return row === null ? null : { ...toRoleRow(row), userId: row.userId };
  }

  /**
   * GLOBAL superadminlar soni — qulflanib qolishning oldini olish uchun.
   *
   * `scopeType: null` sharti MUHIM: turnirga biriktirilgan yoki boshqa
   * scope'dagi qator global boshqaruv huquqini bermaydi, ya'ni uni
   * sanashga qo'shish "yana superadmin bor" degan yolg'on beradi.
   */
  async countGlobalSuperAdmins(): Promise<number> {
    return await this.prisma.userRole.count({
      where: {
        role: 'SUPER_ADMIN',
        scopeType: null,
        user: { deletedAt: null, status: 'ACTIVE' },
      },
    });
  }

  // --- Yozish (har biri AUDIT bilan, sabab MAJBURIY) ----------------------------

  async grant(input: {
    userId: string;
    role: Role;
    scope: ScopeRef;
    expiresAt: Date | null;
    actorUserId: string;
    reason: string;
  }): Promise<AdminRoleRow> {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.userRole.create({
        data: {
          userId: input.userId,
          role: input.role,
          scopeType: input.scope.scopeType,
          scopeId: input.scope.scopeId,
          expiresAt: input.expiresAt,
          grantedBy: input.actorUserId,
        },
      });
      await this.audit.write(tx, {
        action: 'role.granted',
        actorUserId: input.actorUserId,
        resourceType: 'UserRole',
        resourceId: row.id,
        reason: input.reason,
        after: {
          userId: input.userId,
          role: input.role,
          scopeType: input.scope.scopeType,
          scopeId: input.scope.scopeId,
        },
      });
      return toRoleRow(row);
    });
  }

  async revoke(assignmentId: string, actorUserId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.userRole.findUnique({ where: { id: assignmentId } });
      await tx.userRole.delete({ where: { id: assignmentId } });
      await this.audit.write(tx, {
        action: 'role.revoked',
        actorUserId,
        resourceType: 'UserRole',
        resourceId: assignmentId,
        reason,
        ...(before === null
          ? {}
          : {
              before: {
                userId: before.userId,
                role: before.role,
                scopeType: before.scopeType,
                scopeId: before.scopeId,
              },
            }),
      });
    });
  }

  async setStatus(input: {
    userId: string;
    status: UserStatus;
    actorUserId: string;
    reason: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: input.userId },
        select: { status: true },
      });
      await tx.user.update({ where: { id: input.userId }, data: { status: input.status } });

      // Bloklangan foydalanuvchining SESSIYALARI ham yopiladi.
      //
      // Busiz `status` tekshiruvi faqat KEYINGI login'da ishlardi
      // (auth.service.ts) — bloklangan odam esa mavjud refresh
      // token bilan yana 15 daqiqa (access token muddati) va undan
      // keyin ham refresh orqali ishlab yuraverardi.
      if (input.status !== 'ACTIVE') {
        await tx.refreshToken.updateMany({
          where: { userId: input.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.audit.write(tx, {
        action: 'user.status_changed',
        actorUserId: input.actorUserId,
        resourceType: 'User',
        resourceId: input.userId,
        reason: input.reason,
        ...(before === null ? {} : { before: { status: before.status } }),
        after: { status: input.status },
      });
    });
  }

  /** Platforma xulosasi — ma'muriy boshqaruv sahifasining birinchi ekrani. */
  async stats(): Promise<Record<string, number>> {
    const [users, active, suspended, players, tournaments, activeGames, openCases] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
        this.prisma.user.count({
          where: { deletedAt: null, status: { in: ['SUSPENDED', 'BANNED'] } },
        }),
        this.prisma.player.count({ where: { deletedAt: null } }),
        this.prisma.tournament.count(),
        this.prisma.onlineGame.count({ where: { status: 'ACTIVE' } }),
        this.prisma.fairPlayCase.count({ where: { status: 'OPEN' } }),
      ]);

    return { users, active, suspended, players, tournaments, activeGames, openCases };
  }
}

function toRow(row: {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  totpEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  player: { firstName: string; lastName: string } | null;
  roles: {
    id: string;
    role: string;
    scopeType: string | null;
    scopeId: string | null;
    expiresAt: Date | null;
    createdAt: Date;
  }[];
}): AdminUserRow {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    status: row.status as UserStatus,
    emailVerified: row.emailVerified,
    totpEnabled: row.totpEnabled,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    firstName: row.player?.firstName ?? null,
    lastName: row.player?.lastName ?? null,
    roles: row.roles.map(toRoleRow),
  };
}

function toRoleRow(row: {
  id: string;
  role: string;
  scopeType: string | null;
  scopeId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}): AdminRoleRow {
  return {
    id: row.id,
    role: row.role as Role,
    scopeType: row.scopeType as ScopeType | null,
    scopeId: row.scopeId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
