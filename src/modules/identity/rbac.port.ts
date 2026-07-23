import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { NotFoundError } from '../../core/errors/domain.error';
import type { AuthenticatedUser } from '../../shared/auth/authenticated-user';
import { AuthzService, type RoleAssignmentView } from './authz/authz.service';
import type {
  Action,
  Actor,
  ResourceType,
  Role,
  RoleAssignment,
  Scope,
} from './rbac/permission.types';
import { POLICY } from './rbac/policy.registry';

/**
 * Identity modulining RBAC porti — boshqa modullar FAQAT shu fayl orqali
 * avtorizatsiya oladi (docs/02-architecture.md §6.1, no-cross-module-internals).
 *
 * Ikki bosqichli tekshiruv (docs/10-security.md §3):
 *
 *  1. GUARD (shu yerda) — "bu rol bu amalni UMUMAN qila oladimi?"
 *     Resurs hali yuklanmagan, scope tekshirilmaydi.
 *
 *  2. SERVICE — "aynan SHU resurs ustidami?" — YUKLANGAN obyekt bilan
 *     `rbac.can(actor, action, resourceRef)`. Bu IDOR himoyasining
 *     asosiy qatlami; guard uni ALMASHTIRMAYDI.
 *
 * Ruxsat yo'q → 404 (403 emas): 403 resurs mavjudligini oshkor qiladi.
 * docs/04-api-spec.md §2.4
 */

export type {
  Action,
  Actor,
  ResourceRef,
  ResourceType,
  Role,
  RoleAssignment,
  Scope,
} from './rbac/permission.types';
export { RbacService } from './rbac/rbac.service';
export { AuthzService } from './authz/authz.service';

export const PERMISSION_KEY = 'rbac:permission';

export interface RequiredPermission {
  resource: ResourceType;
  action: Action;
}

/**
 * Endpoint'ga talab qo'yish:
 *
 *   @RequirePermission('Tournament', 'create')
 *   @Post()
 *   create(...) {}
 */
export const RequirePermission = (
  resource: ResourceType,
  action: Action,
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSION_KEY, { resource, action });

/**
 * `UserRole` qatorini domen `Scope` ga aylantirish.
 *
 * MUHIM: scopeType NULL bo'lsa:
 *  - SUPER_ADMIN → global (yagona chinakam global rol)
 *  - qolganlar   → own (xavfsiz default — noaniqlik = tor qamrov).
 *    PLAYER/PARENT/SPECTATOR uchun bu to'g'ri semantika; admin rollar
 *    esa HAR DOIM scopeType bilan beriladi, NULL — ma'lumot xatosi va
 *    u kengaytirilgan huquqqa AYLANMASLIGI kerak.
 */
export function toDomainAssignments(rows: readonly RoleAssignmentView[]): RoleAssignment[] {
  return rows.map((row) => {
    const role = row.role as Role;
    return { role, scope: toScope(role, row.scopeType, row.scopeId) };
  });
}

function toScope(role: Role, scopeType: string | null, scopeId: string | null): Scope {
  if (scopeType !== null && scopeId !== null) {
    switch (scopeType) {
      case 'FEDERATION':
        return { kind: 'federation', federationId: scopeId };
      case 'REGION':
        return { kind: 'region', regionId: scopeId };
      case 'CLUB':
        return { kind: 'club', clubId: scopeId };
      case 'TOURNAMENT':
        return { kind: 'tournament', tournamentId: scopeId };
      case 'SCHOOL':
        return { kind: 'school', schoolId: scopeId };
      default:
        return { kind: 'own' };
    }
  }
  return role === 'SUPER_ADMIN' ? { kind: 'global' } : { kind: 'own' };
}

/** Request'ga biriktirilgan aktor — service qatlami ishlatadi. */
export interface RequestWithActor {
  user?: AuthenticatedUser;
  actor?: Actor;
}

/**
 * Controller'da aktorni olish (RbacGuard biriktirgan):
 *
 *   @Patch(':id')
 *   update(@CurrentActor() actor: Actor, ...) {}
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest<RequestWithActor>();
    if (request.actor === undefined) {
      // JwtAuthGuard + RbacGuard dan o'tgan so'rovda aktor har doim bor.
      // Bu holat — guard tartibi buzilgani alomati.
      throw new Error("Aktor biriktirilmagan — guard tartibini tekshiring");
    }
    return request.actor;
  },
);

/**
 * Rol-darajali gate: aktorning BIRORTA amal qilmagan biriktirmasi shu
 * (resource, action) ga grant beradimi — scope'siz. Scope tekshiruvi
 * service qatlamida, yuklangan obyekt bilan.
 */
export function hasCapability(actor: Actor, action: Action, resource: ResourceType): boolean {
  const now = new Date();
  return actor.assignments.some((a) => {
    if (a.validUntil !== undefined && a.validUntil < now) {
      return false;
    }
    const grant = POLICY[a.role].find((g) => g.resource === resource);
    return grant?.actions.includes(action) ?? false;
  });
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const user = request.user;

    // Aktor har doim biriktiriladi (autentifikatsiya bo'lsa) —
    // service qatlami scope tekshiruvi uchun kerak.
    if (user !== undefined) {
      const rows = await this.authz.getAssignments(user.userId);
      request.actor = { userId: user.userId, assignments: toDomainAssignments(rows) };
    }

    if (required === undefined) {
      return true;
    }
    if (request.actor === undefined) {
      // Autentifikatsiyasiz ruxsat talab qilinmoqda — 404 siyosati.
      throw new NotFoundError(required.resource);
    }
    if (!hasCapability(request.actor, required.action, required.resource)) {
      // 403 EMAS — resurs mavjudligini oshkor qilmaymiz.
      throw new NotFoundError(required.resource);
    }
    return true;
  }
}
