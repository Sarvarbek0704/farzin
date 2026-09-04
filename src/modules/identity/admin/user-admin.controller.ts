import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { NotFoundError } from '../../../core/errors/domain.error';
import type { Page } from '../../../shared/pagination/cursor';
import { type Actor, CurrentActor, RbacService, RequirePermission } from '../rbac.port';
import {
  GrantRoleDto,
  ListAdminUsersQuery,
  RevokeRoleDto,
  SetUserStatusDto,
} from './dto/admin-user.dto';
import type { AdminRoleRow, AdminUserRow } from './user-admin.repository';
import { UserAdminService } from './user-admin.service';

/**
 * Superadmin — foydalanuvchi va ROL boshqaruvi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA GLOBAL HUQUQ TALAB QILINADI
 *
 *  `RbacService.can` `ResourceRef` siz chaqirilganda scoped grant'ni
 *  RAD ETADI — ya'ni bu tekshiruvdan faqat GLOBAL `User` huquqiga ega
 *  aktor o'tadi. Amalda bu SUPER_ADMIN.
 *
 *  Federatsiya/viloyat/klub adminiga delegatsiya ATAYLAB ochilmagan:
 *  u "bu klub shu viloyatdami?" degan ierarxiya yurishini talab
 *  qiladi, u esa hali yozilmagan. Yarim ishlaydigan scope tekshiruvi
 *  yo'qidan xavfliroq — u ruxsat berayotgandek ko'rinib, aslida
 *  chegarani qo'riqlamasdi. Zina `role-grant.rules.ts` da TA'RIF
 *  sifatida tayyor turibdi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Har YOZUV amali sabab talab qiladi va audit'ga tushadi
 *  (`role.granted`, `role.revoked`, `user.status_changed` —
 *  `AuditService` ularni REASON_REQUIRED ro'yxatida ushlaydi).
 */
@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin/users')
export class UserAdminController {
  constructor(
    private readonly users: UserAdminService,
    private readonly rbac: RbacService,
  ) {}

  @Get()
  @RequirePermission('User', 'read')
  @ApiOperation({ summary: "Foydalanuvchilar — qidiruv, rol va holat bo'yicha filtr" })
  @ApiResponse({ status: 404, description: "Ruxsat yo'q (403 emas — oshkor qilmaslik)" })
  async list(
    @CurrentActor() actor: Actor,
    @Query() query: ListAdminUsersQuery,
  ): Promise<Page<AdminUserRow>> {
    this.assertGlobal(actor, 'read');
    return await this.users.list(
      { search: query.search, status: query.status, role: query.role },
      query.first,
      query.after,
    );
  }

  @Get('stats')
  @RequirePermission('User', 'read')
  @ApiOperation({ summary: 'Platforma xulosasi — ma`muriy bosh sahifa' })
  async stats(@CurrentActor() actor: Actor): Promise<Record<string, number>> {
    this.assertGlobal(actor, 'read');
    return await this.users.stats();
  }

  @Get(':id')
  @RequirePermission('User', 'read')
  @ApiOperation({ summary: 'Bitta foydalanuvchi — rollari bilan' })
  async getById(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserRow> {
    this.assertGlobal(actor, 'read');
    return await this.users.getById(id);
  }

  @Post(':id/roles')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('User', 'update')
  @ApiOperation({ summary: 'Rol berish — sabab MAJBURIY' })
  @ApiResponse({ status: 422, description: 'Delegatsiya huquqi yo`q / qamrov mos emas' })
  async grant(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantRoleDto,
  ): Promise<AdminRoleRow> {
    this.assertGlobal(actor, 'update');
    return await this.users.grantRole(actor, {
      userId: id,
      role: dto.role,
      scope: { scopeType: dto.scopeType ?? null, scopeId: dto.scopeId ?? null },
      expiresAt: dto.expiresAt === undefined ? null : new Date(dto.expiresAt),
      reason: dto.reason,
    });
  }

  /**
   * Rolni olib tashlash.
   *
   * `DELETE` tanasi bilan — sabab MAJBURIY va uni yo'lga (URL) qo'yib
   * bo'lmaydi: sabab erkin matn va u server loglariga tushmasligi kerak.
   */
  @Delete('roles/:assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('User', 'update')
  @ApiOperation({ summary: 'Rolni olib tashlash — sabab MAJBURIY' })
  @ApiResponse({ status: 422, description: 'Oxirgi superadmin / huquq yo`q' })
  async revoke(
    @CurrentActor() actor: Actor,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: RevokeRoleDto,
  ): Promise<void> {
    this.assertGlobal(actor, 'update');
    await this.users.revokeRole(actor, assignmentId, dto.reason);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('User', 'update')
  @ApiOperation({ summary: 'Hisobni bloklash yoki tiklash — sabab MAJBURIY' })
  @ApiResponse({ status: 422, description: 'O`zini bloklash / oxirgi superadmin' })
  async setStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
  ): Promise<void> {
    this.assertGlobal(actor, 'update');
    await this.users.setStatus(actor, id, dto.status, dto.reason);
  }

  /**
   * GLOBAL huquq sharti.
   *
   * `@RequirePermission` guard'i scoped grant bilan ham o'tkazib
   * yuborishi mumkin; bu yerda `ResourceRef` bermay chaqiramiz va
   * shu bilan faqat global grant qoladi. Ruxsat yo'q — 404
   * (docs/04-api-spec.md §2.4: resurs mavjudligi oshkor bo'lmasin).
   */
  private assertGlobal(actor: Actor, action: 'read' | 'update'): void {
    if (!this.rbac.can(actor, action, { type: 'User' })) {
      throw new NotFoundError('User');
    }
  }
}
