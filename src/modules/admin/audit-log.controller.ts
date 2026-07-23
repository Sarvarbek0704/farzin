import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

import { NotFoundError } from '../../core/errors/domain.error';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  MAX_PAGE_SIZE,
  type Page,
  toPage,
} from '../../shared/pagination/cursor';
import { type Actor, CurrentActor, RequirePermission, RbacService } from '../identity/rbac.port';
import { AuditLogRepository, type AuditLogRow } from './audit-log.repository';

class ListAuditLogsQuery {
  @ApiPropertyOptional({ example: 'auth.login_failed' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ example: 'Club' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  first?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  after?: string;
}

/**
 * Audit log ko'rish — FAQAT O'QISH.
 *
 * Matritsada (docs/01-product-spec.md §4.1) AuditLog'ga hech kimda
 * C/U/D yo'q — SUPER_ADMIN'da ham. Yozish faqat tizim tomonidan
 * (AuditService), o'chirish DB trigger bilan taqiqlangan.
 *
 * TODO(Faza 0+): FED/REGION/CLUB adminlar uchun scoped ko'rish (R*) —
 * hozircha faqat global o'qish huquqi borlar (SUPER_ADMIN) ko'radi,
 * chunki scope filtri resurs ierarxiyasini bilishni talab qiladi.
 */
@ApiTags('admin')
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(
    private readonly auditLogs: AuditLogRepository,
    private readonly rbac: RbacService,
  ) {}

  @Get()
  @ApiBearerAuth('access-token')
  @RequirePermission('AuditLog', 'read')
  @ApiOperation({ summary: 'Audit loglar (filtr + cursor pagination)' })
  @ApiResponse({ status: 404, description: "Ruxsat yo'q (403 emas — oshkor qilmaslik)" })
  async list(
    @CurrentActor() actor: Actor,
    @Query() query: ListAuditLogsQuery,
  ): Promise<Page<AuditLogRow>> {
    // Scoped (R*) o'qish hali qo'llab-quvvatlanmaydi — global o'qish sharti.
    // ResourceRef'siz `can` scoped grant'ni rad etadi → faqat global R o'tadi.
    if (!this.rbac.can(actor, 'read', { type: 'AuditLog' })) {
      throw new NotFoundError('AuditLog');
    }

    const first = Math.min(Math.max(query.first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;

    const rows = await this.auditLogs.list(
      {
        action: query.action,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        actorUserId: query.actorUserId,
      },
      first,
      afterId,
    );

    return toPage(rows, first);
  }
}
