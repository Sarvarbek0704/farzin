import { Injectable } from '@nestjs/common';

import { BusinessRuleError, NotFoundError } from '../../../core/errors/domain.error';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  decodeCursor,
  toPage,
  type Page,
} from '../../../shared/pagination/cursor';
import { AuthzService } from '../authz/authz.service';
import type { Actor, Role } from '../rbac.port';
import {
  canChangeStatus,
  canGrant,
  canRevoke,
  type Decision,
  type GrantDenial,
  type ScopeRef,
} from './role-grant.rules';
import {
  UserAdminRepository,
  type AdminRoleRow,
  type AdminUserFilter,
  type AdminUserRow,
  type UserStatus,
} from './user-admin.repository';

/**
 * Foydalanuvchi va ROL boshqaruvi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU MODUL NEGA KERAK EDI
 *
 *  RBAC matritsasi to'liq yozilgan va CI bilan qo'riqlanadi, lekin
 *  unga ROL BERADIGAN yo'l umuman yo'q edi: rollar faqat `prisma/seed.ts`
 *  yoki qo'lda SQL bilan paydo bo'lardi. Ya'ni ishlab turgan
 *  platformada hakam tayinlab ham bo'lmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  IKKI QATLAMLI TEKSHIRUV:
 *   1. `@RequirePermission('User', ...)` — endpointga umuman kira
 *      oladimi (RbacGuard, controller darajasida);
 *   2. `role-grant.rules` — kira olgan odam AYNAN SHU rolni bera
 *      oladimi (delegatsiya zinasi, scope shakli, qulflanish himoyasi).
 *
 *  Ikkinchisisiz FEDERATION_ADMIN o'ziga SUPER_ADMIN bera olardi.
 */
@Injectable()
export class UserAdminService {
  constructor(
    private readonly repo: UserAdminRepository,
    private readonly authz: AuthzService,
  ) {}

  async list(
    filter: AdminUserFilter,
    first: number | undefined,
    after: string | undefined,
  ): Promise<Page<AdminUserRow>> {
    const pageSize = Math.min(Math.max(first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = after !== undefined ? decodeCursor(after) : null;
    const rows = await this.repo.list(filter, pageSize, afterId);
    return toPage(rows, pageSize);
  }

  async getById(userId: string): Promise<AdminUserRow> {
    const user = await this.repo.findById(userId);
    if (user === null) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  async stats(): Promise<Record<string, number>> {
    return await this.repo.stats();
  }

  async grantRole(
    actor: Actor,
    input: {
      userId: string;
      role: Role;
      scope: ScopeRef;
      expiresAt: Date | null;
      reason: string;
    },
  ): Promise<AdminRoleRow> {
    const target = await this.repo.findById(input.userId);
    if (target === null) {
      throw new NotFoundError('User', input.userId);
    }

    assertAllowed(canGrant(rolesOf(actor), input.role, input.scope));

    // Takroriy qator DB'da unikal cheklov bilan to'siladi
    // (@@unique([userId, role, scopeType, scopeId])), lekin
    // foydalanuvchiga tushunarli javob berish uchun oldindan aytamiz.
    const duplicate = target.roles.some(
      (r) =>
        r.role === input.role &&
        r.scopeType === input.scope.scopeType &&
        r.scopeId === input.scope.scopeId,
    );
    if (duplicate) {
      throw new BusinessRuleError('ROLE_ALREADY_GRANTED', 'Bu rol allaqachon berilgan');
    }

    const row = await this.repo.grant({
      userId: input.userId,
      role: input.role,
      scope: input.scope,
      expiresAt: input.expiresAt,
      actorUserId: actor.userId,
      reason: input.reason,
    });

    await this.invalidate(input.userId);
    return row;
  }

  async revokeRole(actor: Actor, assignmentId: string, reason: string): Promise<void> {
    const assignment = await this.repo.findAssignment(assignmentId);
    if (assignment === null) {
      throw new NotFoundError('UserRole', assignmentId);
    }

    assertAllowed(
      canRevoke(
        rolesOf(actor),
        {
          role: assignment.role,
          scope: { scopeType: assignment.scopeType, scopeId: assignment.scopeId },
        },
        await this.repo.countGlobalSuperAdmins(),
      ),
    );

    await this.repo.revoke(assignmentId, actor.userId, reason);
    await this.invalidate(assignment.userId);
  }

  async setStatus(
    actor: Actor,
    userId: string,
    status: Exclude<UserStatus, 'PENDING_VERIFICATION' | 'DELETED'>,
    reason: string,
  ): Promise<void> {
    const target = await this.repo.findById(userId);
    if (target === null) {
      throw new NotFoundError('User', userId);
    }

    const isGlobalSuperAdmin = target.roles.some(
      (r) => r.role === 'SUPER_ADMIN' && r.scopeType === null,
    );

    assertAllowed(
      canChangeStatus(
        actor.userId,
        { userId, isGlobalSuperAdmin },
        status,
        await this.repo.countGlobalSuperAdmins(),
      ),
    );

    await this.repo.setStatus({ userId, status, actorUserId: actor.userId, reason });
    await this.invalidate(userId);
  }

  /**
   * Authz keshini bekor qilish — HAR o'zgarishdan keyin.
   *
   * Kesh 60s TTL bilan ishlaydi (`authz.service.ts`). Tozalanmasa
   * yangi rol bir daqiqagacha ko'rinmaydi, bloklangan odam esa shuncha
   * vaqt eski huquqlari bilan yuraveradi — bu jimgina xavfsizlik
   * teshigi bo'lardi.
   */
  private async invalidate(userId: string): Promise<void> {
    await this.authz.invalidate(userId);
  }
}

/** Aktorning HOZIR amal qilayotgan rollari (muddati o'tganlari emas). */
function rolesOf(actor: Actor): Role[] {
  const now = Date.now();
  return actor.assignments
    .filter((a) => a.validUntil === undefined || a.validUntil.getTime() > now)
    .map((a) => a.role);
}

function assertAllowed(decision: Decision): void {
  if (decision.ok) {
    return;
  }
  throw new BusinessRuleError(decision.reason, MESSAGES[decision.reason]);
}

const MESSAGES: Record<GrantDenial, string> = {
  ROLE_NOT_DELEGABLE: 'Bu rolni berish yoki olib tashlash huquqingiz yo`q',
  SCOPE_REQUIRED: 'Bu rol uchun qamrov (klub, viloyat, turnir) ko`rsatilishi shart',
  SCOPE_NOT_ALLOWED: 'Bu rol uchun bunday qamrov turi mos emas',
  SCOPE_ID_REQUIRED: 'Qamrov turi berilgan, lekin uning ID`si yo`q',
  SCOPE_ID_NOT_ALLOWED: 'Bu rol global — qamrov ID`si berilmasin',
  LAST_SUPER_ADMIN: 'Oxirgi superadminni olib tashlab yoki bloklab bo`lmaydi',
  SELF_LOCKOUT: 'O`zingizni bloklay olmaysiz',
};
